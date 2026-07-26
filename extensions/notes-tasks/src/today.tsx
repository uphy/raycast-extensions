import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { IndexUnavailable, StaleNotice } from "./components/index-state";
import { TaskActions, TaskDetail } from "./components/task";
import { Candidate, excludedLabel, LoadedIndex, loadIndex, priorityColor, shortDate, statusIcon, Task } from "./model";

type Scope = "today" | "excluded" | "all";

// 順序も除外理由も vault 側の today.py が決めている（`今日の候補.md` と同じ導出結果）。
// ここは索引の today セクションをそのまま並べるだけで、選び直しはしない。
export default function Command() {
  const { data, isLoading } = usePromise(loadIndex);
  const [scope, setScope] = useState<Scope>("today");
  const [showingDetail, setShowingDetail] = useState(true);

  if (data && !data.ok) {
    return (
      <List>
        <IndexUnavailable load={data} />
      </List>
    );
  }

  const today = data?.index.today;
  const showToday = scope === "today" || scope === "all";
  const showExcluded = scope === "excluded" || scope === "all";

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showingDetail}
      navigationTitle={
        today ? `今日の候補 ${today.candidates.length}件・合計 ~${today.total_estimate_days}d` : undefined
      }
      searchBarAccessory={
        <List.Dropdown tooltip="表示範囲" value={scope} onChange={(value) => setScope(value as Scope)}>
          <List.Dropdown.Item title="今日" value="today" icon={Icon.Bolt} />
          <List.Dropdown.Item title="対象外" value="excluded" icon={Icon.MinusCircle} />
          <List.Dropdown.Item title="すべて" value="all" icon={Icon.List} />
        </List.Dropdown>
      }
    >
      {data ? <StaleNotice data={data} /> : null}

      {data && today && showToday ? (
        <List.Section title="今日の候補" subtitle={`${today.candidates.length}件 ~${today.total_estimate_days}d`}>
          {today.candidates.map((candidate) => {
            const task = data.byKey.get(candidate.key);
            return task ? (
              <CandidateItem
                key={candidate.key}
                data={data}
                task={task}
                candidate={candidate}
                showingDetail={showingDetail}
                onToggleDetail={() => setShowingDetail((current) => !current)}
              />
            ) : null;
          })}
        </List.Section>
      ) : null}

      {data && today && showToday && today.upcoming.length > 0 ? (
        <List.Section title="まもなく" subtitle={`horizon ${today.horizon_days}日`}>
          {today.upcoming.map((item) => {
            const task = data.byKey.get(item.key);
            return task ? (
              <TaskItem
                key={item.key}
                data={data}
                task={task}
                accessories={[
                  {
                    tag: { value: shortDate(item.date), color: Color.Blue },
                    tooltip:
                      item.kind === "starting" ? `start ${item.date} に開始予定` : `end ${item.date} が迫るが依存待ち`,
                  },
                ]}
                showingDetail={showingDetail}
                onToggleDetail={() => setShowingDetail((current) => !current)}
              />
            ) : null;
          })}
        </List.Section>
      ) : null}

      {data && today && showExcluded ? (
        <List.Section title="対象外" subtitle={`${today.excluded.length}件`}>
          {today.excluded.map((item) => {
            const task = data.byKey.get(item.key);
            return task ? (
              <TaskItem
                key={item.key}
                data={data}
                task={task}
                accessories={[{ tag: excludedLabel(item.reason_code), tooltip: item.reason }]}
                showingDetail={showingDetail}
                onToggleDetail={() => setShowingDetail((current) => !current)}
              />
            ) : null;
          })}
        </List.Section>
      ) : null}
    </List>
  );
}

function CandidateItem(props: {
  data: LoadedIndex;
  task: Task;
  candidate: Candidate;
  showingDetail: boolean;
  onToggleDetail: () => void;
}) {
  const { task, candidate } = props;
  const accessories: List.Item.Accessory[] = [];

  if (candidate.stale_days !== null) {
    accessories.push({
      icon: { source: Icon.Stopwatch, tintColor: Color.Orange },
      tooltip: `滞留: 最終更新から${candidate.stale_days}日`,
    });
  }
  if (!candidate.in_tree) {
    accessories.push({ icon: { source: Icon.Warning, tintColor: Color.Red }, tooltip: "木に無し" });
  }
  if (task.priority) {
    accessories.push({ tag: { value: task.priority, color: priorityColor(task.priority) } });
  }
  accessories.push({ text: task.estimate ? `~${task.estimate}` : "~?", tooltip: "見積（低信頼）" });
  if (candidate.tier_code === "due" && task.end) {
    accessories.push({
      tag: { value: shortDate(task.end), color: candidate.overdue ? Color.Red : Color.Orange },
      icon: Icon.Calendar,
      tooltip: candidate.overdue ? `期日 ${task.end}（超過）` : `期日 ${task.end}`,
    });
  }

  return <TaskItem {...props} accessories={accessories} />;
}

function TaskItem(props: {
  data: LoadedIndex;
  task: Task;
  candidate?: Candidate;
  accessories: List.Item.Accessory[];
  showingDetail: boolean;
  onToggleDetail: () => void;
}) {
  const { data, task, candidate, accessories, showingDetail, onToggleDetail } = props;
  return (
    <List.Item
      icon={statusIcon(task.status)}
      title={task.title}
      subtitle={showingDetail ? undefined : (task.project ?? undefined)}
      keywords={task.project ? [task.project] : undefined}
      accessories={showingDetail ? undefined : accessories}
      detail={<TaskDetail data={data} task={task} candidate={candidate} />}
      actions={
        <ActionPanel>
          <TaskActions data={data} task={task} />
          <ActionPanel.Section>
            <DetailToggle showingDetail={showingDetail} onToggle={onToggleDetail} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function DetailToggle(props: { showingDetail: boolean; onToggle: () => void }) {
  return (
    <Action
      title={props.showingDetail ? "詳細を隠す" : "詳細を表示"}
      icon={Icon.AppWindowSidebarRight}
      shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
      onAction={props.onToggle}
    />
  );
}
