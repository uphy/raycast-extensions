import { getPreferenceValues } from "@raycast/api";
import { execFile } from "child_process";
import { access, constants } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
import { Task, vaultPath } from "./index-file";

// herdr（AIコーディングエージェント向けの terminal workspace manager）へタスクを渡す層。
//
// CLI はサーバの socket API（`~/.config/herdr/herdr.sock`）に繋ぐだけの薄いフロントで、どの
// サブコマンドも1行の JSON を stdout に返す（成功は `{id,result}`、失敗は `{id,error}` ＋ exit 1）。
// 環境変数には依存しない（実測: `env -i PATH=/usr/bin:/bin herdr workspace list` が通る）ので、
// Raycast 側で面倒を見るのは PATH だけでよい。
//
// **この extension は vault を書かないという方針をここでも守る**。タスクの状態変更は索引にも
// タスクファイルにも書かず、新しいタブで起動したエージェントに `/task-manage` を投げて、vault 側の
// 唯一の writer（`task-manager` subagent）に委ねる。ここが持つのは「どこに」「何を」投げるかだけ。

const execFileAsync = promisify(execFile);

/** agent 起動が対話プロンプトに到達するまでの待ち時間。CLI 側の上限は 300000。 */
const AGENT_START_TIMEOUT_MS = 60000;

/** 設定が空でも見に行く場所。Homebrew の既定（Apple silicon / Intel）。 */
const FALLBACK_PATH_ENV = "/opt/homebrew/bin:/usr/local/bin";

/**
 * 作ったばかりのタブは shell がまだプロンプトに達しておらず、`agent start` が
 * `agent_pane_busy` で弾かれる。実測では 1 回待てば通るが、shell の初期化が重いこともあるので
 * 短い間隔で叩き直しながら待つ。
 */
const SHELL_RETRY_INTERVAL_MS = 250;
const SHELL_READY_TIMEOUT_MS = 10000;

type Preferences = {
  herdrWorkspace?: string;
  herdrAgentKind?: string;
  pathEnv?: string;
};

/** タスクに対して投げる `/task-manage` の subcommand。 */
export type TaskAction = "run" | "close";

const PROMPT: Record<TaskAction, (task: Task) => string> = {
  run: (task) => `/task-manage run ${task.title}`,
  close: (task) => `/task-manage close ${task.title}`,
};

export const ACTION_LABEL: Record<TaskAction, string> = {
  run: "開始",
  close: "終了",
};

export type DispatchedSession = {
  tabId: string;
  paneId: string;
  workspaceLabel: string;
  agentKind: string;
  prompt: string;
};

type Envelope<T> = { id: string; result: T } | { id: string; error: { code: string; message: string } };

type Workspace = { workspace_id: string; label: string };

type TabCreated = {
  tab: { tab_id: string; label: string };
  root_pane: { pane_id: string };
};

export class HerdrError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HerdrError";
  }
}

/**
 * タスク用のタブを立て、エージェントを起動して `/task-manage` を投げる。
 * cwd は常に vault（タスクシステムの skill がそこにあるため）。
 */
export async function dispatchTask(task: Task, action: TaskAction): Promise<DispatchedSession> {
  const { herdrWorkspace, herdrAgentKind } = getPreferenceValues<Preferences>();
  const workspaceLabel = herdrWorkspace?.trim() || "obsidian-layerx";
  const agentKind = herdrAgentKind?.trim() || "claude";
  const cwd = vaultPath();

  const workspaceId = await resolveWorkspace(workspaceLabel, cwd);
  const created = await herdr<TabCreated>([
    "tab",
    "create",
    "--workspace",
    workspaceId,
    "--cwd",
    cwd,
    "--label",
    task.title,
    "--focus",
  ]);
  const { pane_id: paneId } = created.root_pane;
  const prompt = PROMPT[action](task);

  try {
    await startAgent(paneId, agentKind);
    // 宛先は agent 名ではなく pane id。同じタスクのタブが並んでも取り違えない。
    await herdr(["agent", "prompt", paneId, prompt]);
  } catch (error) {
    // 起動途中で落ちた空タブを残さない。後始末の失敗は元のエラーを隠さないよう黙って捨てる。
    await herdr(["tab", "close", created.tab.tab_id]).catch(() => undefined);
    throw error;
  }

  return { tabId: created.tab.tab_id, paneId, workspaceLabel, agentKind, prompt };
}

/** shell が立ち上がるのを待ちながらエージェントを起動する。 */
async function startAgent(paneId: string, agentKind: string): Promise<void> {
  const args = [
    "agent",
    "start",
    agentName(paneId),
    "--kind",
    agentKind,
    "--pane",
    paneId,
    "--timeout",
    String(AGENT_START_TIMEOUT_MS),
  ];
  const deadline = Date.now() + SHELL_READY_TIMEOUT_MS;
  for (;;) {
    try {
      await herdr(args);
      return;
    } catch (error) {
      const busy = error instanceof HerdrError && error.code === "agent_pane_busy";
      if (!busy || Date.now() >= deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, SHELL_RETRY_INTERVAL_MS));
    }
  }
}

/** label で workspace を引き、無ければ vault を cwd にして作る。 */
async function resolveWorkspace(label: string, cwd: string): Promise<string> {
  const { workspaces } = await herdr<{ workspaces: Workspace[] }>(["workspace", "list"]);
  const found = workspaces.find((workspace) => workspace.label === label);
  if (found) {
    return found.workspace_id;
  }
  const created = await herdr<{ workspace: Workspace }>([
    "workspace",
    "create",
    "--cwd",
    cwd,
    "--label",
    label,
    "--no-focus",
  ]);
  return created.workspace.workspace_id;
}

/**
 * herdr の agent 名は `^[a-z][a-z0-9_-]{1,32}$` しか通らないので、日本語のタスク名は使えない。
 * pane id（`wK:p4`）から作れば一意性もそのまま引き継げる。
 */
function agentName(paneId: string): string {
  return `task-${paneId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

async function herdr<T = unknown>(args: string[]): Promise<T> {
  const command = await binary();
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(command, args, { encoding: "utf8", env: environment() }));
  } catch (error) {
    // CLI まで届いていれば error JSON が載っている。成功の result は stdout だが、
    // **失敗の error は stderr** に出る（`{"error":{"code",...}}`）。ここを取り違えると
    // エラーコードが拾えず、agent_pane_busy のような再試行できる失敗まで即死する。
    const output = (error as { stderr?: string }).stderr || (error as { stdout?: string }).stdout;
    if (output?.trim()) {
      return parse<T>(output);
    }
    throw new HerdrError(String(error), (error as NodeJS.ErrnoException).code);
  }
  return parse<T>(stdout);
}

let cachedBinary: string | undefined;

/**
 * herdr の実行ファイルを絶対パスで解決する。`execFile` の PATH 解決に任せず自分で探すのは、
 * Raycast がログインシェルの PATH を継承しないうえに、設定の既定値も既存インストールには
 * 後から効かないことがあるため。どこを探したかはエラーに載せる。
 */
async function binary(): Promise<string> {
  if (cachedBinary) {
    return cachedBinary;
  }
  const directories = searchDirectories();
  for (const directory of directories) {
    const candidate = join(directory, "herdr");
    try {
      await access(candidate, constants.X_OK);
      cachedBinary = candidate;
      return candidate;
    } catch {
      // 次の候補へ
    }
  }
  throw new HerdrError(`herdr が見つかりません（探した場所: ${directories.join(", ")}）`, "ENOENT");
}

function searchDirectories(): string[] {
  const { pathEnv } = getPreferenceValues<Preferences>();
  const directories = [pathEnv, FALLBACK_PATH_ENV, process.env.PATH]
    .flatMap((value) => (value ?? "").split(":"))
    .map((directory) => directory.trim())
    .filter((directory) => directory.length > 0);
  return [...new Set(directories)];
}

function parse<T>(stdout: string): T {
  let envelope: Envelope<T>;
  try {
    envelope = JSON.parse(stdout) as Envelope<T>;
  } catch {
    throw new HerdrError(`herdr の応答を解釈できません: ${stdout.trim().slice(0, 200)}`);
  }
  if ("error" in envelope) {
    throw new HerdrError(envelope.error.message, envelope.error.code);
  }
  return envelope.result;
}

/**
 * herdr 自体は環境変数に依存しないが、Raycast が注入する NODE_PATH / NODE_ENV は
 * 子プロセスの Node ツールチェインを壊すので落とす（ghq の `CommandRunner` と同じ理由）。
 */
function environment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: searchDirectories().join(":"),
    NODE_PATH: undefined,
    NODE_ENV: undefined,
  };
}
