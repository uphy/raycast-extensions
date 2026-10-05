import { showHUD, showToast, Toast } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { dispatchPrompt, MANAGE_MODE, ManageMode } from "../model";

// タスクを指さない `/task-manage` のモードを herdr へ投げる no-view コマンド共通の中身。
// 4コマンド（plan / routine / wrap / list）が同じことをするので、違いは mode だけに絞る。

export async function runManageMode(mode: ManageMode): Promise<void> {
  const { label, prompt } = MANAGE_MODE[mode];
  const toast = await showToast({ style: Toast.Style.Animated, title: `Herdr に「${label}」を渡しています` });
  try {
    const session = await dispatchPrompt(label, prompt);
    await toast.hide();
    await showHUD(`Herdr で「${label}」を開始しました（${session.workspaceLabel} / ${session.tabId}）`);
  } catch (error) {
    await showFailureToast(error, { title: `Herdr に「${label}」を渡せません` });
  }
}
