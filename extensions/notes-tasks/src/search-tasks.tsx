import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { IndexUnavailable, StaleNotice } from "./components/index-state";
import { TaskActions, TaskDetail } from "./components/task";
import { LoadedIndex, loadIndex, priorityColor, progressOf, shortDate, statusIcon, Task } from "./model";

// 索引は木の順序で並んでいるので、そのまま出せば `_タスク.md` と同じ並びになる。
// 絞り込みの軸は dropdown 1つに寄せた（project / status / バックログ）。
const BACKLOG = "filter:backlog";
const ACTIVE = "filter:active";
const BLOCKING = "filter:blocking";

export default function Command() {
  const { data, isLoading } = usePromise(loadIndex);
  const [filter, setFilter] = useState<string>(ACTIVE);
  const [showingDetail, setShowingDetail] = useState(false);

  if (data && !data.ok) {
    return (
      <List>
        <IndexUnavailable load={data} />
      </List>
    );
  }

  const tasks = data ? data.index.tasks.filter((task) => matches(task, filter)) : [];

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showingDetail}
      searchBarPlaceholder="タスク名・project で絞り込む"
      navigationTitle={data ? `work items ${data.index.tasks.length}件` : undefined}
      searchBarAccessory={
        data ? (
          <List.Dropdown tooltip="絞り込み" value={filter} onChange={setFilter}>
            <List.Dropdown.Section>
              <List.Dropdown.Item title="現役（closed以外）" value={ACTIVE} icon={Icon.Circle} />
              <List.Dropdown.Item title="バックログ（未アサイン）" value={BACKLOG} icon={Icon.Tray} />
              <List.Dropdown.Item title="他をブロック中" value={BLOCKING} icon={Icon.Bolt} />
              <List.Dropdown.Item title="すべて" value="" icon={Icon.List} />
            </List.Dropdown.Section>
            <List.Dropdown.Section title="Project">
              {data.index.projects.map((project) => (
                <List.Dropdown.Item
                  key={project.name}
                  title={`${project.name}（${project.task_count}）`}
                  value={project.name}
                />
              ))}
            </List.Dropdown.Section>
          </List.Dropdown>
        ) : null
      }
    >
      {data ? <StaleNotice data={data} /> : null}
      {data
        ? tasks.map((task) => (
            <TaskListItem
              key={task.key}
              data={data}
              task={task}
              showingDetail={showingDetail}
              onToggleDetail={() => setShowingDetail((current) => !current)}
            />
          ))
        : null}
      <List.EmptyView icon={Icon.MagnifyingGlass} title="該当するタスクがありません" />
    </List>
  );
}

function matches(task: Task, filter: string): boolean {
  if (filter === "") {
    return true;
  }
  if (filter === ACTIVE) {
    return task.status !== "closed";
  }
  if (filter === BACKLOG) {
    return task.status !== "closed" && task.assignee === null;
  }
  if (filter === BLOCKING) {
    return task.status !== "closed" && task.blocks.length > 0;
  }
  return task.project === filter;
}

function TaskListItem(props: { data: LoadedIndex; task: Task; showingDetail: boolean; onToggleDetail: () => void }) {
  const { data, task, showingDetail, onToggleDetail } = props;
  const progress = progressOf(task);
  const accessories: List.Item.Accessory[] = [];

  if (task.blocks.length > 0) {
    accessories.push({
      icon: { source: Icon.Bolt, tintColor: Color.Blue },
      text: String(task.blocks.length),
      tooltip: `これを終えると着手可になるタスク: ${task.blocks.length}件`,
    });
  }
  if (task.depends_on.length > 0) {
    accessories.push({
      icon: { source: Icon.MinusCircle, tintColor: Color.Orange },
      tooltip: `依存先: ${task.depends_on.map((key) => data.byKey.get(key)?.title ?? key).join("／")}`,
    });
  }
  if (progress && progress.total > 0) {
    accessories.push({ text: `${progress.done}/${progress.total}`, tooltip: "進行のチェック" });
  }
  if (task.priority) {
    accessories.push({ tag: { value: task.priority, color: priorityColor(task.priority) } });
  }
  if (task.end) {
    accessories.push({ tag: shortDate(task.end), icon: Icon.Calendar, tooltip: `期日 ${task.end}` });
  }

  return (
    <List.Item
      icon={statusIcon(task.status)}
      title={task.title}
      subtitle={task.project ?? undefined}
      keywords={[task.project ?? "", task.assignee ?? "backlog", task.status ?? ""]}
      accessories={showingDetail ? undefined : accessories}
      detail={<TaskDetail data={data} task={task} />}
      actions={
        <ActionPanel>
          <TaskActions data={data} task={task} />
          <ActionPanel.Section>
            <Action
              title={showingDetail ? "詳細を隠す" : "詳細を表示"}
              icon={Icon.AppWindowSidebarRight}
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
              onAction={onToggleDetail}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
