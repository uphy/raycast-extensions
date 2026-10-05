import { getPreferenceValues } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { Task, vaultPath } from "./index-file";
import { BinaryNotFoundError, environment, resolveBinary } from "./process";

// herdr（AIコーディングエージェント向けの terminal workspace manager）へタスクを渡す層。
//
// CLI はサーバの socket API（`~/.config/herdr/herdr.sock`）に繋ぐだけの薄いフロントで、どの
// サブコマンドも1行の JSON を stdout に返す（成功は `{id,result}`、失敗は `{id,error}` ＋ exit 1）。
// 環境変数には依存しない（実測: `env -i PATH=/usr/bin:/bin herdr workspace list` が通る）ので、
// Raycast 側で面倒を見るのは PATH だけでよい。
//
// **この extension は vault を書かないという方針をここでも守る**。タスクの状態変更は索引にも
// タスクファイルにも書かず、新しいタブで起動したエージェントに `/task-manage` を投げて、vault 側の
// 唯一の書き換え経路（`task-manage` skill の items モード）に委ねる。ここが持つのは
// 「どこに」「何を」投げるかだけ。

const execFileAsync = promisify(execFile);

/** agent 起動が対話プロンプトに到達するまでの待ち時間。CLI 側の上限は 300000。 */
const AGENT_START_TIMEOUT_MS = 60000;

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

/**
 * タスクを指さない `/task-manage` のモード。subcommand の綴りは vault 側の
 * `.claude/skills/task-manage/SKILL.md` の Subcommands 表が正典（`plan` / `routine` / `wrap` /
 * `list`。`planning` や `query` ではない）。
 */
export type ManageMode = "plan" | "routine" | "wrap" | "list";

export const MANAGE_MODE: Record<ManageMode, { label: string; prompt: string }> = {
  plan: { label: "朝の計画", prompt: "/task-manage plan" },
  routine: { label: "日次ルーチン", prompt: "/task-manage routine" },
  wrap: { label: "セッション終了", prompt: "/task-manage wrap" },
  list: { label: "棚卸し", prompt: "/task-manage list" },
};

/** 新規タスクの追加は items モードの `add`（`create` という subcommand は無い）。 */
export function createTaskPrompt(title: string, project?: string, memo?: string): string {
  const lines = [`/task-manage add ${title.trim()}`];
  if (project?.trim()) {
    lines.push(`project: ${project.trim()}`);
  }
  if (memo?.trim()) {
    lines.push(memo.trim());
  }
  return lines.join("\n");
}

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
 *
 * `note` を渡すと prompt の末尾に改行して添える。着手の合図と一緒に「今日はここまで」のような
 * 前置きを渡せるようにするためで、vault を書かないという方針は変わらない（依頼文が増えるだけ）。
 */
export async function dispatchTask(task: Task, action: TaskAction, note?: string): Promise<DispatchedSession> {
  const prompt = PROMPT[action](task) + (note?.trim() ? `\n${note.trim()}` : "");
  return dispatchPrompt(task.title, prompt);
}

/**
 * タブを立ててエージェントを起動し、任意の prompt を投げる。タスクに紐付かない
 * `/task-manage plan` のようなモード起動もここを通る。`label` はタブの見出し（日本語可）。
 */
export async function dispatchPrompt(label: string, prompt: string): Promise<DispatchedSession> {
  const { herdrWorkspace, herdrAgentKind } = getPreferenceValues<Preferences>();
  const workspaceLabel = herdrWorkspace?.trim() || "obsidian-layerx";
  const agentKind = herdrAgentKind?.trim() || "claude";
  const cwd = vaultPath();

  // workspace を新しく作ると空のタブ「1」が一緒にできる。その上に tab create すると
  // 空タブが残るので、作った直後はその初期タブを名前だけ付け替えて使う。
  const resolved = await resolveWorkspace(workspaceLabel, cwd);
  const created = resolved.initialTab
    ? await renameTab(resolved.initialTab, label)
    : await herdr<TabCreated>([
        "tab",
        "create",
        "--workspace",
        resolved.workspaceId,
        "--cwd",
        cwd,
        "--label",
        label,
        "--focus",
      ]);
  const { pane_id: paneId } = created.root_pane;

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
type ResolvedWorkspace = {
  workspaceId: string;
  /** いま作ったばかりの workspace に付いてきた初期タブ。既存 workspace なら無い。 */
  initialTab?: TabCreated;
};

async function resolveWorkspace(label: string, cwd: string): Promise<ResolvedWorkspace> {
  const { workspaces } = await herdr<{ workspaces: Workspace[] }>(["workspace", "list"]);
  const found = workspaces.find((workspace) => workspace.label === label);
  if (found) {
    return { workspaceId: found.workspace_id };
  }
  const created = await herdr<TabCreated & { workspace: Workspace }>([
    "workspace",
    "create",
    "--cwd",
    cwd,
    "--label",
    label,
    "--focus",
  ]);
  return {
    workspaceId: created.workspace.workspace_id,
    initialTab: { tab: created.tab, root_pane: created.root_pane },
  };
}

/** 初期タブ「1」にタスク名を付ける。戻り値は tab create と同じ形に揃える。 */
async function renameTab(initial: TabCreated, label: string): Promise<TabCreated> {
  const { tab } = await herdr<{ tab: TabCreated["tab"] }>(["tab", "rename", initial.tab.tab_id, label]);
  await herdr(["tab", "focus", tab.tab_id]).catch(() => undefined);
  return { tab, root_pane: initial.root_pane };
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

/** herdr の実行ファイル。PATH の自前解決は `process.ts` が持つ。 */
async function binary(): Promise<string> {
  try {
    return await resolveBinary("herdr");
  } catch (error) {
    if (error instanceof BinaryNotFoundError) {
      throw new HerdrError(error.message, "ENOENT");
    }
    throw error;
  }
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
