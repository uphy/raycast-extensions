import {
  Clipboard,
  Color,
  getPreferenceValues,
  Icon,
  launchCommand,
  LaunchType,
  MenuBarExtra,
  open,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import {
  Candidate,
  LoadedIndex,
  loadIndex,
  priorityColor,
  REGENERATE_COMMAND,
  shortDate,
  statusIcon,
  Task,
} from "./model";

// メニューバーに出すのは「今の一手」＝今日の候補の1位だけ。日本語のタスク名は横幅を食うので
// 既定はアイコンのみとし、状態はアイコンの色に載せる（超過あり=赤・索引が古い=橙・候補なし=緑・
// それ以外=1位の priority 色）。名前と件数は tooltip とプルダウンが持つ。
type Display = "icon" | "count" | "title";

const TITLE_MAX = 20;
const MENU_ITEMS = 5;

export default function Command() {
  const { data, isLoading } = usePromise(loadIndex);
  const display = (getPreferenceValues<{ menuBarDisplay?: Display }>().menuBarDisplay ?? "icon") as Display;

  if (!data || !data.ok) {
    return (
      <MenuBarExtra icon={{ source: Icon.Warning, tintColor: Color.Orange }} isLoading={isLoading}>
        <MenuBarExtra.Item title="索引を読み込めません" />
        <MenuBarExtra.Item
          title="再生成コマンドをコピー"
          icon={Icon.Clipboard}
          onAction={() => Clipboard.copy(REGENERATE_COMMAND)}
        />
      </MenuBarExtra>
    );
  }

  const { today } = data.index;
  const top = today.candidates[0];
  const topTask = top ? data.byKey.get(top.key) : undefined;
  const overdue = today.candidates.filter((candidate) => candidate.overdue).length;

  return (
    <MenuBarExtra
      icon={menuIcon(data, top, overdue)}
      title={menuTitle(display, data, topTask, overdue)}
      tooltip={menuTooltip(data, topTask, overdue)}
      isLoading={isLoading}
    >
      {data.stale ? (
        <MenuBarExtra.Section title="⚠ 索引が古い">
          <MenuBarExtra.Item
            title={`基準日 ${today.base_date}`}
            subtitle="再生成コマンドをコピー"
            onAction={() => Clipboard.copy(REGENERATE_COMMAND)}
          />
        </MenuBarExtra.Section>
      ) : null}

      <MenuBarExtra.Section title={`今日の候補 ${today.candidates.length}件・合計 ~${today.total_estimate_days}d`}>
        {today.candidates.slice(0, MENU_ITEMS).map((candidate) => {
          const task = data.byKey.get(candidate.key);
          return task ? (
            <MenuBarExtra.Item
              key={candidate.key}
              icon={statusIcon(task.status)}
              title={`${candidate.rank}. ${task.title}`}
              subtitle={subtitleOf(task, candidate)}
              onAction={() => open(task.obsidian_uri)}
            />
          ) : null;
        })}
        {today.candidates.length > MENU_ITEMS ? (
          <MenuBarExtra.Item title={`ほか ${today.candidates.length - MENU_ITEMS}件`} />
        ) : null}
      </MenuBarExtra.Section>

      <MenuBarExtra.Section>
        {overdue > 0 ? (
          <MenuBarExtra.Item
            icon={{ source: Icon.Warning, tintColor: Color.Red }}
            title={`期日超過 ${overdue}件`}
            onAction={() => launchCommand({ name: "today", type: LaunchType.UserInitiated })}
          />
        ) : null}
        <MenuBarExtra.Item
          icon={Icon.List}
          title="今日の候補を開く"
          onAction={() => launchCommand({ name: "today", type: LaunchType.UserInitiated })}
        />
        <MenuBarExtra.Item
          icon={Icon.Document}
          title="今日の候補.md を Obsidian で開く"
          onAction={() =>
            open(`obsidian://open?vault=${data.index.vault.name}&file=${encodeURIComponent("tasks/今日の候補")}`)
          }
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

/**
 * アイコンだけで状態が分かるようにする（既定はタイトル無しなので、ここが唯一の常時シグナル）。
 * 形は Circle に固定して色だけ変える。メニューバーは横幅が正義なので、意味は色に載せる。
 */
function menuIcon(data: LoadedIndex, top: Candidate | undefined, overdue: number) {
  if (data.stale) {
    return { source: Icon.Circle, tintColor: Color.Purple };
  }
  if (!top) {
    return { source: Icon.Circle, tintColor: Color.Green };
  }
  if (overdue > 0) {
    return { source: Icon.Circle, tintColor: Color.Red };
  }
  const task = data.byKey.get(top.key);
  return { source: Icon.Circle, tintColor: priorityColor(task?.priority ?? null) };
}

function menuTitle(display: Display, data: LoadedIndex, top: Task | undefined, overdue: number): string | undefined {
  if (display === "icon") {
    return undefined;
  }
  if (data.stale) {
    return "索引が古い";
  }
  if (!top) {
    return display === "title" ? "候補なし" : undefined;
  }
  if (display === "count") {
    return overdue > 0 ? String(overdue) : undefined;
  }
  return truncate(top.title, TITLE_MAX) + (overdue > 0 ? ` ⚠${overdue}` : "");
}

function menuTooltip(data: LoadedIndex, top: Task | undefined, overdue: number): string {
  if (data.stale) {
    return `索引が古い（基準日 ${data.index.today.base_date}）`;
  }
  if (!top) {
    return "今日の候補はありません";
  }
  return `今の一手: ${top.title}${overdue > 0 ? `（期日超過 ${overdue}件）` : ""}`;
}

function subtitleOf(task: Task, candidate: Candidate): string {
  const parts = [task.project ?? "⚠ project未設定"];
  if (task.estimate) {
    parts.push(`~${task.estimate}`);
  }
  if (candidate.tier_code === "due" && task.end) {
    parts.push(candidate.overdue ? `${shortDate(task.end)} 超過` : shortDate(task.end));
  }
  return parts.join(" · ");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
