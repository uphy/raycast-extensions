import { Action, ActionPanel, Color, Form, Icon, Keyboard, List, showToast, Toast, useNavigation } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import {
  absolutePath,
  ACTION_LABEL,
  Candidate,
  dispatchTask,
  LoadedIndex,
  openTaskView,
  periodLabel,
  priorityColor,
  progressOf,
  statusIcon,
  statusLabel,
  Task,
  TaskAction,
  taskMarkdown,
  TaskViewMissingError,
  TaskViewTab,
  tierLabel,
} from "../model";

/**
 * タスク1件に対する操作。「開く」「依存をたどる」「herdr に渡す」「コピー」の4段で、
 * よく使う順に並べる。
 */
export function TaskActions(props: {
  data: LoadedIndex;
  task: Task;
  /** 今日の候補で `blocked_by_deps` として外れた行だけが持つ、実際に待っている相手。 */
  blockedBy?: string[];
}) {
  const { data, task, blockedBy } = props;
  const path = absolutePath(data.index, task);
  return (
    <>
      <ActionPanel.Section title={task.title}>
        <Action.Open title="Obsidianで開く" target={task.obsidian_uri} icon={Icon.Document} />
        {task.notion_url ? <Action.OpenInBrowser title="Notionで開く" url={task.notion_url} icon={Icon.Globe} /> : null}
        <TaskViewAction task={task} tab="today" title="タスクビューで開く" icon={Icon.AppWindowGrid2x2} withShortcut />
        <TaskViewAction task={task} tab="gantt" title="ガントで見る" icon={Icon.BarChart} />
        <TaskViewAction task={task} tab="deps" title="依存図で見る" icon={Icon.Network} />
      </ActionPanel.Section>

      <DependencyActions data={data} task={task} blockedBy={blockedBy} />

      <HerdrActions task={task} />

      <ActionPanel.Section>
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
    </>
  );
}

/**
 * vault 側の1枚 HTML ビューを、このタスクを選択した状態で開く。
 * `Action.Open` / `Action.OpenInBrowser` を使わないのは、どちらも最終的に macOS の
 * `open` を通り、`file:` URL の fragment（＝ビューの状態）が落ちてしまうため。
 */
function TaskViewAction(props: { task: Task; tab: TaskViewTab; title: string; icon: Icon; withShortcut?: boolean }) {
  const { task, tab, title, icon, withShortcut } = props;
  return (
    <Action
      title={title}
      icon={icon}
      shortcut={withShortcut ? { modifiers: ["cmd", "shift"], key: "v" } : undefined}
      onAction={async () => {
        try {
          await openTaskView(tab, task);
        } catch (error) {
          if (error instanceof TaskViewMissingError) {
            await showToast({
              style: Toast.Style.Failure,
              title: "タスクビューがまだありません",
              message: `vault で python3 tasks/_scripts/gen_html.py を実行してください（${error.path}）`,
            });
            return;
          }
          await showFailureToast(error, { title: "タスクビューを開けません" });
        }
      }}
    />
  );
}

/**
 * 依存の上流（`depends_on`）と下流（`blocks`）へ移る。索引はどちらも key（タスク名）の配列で
 * 持っているので `byKey` で引ける。移った先でも同じ ActionPanel が出るので再帰的にたどれる。
 */
function DependencyActions(props: { data: LoadedIndex; task: Task; blockedBy?: string[] }) {
  const { data, task, blockedBy } = props;
  // `blocked_by` は `depends_on` のうち未完のものなので、常に依存元の部分集合。
  // 待っている相手が分かっているときはそちらを前に出し、依存元の全件は残りがあるときだけ出す。
  const waiting = blockedBy ?? [];
  const upstream = task.depends_on.filter((key) => !waiting.includes(key));
  if (upstream.length === 0 && task.blocks.length === 0 && waiting.length === 0) {
    return null;
  }
  return (
    <ActionPanel.Section title="依存">
      {waiting.length > 0 ? (
        <RelatedTasksAction
          data={data}
          keys={waiting}
          icon={Icon.MinusCircle}
          title={`依存待ちの相手を開く${suffix(data, waiting)}`}
          navigationTitle={`${task.title} が待っているタスク`}
        />
      ) : null}
      {upstream.length > 0 ? (
        <RelatedTasksAction
          data={data}
          keys={upstream}
          icon={Icon.ArrowUp}
          title={`${waiting.length > 0 ? "ほかの依存元" : "依存元"}を開く${suffix(data, upstream)}`}
          navigationTitle={`${task.title} の依存元`}
        />
      ) : null}
      {task.blocks.length > 0 ? (
        <RelatedTasksAction
          data={data}
          keys={task.blocks}
          icon={Icon.ArrowDown}
          title={`ブロック中のタスクを開く${suffix(data, task.blocks)}`}
          navigationTitle={`${task.title} が塞いでいるタスク`}
        />
      ) : null}
    </ActionPanel.Section>
  );
}

/** 1件なら相手の名前をそのまま出す（何が開くのか押す前に分かる）。複数なら件数。 */
function suffix(data: LoadedIndex, keys: string[]): string {
  if (keys.length === 1) {
    return `: ${data.byKey.get(keys[0])?.title ?? keys[0]}`;
  }
  return `（${keys.length}件）`;
}

function RelatedTasksAction(props: {
  data: LoadedIndex;
  keys: string[];
  title: string;
  navigationTitle: string;
  icon: Icon;
}) {
  const { data, keys, title, navigationTitle, icon } = props;
  return (
    <Action.Push
      title={title}
      icon={icon}
      target={<RelatedTasks data={data} keys={keys} navigationTitle={navigationTitle} />}
    />
  );
}

/**
 * 依存でつながったタスクの一覧。`TaskActions` をそのまま載せるので、ここからさらに
 * 依存をたどれる（上流→上流→…）。
 */
export function RelatedTasks(props: { data: LoadedIndex; keys: string[]; navigationTitle: string }) {
  const { data, keys, navigationTitle } = props;
  return (
    <List isShowingDetail navigationTitle={navigationTitle} searchBarPlaceholder="タスク名で絞り込む">
      {keys.map((key) => {
        const task = data.byKey.get(key);
        return task ? (
          <List.Item
            key={key}
            icon={statusIcon(task.status)}
            title={task.title}
            detail={<TaskDetail data={data} task={task} />}
            actions={
              <ActionPanel>
                <TaskActions data={data} task={task} />
              </ActionPanel>
            }
          />
        ) : (
          // 索引は closed も持つので、ここに来るのは依存先が改名・削除されたデータ不備。黙って消さずに出す。
          <List.Item
            key={key}
            icon={{ source: Icon.QuestionMark, tintColor: Color.SecondaryText }}
            title={key}
            subtitle="索引にありません"
          />
        );
      })}
    </List>
  );
}

/**
 * herdr にタスク用のタブを立てて作業を始める / 終える。ここでも vault は書かず、
 * 立てたエージェントに `/task-manage` を投げて vault 側の唯一の書き換え経路に委ねる。
 */
function HerdrActions(props: { task: Task }) {
  const { task } = props;
  return (
    <ActionPanel.Section title="Herdr">
      <Action
        title="Herdrでタスクを開始"
        icon={Icon.Terminal}
        shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
        onAction={() => dispatch(task, "run")}
      />
      <Action.Push
        title="メモを添えてHerdrで開始"
        icon={Icon.Pencil}
        shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
        target={<NoteForm task={task} />}
      />
      <Action
        title="Herdrでタスクを終了"
        icon={Icon.CheckCircle}
        shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
        onAction={() => dispatch(task, "close")}
      />
    </ActionPanel.Section>
  );
}

/** 着手の合図に一言添えるためのフォーム。添えた文は prompt の末尾に改行して付く。 */
function NoteForm(props: { task: Task }) {
  const { task } = props;
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={`${task.title} を開始`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Herdrで開始"
            icon={Icon.Terminal}
            onSubmit={async (values: { note: string }) => {
              pop();
              await dispatch(task, "run", values.note);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="タスク" text={task.title} />
      <Form.TextArea
        id="note"
        title="メモ"
        placeholder="どこから手を付けるか・今日どこまでやるか・気になっていること"
        info="/task-manage run の直後に、そのまま1行空けて添えられます。空でも構いません。"
      />
    </Form>
  );
}

async function dispatch(task: Task, action: TaskAction, note?: string) {
  const label = ACTION_LABEL[action];
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: `Herdr でタスクを${label}しています`,
    message: task.title,
  });
  try {
    const session = await dispatchTask(task, action, note);
    toast.style = Toast.Style.Success;
    toast.title = `Herdr に${label}を指示しました`;
    toast.message = `${session.workspaceLabel} / ${session.tabId}・${session.prompt}`;
  } catch (error) {
    await showFailureToast(error, { title: `Herdr でタスクを${label}できません` });
  }
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

          {/* 依存は上流・下流とも出す。呼び名は HTML ビューの詳細パネルに揃えてある。 */}
          {task.depends_on.length > 0 || task.blocks.length > 0 ? <List.Item.Detail.Metadata.Separator /> : null}
          {task.depends_on.length > 0 ? (
            <List.Item.Detail.Metadata.TagList title={`依存元（先に終わる必要あり・${task.depends_on.length}件）`}>
              {task.depends_on.map((key) => (
                <List.Item.Detail.Metadata.TagList.Item key={key} text={titleOf(key)} color={Color.Orange} />
              ))}
            </List.Item.Detail.Metadata.TagList>
          ) : null}
          {task.blocks.length > 0 ? (
            <List.Item.Detail.Metadata.TagList title={`依存先（これを終えると着手可・${task.blocks.length}件）`}>
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
