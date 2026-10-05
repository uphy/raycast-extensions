import { getDefaultApplication, open } from "@raycast/api";
import { execFile } from "child_process";
import { access, constants } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
import { Task, vaultPath } from "./index-file";
import { environment } from "./process";

// vault 側の1枚 HTML ビュー（`tasks/タスクビュー.html`）を、タスクとタブを指定して開く層。
//
// HTML は状態を URL の hash に `encodeURIComponent(JSON.stringify(S))` で持ち、読むときは
// `Object.assign(S, parsed)` なので**部分 JSON でよい**。`{tab, sel}` だけ渡せば残りは既定のまま。
//
// **`open` コマンドでは hash が落ちる**。macOS の LaunchServices は `file:` URL をパスへ畳んで
// アプリに渡すため、`open 'file:///…#…'`（および AppleScript の素の `open location`）だと
// fragment が消える（実測: `#zzz` を付けて開いても `location.hash` が空）。アプリを名指しした
// `tell application id "…" to open location "…"` なら fragment ごと届くので、既定ブラウザを
// `getDefaultApplication` で引いてから osascript で渡す。

const execFileAsync = promisify(execFile);

const TASK_VIEW_RELATIVE_PATH = "tasks/タスクビュー.html";

/** HTML 側の `S.tab` の値。 */
export type TaskViewTab = "today" | "tree" | "gantt" | "deps" | "load";

export const TASK_VIEW_TAB_LABEL: Record<TaskViewTab, string> = {
  today: "今日",
  tree: "木",
  gantt: "ガント",
  deps: "依存図",
  load: "負荷",
};

export class TaskViewMissingError extends Error {
  constructor(readonly path: string) {
    super("タスクビュー.html がありません");
    this.name = "TaskViewMissingError";
  }
}

export function taskViewPath(): string {
  return join(vaultPath(), TASK_VIEW_RELATIVE_PATH);
}

/** `file://…#<部分Sの JSON>`。パスは日本語を含むのでセグメントごとにエンコードする。 */
export function taskViewUrl(state: { tab: TaskViewTab; sel?: string }): string {
  const encodedPath = taskViewPath().split("/").map(encodeURIComponent).join("/");
  const hash = encodeURIComponent(JSON.stringify(state));
  return `file://${encodedPath}#${hash}`;
}

/** タスクを選択した状態で HTML ビューを開く。task 省略で選択なし。 */
export async function openTaskView(tab: TaskViewTab, task?: Task): Promise<void> {
  const path = taskViewPath();
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new TaskViewMissingError(path);
  }

  const url = taskViewUrl(task ? { tab, sel: task.key } : { tab });
  try {
    const browser = await getDefaultApplication(path);
    const target = browser.bundleId
      ? `id "${escapeAppleScript(browser.bundleId)}"`
      : `"${escapeAppleScript(browser.name)}"`;
    const selectTab = CHROMIUM_BUNDLE_IDS.get(browser.bundleId ?? "");
    const script = selectTab
      ? reuseTabScript(target, url, selectTab)
      : `tell application ${target} to open location "${escapeAppleScript(url)}"`;
    await execFileAsync("/usr/bin/osascript", ["-e", script], { encoding: "utf8", env: environment() });
  } catch {
    // ブラウザに直接渡せなかったときは開くこと自体を優先する。hash は落ちるので
    // 既定タブ（今日）が出るが、何も起きないよりはよい。
    await open(url);
  }
}

/**
 * `tabs of windows` と `set URL of tab` が効く Chromium 系と、タブを前面にする書き方。
 * Arc は `select`、Chrome 系は `active tab index`。辞書に無い語は AppleScript のコンパイルで
 * 落ちる（実測: Arc に `active tab index` を書くと構文エラー）ので、try で吸収せず出し分ける。
 */
const CHROMIUM_BUNDLE_IDS = new Map<string, string>([
  ["company.thebrowser.Browser", "tell t to select"],
  ["com.google.Chrome", "set active tab index of w to i"],
  ["com.brave.Browser", "set active tab index of w to i"],
]);

/**
 * 既に開いているタスクビューのタブがあればそれを使い回す（URL を差し替えて前面へ出し、
 * 状態は hash から読み直させるため reload する）。無いときだけ新しいタブを開く。
 * 押すたびにタブが増えて残るのを避けるため。
 */
function reuseTabScript(target: string, url: string, selectTab: string): string {
  const prefix = escapeAppleScript(`file://${taskViewPath().split("/").map(encodeURIComponent).join("/")}`);
  return `tell application ${target}
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      if URL of t starts with "${prefix}" then
        set URL of t to "${escapeAppleScript(url)}"
        ${selectTab}
        tell t to reload
        activate
        return
      end if
    end repeat
  end repeat
  open location "${escapeAppleScript(url)}"
end tell`;
}

function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
