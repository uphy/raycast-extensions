import { Color, Icon, Image } from "@raycast/api";
import { Checklist, ExcludedReasonCode, Section, Task, TierCode } from "./index-file";

// 索引は表示用の文字列（絵文字・`⏰07/24⚠超過` など）を持たない。表示都合を vault 側へ
// 漏らさないための線引きなので、コード・日付・数値をアイコンやラベルへ写すのはこちら側の責務。

const PRIORITY_COLOR: Record<string, Color> = {
  Critical: Color.Red,
  High: Color.Orange,
  Mid: Color.Yellow,
  Low: Color.Green,
};

/** priority は External 取り込みタスクだと取り込み元DBの語彙（Very High 等）が混ざる。 */
export function priorityColor(priority: string | null): Color {
  return (priority && PRIORITY_COLOR[priority]) || Color.SecondaryText;
}

const STATUS_ICON: Record<string, Image.ImageLike> = {
  todo: { source: Icon.Circle, tintColor: Color.SecondaryText },
  in_progress: { source: Icon.CircleProgress50, tintColor: Color.Blue },
  blocked: { source: Icon.MinusCircle, tintColor: Color.Orange },
  closed: { source: Icon.CheckCircle, tintColor: Color.Green },
};

export function statusIcon(status: string | null): Image.ImageLike {
  return (status && STATUS_ICON[status]) || { source: Icon.Circle, tintColor: Color.SecondaryText };
}

const STATUS_LABEL: Record<string, string> = {
  todo: "未着手",
  in_progress: "進行中",
  blocked: "保留",
  closed: "完了",
};

export function statusLabel(status: string | null): string {
  return (status && STATUS_LABEL[status]) || "不明";
}

const TIER_LABEL: Record<TierCode, string> = {
  due: "期日",
  wip: "仕掛かり",
  tree: "木順",
};

export function tierLabel(tier: TierCode): string {
  return TIER_LABEL[tier];
}

const EXCLUDED_LABEL: Record<ExcludedReasonCode, string> = {
  backlog: "バックログ",
  other_assignee: "他者担当",
  split_parent: "分割親",
  blocked_by_deps: "依存待ち",
  status_blocked: "保留",
  status_other: "対象外status",
  not_started: "開始前",
};

export function excludedLabel(code: ExcludedReasonCode): string {
  return EXCLUDED_LABEL[code] ?? code;
}

/** `2026-07-24` → `07/24`。年は今日の候補の文脈では冗長なので落とす。 */
export function shortDate(date: string): string {
  return date.length >= 10 ? `${date.slice(5, 7)}/${date.slice(8, 10)}` : date;
}

export function periodLabel(task: Task): string {
  if (task.start && task.end) {
    return `${task.start} → ${task.end}`;
  }
  return task.end ? `→ ${task.end}` : (task.start ?? "—");
}

/** `## 進行` のチェックボックス集計。索引が数え済みなので探すだけ。 */
export function progressOf(task: Task): Checklist | null {
  return task.sections.find((section) => section.name === "進行")?.checklist ?? null;
}

/** `## 進行` を持つセクション名。進行中のタスクではこれを本文の先頭へ繰り上げる。 */
const PROGRESS_SECTION = "進行";

/**
 * 詳細パネルの本文。索引が `## 見出し` 単位で持っているので繋ぐだけだが、2点だけ並べ替える。
 *
 * - checklist を持つセクションは見出しの横に `(done/total)` を出す（索引は数え済み）
 * - 進行中のタスクは `## 進行` を先頭に置く。着手済みのタスクを開く目的はほぼ「次の1項目」の
 *   確認なので、`## 背景` を読み飛ばさせない
 */
export function taskMarkdown(task: Task): string {
  const parts = [`# ${task.title}`];
  if (task.preamble) {
    parts.push(task.preamble);
  }
  for (const section of orderedSections(task)) {
    const count = section.checklist ? ` (${section.checklist.done}/${section.checklist.total})` : "";
    parts.push(`## ${section.name}${count}`);
    if (section.text) {
      parts.push(section.text);
    }
  }
  return parts.join("\n\n");
}

function orderedSections(task: Task): Section[] {
  if (task.status !== "in_progress") {
    return task.sections;
  }
  const progress = task.sections.filter((section) => section.name === PROGRESS_SECTION);
  if (progress.length === 0) {
    return task.sections;
  }
  return [...progress, ...task.sections.filter((section) => section.name !== PROGRESS_SECTION)];
}

/** 検索の突合対象。タイトル・属性に加えて本文（preamble と各 section）まで含める。 */
export function searchHaystack(task: Task): string {
  return [
    task.title,
    task.project ?? "",
    task.assignee ?? "",
    task.status ?? "",
    task.priority ?? "",
    task.preamble,
    ...task.sections.flatMap((section) => [section.name, section.text]),
  ]
    .join("\n")
    .toLowerCase();
}

/** 空白区切りの語をすべて含むか（AND）。索引の本文は長いので Raycast 標準の絞り込みには載せない。 */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
  return terms.every((term) => haystack.includes(term));
}
