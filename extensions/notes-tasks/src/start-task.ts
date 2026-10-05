import { LaunchProps, showHUD, showToast, Toast } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { ACTION_LABEL, dispatchTask, loadIndex, Task, TaskAction } from "./model";

// HTML ビュー（`tasks/タスクビュー.html`）の詳細パネルから deeplink で叩かれる入口。
// 引数はタスク名（索引の `key`）と `run` / `close` の2つだけで、やることは既存の
// `dispatchTask` と同じ——タブを立てて `/task-manage` を投げるところまで。
//
// `showToast` は Raycast の窓が閉じているときは HUD へ落ちるので、deeplink から
// `launchType=background` で叩かれても失敗の理由は目に入る。

type Arguments = {
  task: string;
  action?: string;
};

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const name = props.arguments.task?.trim() ?? "";
  const action: TaskAction = props.arguments.action?.trim().toLowerCase() === "close" ? "close" : "run";
  const label = ACTION_LABEL[action];

  if (!name) {
    await showToast({ style: Toast.Style.Failure, title: "タスク名が空です" });
    return;
  }

  const loaded = await loadIndex();
  if (!loaded.ok) {
    await showToast({
      style: Toast.Style.Failure,
      title: "索引を読み込めません",
      message: `${loaded.detail}（${loaded.indexPath}）`,
    });
    return;
  }

  const task = resolve(loaded.index.tasks, loaded.byKey, name);
  if (!task) {
    await showToast({
      style: Toast.Style.Failure,
      title: "タスクが見つかりません",
      message: `${name}（索引が古い可能性があります）`,
    });
    return;
  }

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: `Herdr でタスクを${label}しています`,
    message: task.title,
  });
  try {
    const session = await dispatchTask(task, action);
    await toast.hide();
    await showHUD(`Herdr に${label}を指示しました: ${task.title}（${session.tabId}）`);
  } catch (error) {
    await showFailureToast(error, { title: `Herdr でタスクを${label}できません` });
  }
}

/**
 * 索引の `key` で引く。HTML からは key をそのまま渡すので普通は1発で当たるが、
 * 手打ちの deeplink も受けられるよう、外れたときだけ部分一致で1件に絞れるかを見る。
 */
function resolve(tasks: Task[], byKey: Map<string, Task>, name: string): Task | undefined {
  const exact = byKey.get(name);
  if (exact) {
    return exact;
  }
  const needle = name.toLowerCase();
  const partial = tasks.filter((task) => task.title.toLowerCase().includes(needle));
  return partial.length === 1 ? partial[0] : undefined;
}
