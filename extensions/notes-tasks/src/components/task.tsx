import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@raycast/api";
import {
  absolutePath,
  Candidate,
  LoadedIndex,
  periodLabel,
  priorityColor,
  progressOf,
  statusLabel,
  Task,
  taskMarkdown,
  tierLabel,
} from "../model";

/** タスク1件に対する操作。read-only なので「開く」と「コピー」しかない。 */
export function TaskActions(props: { data: LoadedIndex; task: Task }) {
  const { data, task } = props;
  const path = absolutePath(data.index, task);
  return (
    <ActionPanel.Section title={task.title}>
      <Action.Open title="Obsidianで開く" target={task.obsidian_uri} icon={Icon.Document} />
      {task.notion_url ? <Action.OpenInBrowser title="Notionで開く" url={task.notion_url} icon={Icon.Globe} /> : null}
      <Action.CopyToClipboard
        title="Wikilinkをコピー"
        content={task.wikilink}
        shortcut={Keyboard.Shortcut.Common.Copy}
      />
      <Action.CopyToClipboard
        title="タスク名をコピー"
        content={task.title}
        shortcut={Keyboard.Shortcut.Common.CopyName}
      />
      <Action.CopyToClipboard title="パスをコピー" content={path} shortcut={Keyboard.Shortcut.Common.CopyPath} />
      <Action.ShowInFinder path={path} />
      <Action.OpenWith path={path} shortcut={Keyboard.Shortcut.Common.OpenWith} />
    </ActionPanel.Section>
  );
}

/** タスク本文＋属性。本文は索引が `## 見出し` 単位で持っているので繋ぐだけ。 */
export function TaskDetail(props: { data: LoadedIndex; task: Task; candidate?: Candidate }) {
  const { data, task, candidate } = props;
  const progress = progressOf(task);
  const titleOf = (key: string) => data.byKey.get(key)?.title ?? key;

  return (
    <List.Item.Detail
      markdown={taskMarkdown(task)}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Project" text={task.project ?? "⚠ 未設定"} />
          <List.Item.Detail.Metadata.TagList title="状態">
            <List.Item.Detail.Metadata.TagList.Item text={statusLabel(task.status)} />
            {task.priority ? (
              <List.Item.Detail.Metadata.TagList.Item text={task.priority} color={priorityColor(task.priority)} />
            ) : null}
          </List.Item.Detail.Metadata.TagList>
          <List.Item.Detail.Metadata.Label title="担当" text={task.assignee ?? "バックログ（未アサイン）"} />
          <List.Item.Detail.Metadata.Label title="期間" text={periodLabel(task)} />
          <List.Item.Detail.Metadata.Label title="見積" text={task.estimate ?? "—"} />
          {progress ? (
            <List.Item.Detail.Metadata.Label title="進行" text={`${progress.done} / ${progress.total}`} />
          ) : null}

          {candidate ? (
            <>
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label
                title="今日の順位"
                text={`${candidate.rank}番目・${tierLabel(candidate.tier_code)}層`}
              />
              <List.Item.Detail.Metadata.Label title="ここまでの累積" text={`~${candidate.cumulative_days}d`} />
              {candidate.stale_days !== null ? (
                <List.Item.Detail.Metadata.Label
                  title="滞留"
                  text={`最終更新から${candidate.stale_days}日`}
                  icon={{ source: Icon.Stopwatch, tintColor: Color.Orange }}
                />
              ) : null}
            </>
          ) : null}

          {task.depends_on.length > 0 || task.blocks.length > 0 ? <List.Item.Detail.Metadata.Separator /> : null}
          {task.depends_on.length > 0 ? (
            <List.Item.Detail.Metadata.TagList title="依存先">
              {task.depends_on.map((key) => (
                <List.Item.Detail.Metadata.TagList.Item key={key} text={titleOf(key)} color={Color.Orange} />
              ))}
            </List.Item.Detail.Metadata.TagList>
          ) : null}
          {task.blocks.length > 0 ? (
            <List.Item.Detail.Metadata.TagList title={`これを終えると着手可（${task.blocks.length}件）`}>
              {task.blocks.map((key) => (
                <List.Item.Detail.Metadata.TagList.Item key={key} text={titleOf(key)} color={Color.Blue} />
              ))}
            </List.Item.Detail.Metadata.TagList>
          ) : null}

          {task.notion_url ? (
            <>
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Link
                title="Notion"
                target={task.notion_url}
                text={task.notion_id ?? "ページを開く"}
              />
            </>
          ) : null}
        </List.Item.Detail.Metadata>
      }
    />
  );
}
