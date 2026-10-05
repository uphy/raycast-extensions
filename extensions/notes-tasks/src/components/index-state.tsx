import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Keyboard,
  List,
  openExtensionPreferences,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { IndexLoad, LoadedIndex, REGENERATE_COMMAND, regenerateIndex } from "../model";

type FailedIndex = Extract<IndexLoad, { ok: false }>;

const DESCRIPTION: Record<FailedIndex["reason"], string> = {
  missing: `${REGENERATE_COMMAND} を vault で実行するか、タスクを1件編集すると hook が生成します。`,
  unreadable: "索引を読めませんでした。Vault Path の設定を確認してください。",
  schema: "vault 側のスクリプトとこの extension のどちらかが古いので、揃えてください。",
};

/**
 * 索引と HTML ビューを再生成する。走らせるのは vault 側の決定論スクリプト2本で、
 * どちらも派生物しか書かない（タスクの状態変更は今までどおり herdr → task-manage の担当）。
 */
export function RegenerateAction(props: { onRegenerated?: () => void }) {
  const { onRegenerated } = props;
  return (
    <Action
      title="索引を再生成"
      icon={Icon.ArrowClockwise}
      shortcut={Keyboard.Shortcut.Common.Refresh}
      onAction={() => regenerateWithFeedback(onRegenerated)}
    />
  );
}

/** toast で進捗を出しつつ再生成する。menu bar からも呼ぶので Action の外に置く。 */
export async function regenerateWithFeedback(onRegenerated?: () => void): Promise<void> {
  const toast = await showToast({ style: Toast.Style.Animated, title: "索引を再生成しています" });
  try {
    const { stderr } = await regenerateIndex();
    toast.style = Toast.Style.Success;
    toast.title = "索引を再生成しました";
    toast.message = stderr || undefined;
    onRegenerated?.();
  } catch (error) {
    await showFailureToast(error, { title: "索引を再生成できません" });
  }
}

/** menu bar 用。toast は menu bar からは見えないので、結果は HUD で出す。 */
export async function regenerateFromMenuBar(onRegenerated?: () => void): Promise<void> {
  try {
    await regenerateIndex();
    onRegenerated?.();
    await showHUD("索引を再生成しました");
  } catch (error) {
    await showHUD(`索引を再生成できません: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 索引が読めないときの案内。生成は vault 側のスクリプトに任せるが、そのスクリプトを
 * ここから起こすところまではやる（コピーして端末へ移らなくて済む）。
 */
export function IndexUnavailable(props: { load: FailedIndex; onRegenerated?: () => void }) {
  const { load, onRegenerated } = props;
  return (
    <List.EmptyView
      icon={{ source: Icon.Warning, tintColor: Color.Orange }}
      title="索引を読み込めません"
      description={`${DESCRIPTION[load.reason]}\n\n${load.indexPath}\n${load.detail}`}
      actions={
        <ActionPanel>
          <RegenerateAction onRegenerated={onRegenerated} />
          <Action.CopyToClipboard title="再生成コマンドをコピー" content={REGENERATE_COMMAND} />
          <Action title="Extensionの設定を開く" icon={Icon.Cog} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}

/**
 * 索引の基準日が今日と違うときの警告。今日の候補は基準日を引数に計算済みなので、
 * 日付をまたぐと hook が回るまで前日の並びが出たままになる。
 */
export function StaleNotice(props: { data: LoadedIndex; onRegenerated?: () => void }) {
  const { data, onRegenerated } = props;
  if (!data.stale) {
    return null;
  }
  return (
    <List.Item
      icon={{ source: Icon.Warning, tintColor: Color.Orange }}
      title="索引が古い"
      subtitle={`基準日 ${data.index.today.base_date}・⌘R で再生成できます`}
      accessories={[{ tag: { value: "要再生成", color: Color.Orange } }]}
      actions={
        <ActionPanel>
          <RegenerateAction onRegenerated={onRegenerated} />
          <Action.CopyToClipboard title="再生成コマンドをコピー" content={REGENERATE_COMMAND} />
        </ActionPanel>
      }
    />
  );
}
