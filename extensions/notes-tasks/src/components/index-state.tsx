import { Action, ActionPanel, Color, Icon, List, openExtensionPreferences } from "@raycast/api";
import { IndexLoad, LoadedIndex, REGENERATE_COMMAND } from "../model";

type FailedIndex = Extract<IndexLoad, { ok: false }>;

const DESCRIPTION: Record<FailedIndex["reason"], string> = {
  missing: `${REGENERATE_COMMAND} を vault で実行するか、タスクを1件編集すると hook が生成します。`,
  unreadable: "索引を読めませんでした。Vault Path の設定を確認してください。",
  schema: "vault 側のスクリプトとこの extension のどちらかが古いので、揃えてください。",
};

/** 索引が読めないときの案内。この extension は書き込まないので、生成は vault 側に任せる。 */
export function IndexUnavailable(props: { load: FailedIndex }) {
  const { load } = props;
  return (
    <List.EmptyView
      icon={{ source: Icon.Warning, tintColor: Color.Orange }}
      title="索引を読み込めません"
      description={`${DESCRIPTION[load.reason]}\n\n${load.indexPath}\n${load.detail}`}
      actions={
        <ActionPanel>
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
export function StaleNotice(props: { data: LoadedIndex }) {
  const { data } = props;
  if (!data.stale) {
    return null;
  }
  return (
    <List.Item
      icon={{ source: Icon.Warning, tintColor: Color.Orange }}
      title="索引が古い"
      subtitle={`基準日 ${data.index.today.base_date}・タスクを編集するか再生成すると更新されます`}
      accessories={[{ tag: { value: "要再生成", color: Color.Orange } }]}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="再生成コマンドをコピー" content={REGENERATE_COMMAND} />
        </ActionPanel>
      }
    />
  );
}
