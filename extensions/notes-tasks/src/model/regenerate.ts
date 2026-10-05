import { execFile } from "child_process";
import { promisify } from "util";
import { vaultPath } from "./index-file";
import { environment, resolveBinary } from "./process";

// 索引と HTML ビューの再生成を Raycast から起こす層。
//
// **これは「vault を書かない」方針の例外ではない**。走らせるのは vault 側の決定論スクリプト2本で、
// どちらもタスクファイルには触らず派生物（`.index.json` / `今日の候補.md` / `タスクビュー.html`）
// だけを書く。タスクの状態を変えたいときは今までどおり herdr 経由で task-manage に頼む。
//
// 普段は vault の PostToolUse hook が同じ2本を回すので、ここが要るのは日付をまたいで
// 索引が古くなったときと、Obsidian を開かずに Raycast だけで作業を始めたいときだけ。

const execFileAsync = promisify(execFile);

/** 2本合わせても実測 0.3 秒ほど。固まったときに Raycast を待たせ続けないための上限。 */
const TIMEOUT_MS = 30000;

/** stderr は toast の message に出すので、頭だけ見せて残りは捨てる。 */
const STDERR_MAX = 200;

/** 索引が無い・古いときに案内するコマンド（vault ルートで実行する）。 */
export const REGENERATE_COMMAND = "python3 tasks/_scripts/today.py --write && python3 tasks/_scripts/gen_html.py";

const STEPS: { label: string; args: string[] }[] = [
  { label: "索引", args: ["tasks/_scripts/today.py", "--write"] },
  { label: "HTMLビュー", args: ["tasks/_scripts/gen_html.py"] },
];

export type RegenerateResult = {
  /** 2本の stderr を繋いだもの（先頭 200 文字）。空なら何も言わなかったということ。 */
  stderr: string;
};

/** `today.py --write` → `gen_html.py` を vault を cwd にして順に走らせる。 */
export async function regenerateIndex(): Promise<RegenerateResult> {
  const python = await resolveBinary("python3");
  const cwd = vaultPath();
  const notices: string[] = [];

  for (const step of STEPS) {
    try {
      const { stderr } = await execFileAsync(python, step.args, {
        cwd,
        encoding: "utf8",
        env: environment(),
        timeout: TIMEOUT_MS,
      });
      if (stderr.trim()) {
        notices.push(stderr.trim());
      }
    } catch (error) {
      const detail = (error as { stderr?: string }).stderr?.trim() || String(error);
      throw new Error(`${step.label}の再生成に失敗しました: ${truncate(detail)}`);
    }
  }

  return { stderr: truncate(notices.join("\n")) };
}

function truncate(text: string): string {
  return text.length > STDERR_MAX ? `${text.slice(0, STDERR_MAX)}…` : text;
}
