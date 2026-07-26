import { getPreferenceValues } from "@raycast/api";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

// vault 側 `tasks/_scripts/tasklib.py` の dump_index() が吐く構造化索引を読むだけの層。
// 索引は「読み手に計算・整形を残さない」方針で作られているので、ここでは Markdown も
// frontmatter も wikilink も解釈しない。JSON.parse 一回で終わる。
//
// 索引を生成するのは vault 側の `today.py --write` で、タスク編集時の PostToolUse hook が
// 自動で回す。この extension は一切書き込まない。

/** 対応する索引の schema_version。vault 側の tasklib.INDEX_SCHEMA_VERSION と対で上げる。 */
export const SUPPORTED_SCHEMA_VERSION = 1;

const INDEX_RELATIVE_PATH = "tasks/_scripts/.index.json";

/** 索引が無い・古いときに案内するコマンド（vault ルートで実行する）。 */
export const REGENERATE_COMMAND = "python3 tasks/_scripts/today.py --write";

export type Checklist = {
  done: number;
  total: number;
};

export type Section = {
  name: string;
  text: string;
  checklist: Checklist | null;
};

export type Task = {
  key: string;
  title: string;
  project: string | null;
  status: string | null;
  priority: string | null;
  assignee: string | null;
  estimate: string | null;
  estimate_days: number | null;
  start: string | null;
  end: string | null;
  notion_id: string | null;
  notion_url: string | null;
  notion_sync: boolean;
  file_path: string;
  obsidian_uri: string;
  wikilink: string;
  depends_on: string[];
  /** このタスクが終わると着手可になる先（vault 側で depends_on を逆引き済み） */
  blocks: string[];
  parent_task: string | null;
  children: string[];
  tree_index: number | null;
  preamble: string;
  sections: Section[];
};

/** 順序の層。due=期日ドライバ / wip=仕掛かり / tree=木順。 */
export type TierCode = "due" | "wip" | "tree";

export type Candidate = {
  key: string;
  rank: number;
  tier: number;
  tier_code: TierCode;
  estimate_days: number | null;
  cumulative_days: number;
  overdue: boolean;
  stale_days: number | null;
  in_tree: boolean;
};

export type Upcoming = {
  key: string;
  kind: "starting" | "due_but_blocked";
  date: string;
  blocked_by?: string[];
};

export type ExcludedReasonCode =
  "backlog" | "other_assignee" | "split_parent" | "blocked_by_deps" | "status_blocked" | "status_other" | "not_started";

export type Excluded = {
  key: string;
  reason_code: ExcludedReasonCode;
  /** vault 側が組み立てた日本語の理由（そのまま出す） */
  reason: string;
  blocked_by: string[];
};

export type Today = {
  base_date: string;
  horizon_days: number;
  stale_days: number;
  candidates: Candidate[];
  total_estimate_days: number;
  capacity: { hours: number; budget_days: number; fit_count: number } | null;
  stale: { key: string; days: number }[];
  upcoming: Upcoming[];
  excluded: Excluded[];
};

export type TaskIndex = {
  schema_version: number;
  generated_at: string;
  vault: { name: string; path: string };
  projects: { name: string; task_count: number }[];
  tasks: Task[];
  today: Today;
};

export type IndexLoad =
  | {
      ok: true;
      index: TaskIndex;
      byKey: Map<string, Task>;
      indexPath: string;
      /** 索引の基準日が今日と違う＝hook が回っておらず候補が古い */
      stale: boolean;
    }
  | {
      ok: false;
      reason: "missing" | "unreadable" | "schema";
      detail: string;
      indexPath: string;
    };

/** 読み込みに成功した索引。UI 側はこの型だけを受け取る。 */
export type LoadedIndex = Extract<IndexLoad, { ok: true }>;

export function vaultPath(): string {
  const configured = getPreferenceValues<{ vaultPath?: string }>().vaultPath?.trim();
  const path = configured && configured.length > 0 ? configured : "~/dev/notes";
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

/** タスクファイルの絶対パス。索引は vault 相対で持つので、開く操作のときだけ繋ぐ。 */
export function absolutePath(index: TaskIndex, task: Task): string {
  return join(index.vault.path, task.file_path);
}

function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export async function loadIndex(): Promise<IndexLoad> {
  const indexPath = join(vaultPath(), INDEX_RELATIVE_PATH);
  let raw: string;
  try {
    raw = await readFile(indexPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      ok: false,
      reason: code === "ENOENT" ? "missing" : "unreadable",
      detail: code === "ENOENT" ? "索引ファイルがありません" : String(error),
      indexPath,
    };
  }

  let index: TaskIndex;
  try {
    index = JSON.parse(raw) as TaskIndex;
  } catch (error) {
    return { ok: false, reason: "unreadable", detail: String(error), indexPath };
  }

  if (index.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "schema",
      detail: `索引は schema_version ${index.schema_version}、この extension は ${SUPPORTED_SCHEMA_VERSION} に対応`,
      indexPath,
    };
  }

  return {
    ok: true,
    index,
    byKey: new Map(index.tasks.map((task) => [task.key, task])),
    indexPath,
    stale: index.today.base_date !== localDate(),
  };
}
