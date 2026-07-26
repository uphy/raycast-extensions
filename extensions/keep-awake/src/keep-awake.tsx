import { Action, ActionPanel, Color, Icon, Image, List, showToast, Toast } from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useCallback, useEffect } from "react";
import { KeepAwakeState, readState, Status, statusOf, timerPresets, turnOff, turnOn } from "./model";

// 開いている間だけ実体を読み直す。期限切れは caffeinate 側で起きるので、
// 表示を追いつかせるにはこちらから見に行くしかない。
const REFRESH_INTERVAL_MS = 5000;

export default function Command() {
  const {
    data: state,
    isLoading,
    revalidate,
  } = usePromise(readState, [], { failureToastOptions: { title: "状態を読み取れませんでした" } });

  useEffect(() => {
    const timer = setInterval(() => {
      void revalidate();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [revalidate]);

  const apply = useCallback(
    async (running: string, done: string, action: () => Promise<void>) => {
      const toast = await showToast({ style: Toast.Style.Animated, title: running });
      try {
        await action();
        toast.style = Toast.Style.Success;
        toast.title = done;
      } catch (error) {
        await toast.hide();
        await showFailureToast(error, { title: "切り替えられませんでした" });
      }
      await revalidate();
    },
    [revalidate],
  );

  const status = state === undefined ? undefined : statusOf(state);
  const detail = <StatusDetail state={state} />;

  const reload = (
    <Action
      title="再読み込み"
      icon={Icon.ArrowClockwise}
      shortcut={{ modifiers: ["cmd"], key: "return" }}
      onAction={() => {
        void revalidate();
      }}
    />
  );

  return (
    <List isLoading={isLoading} isShowingDetail searchBarPlaceholder="操作を検索">
      <List.Section title="状態">
        <List.Item
          icon={statusIcon(status)}
          title={statusTitle(status)}
          subtitle={statusSubtitle(state)}
          accessories={statusAccessories(state)}
          detail={detail}
          actions={
            <ActionPanel>
              {status === "on" ? (
                <Action
                  title="無効化する"
                  icon={Icon.Xmark}
                  onAction={() => apply("無効化しています…", "無効化しました", turnOff)}
                />
              ) : (
                <Action
                  // partial のときは script command 版と同じく ON 側に揃える。
                  // ドリフトが勝手に OFF に倒れると、閉じた蓋の中で眠ってしまう。
                  title={status === "partial" ? "揃えて有効化する" : "無期限で有効化する"}
                  icon={Icon.Bolt}
                  onAction={() =>
                    apply("有効化しています…", "有効化しました", () => turnOn(state?.keeper?.durationSeconds ?? null))
                  }
                />
              )}
              {reload}
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title={status === "on" ? "タイマーを張り替える" : "有効化"}>
        {timerPresets().map((preset) => (
          <List.Item
            key={preset.seconds}
            icon={Icon.Clock}
            title={preset.label}
            accessories={[{ text: `${formatClock(deadline(preset.seconds))} まで` }]}
            detail={detail}
            actions={
              <ActionPanel>
                <Action
                  title={status === "on" ? `${preset.label}に張り替える` : `${preset.label}だけ有効化する`}
                  icon={Icon.Clock}
                  onAction={() =>
                    apply(`${preset.label}に設定しています…`, `${preset.label}後まで有効化しました`, () =>
                      turnOn(preset.seconds),
                    )
                  }
                />
                {reload}
              </ActionPanel>
            }
          />
        ))}
        <List.Item
          icon={Icon.Bolt}
          title="無期限"
          accessories={[{ text: "手動で無効化するまで" }]}
          detail={detail}
          actions={
            <ActionPanel>
              <Action
                title={status === "on" ? "無期限に張り替える" : "無期限で有効化する"}
                icon={Icon.Bolt}
                onAction={() => apply("有効化しています…", "無期限で有効化しました", () => turnOn(null))}
              />
              {reload}
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

function StatusDetail({ state }: { state: KeepAwakeState | undefined }) {
  if (state === undefined) {
    return <List.Item.Detail isLoading />;
  }
  const status = statusOf(state);
  const remaining = state.keeper?.remainingSeconds ?? null;
  return (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="状態" text={statusTitle(status)} icon={statusIcon(status)} />
          <List.Item.Detail.Metadata.Label
            title="残り"
            text={remaining !== null ? formatDuration(remaining) : state.keeper !== null ? "無期限" : "—"}
          />
          <List.Item.Detail.Metadata.Label
            title="期限"
            text={remaining !== null ? formatClock(deadline(remaining)) : "—"}
          />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="電源"
            text={state.onACPower ? "AC 電源" : "バッテリー駆動"}
            icon={state.onACPower ? Icon.Plug : Icon.Battery}
          />
          <List.Item.Detail.Metadata.Label
            title="Sleep"
            text={state.sleepDisabled ? "無効化されている" : "有効なまま"}
            icon={
              state.sleepDisabled
                ? { source: Icon.CheckCircle, tintColor: Color.Green }
                : { source: Icon.XMarkCircle, tintColor: Color.SecondaryText }
            }
          />
          <List.Item.Detail.Metadata.Label
            title="caffeinate"
            text={state.keeper !== null ? `PID ${state.keeper.pid}` : "動いていない"}
            icon={
              state.keeper !== null
                ? { source: Icon.CheckCircle, tintColor: Color.Green }
                : { source: Icon.XMarkCircle, tintColor: Color.SecondaryText }
            }
          />
          {!state.onACPower && state.keeper !== null && (
            <List.Item.Detail.Metadata.Label
              title="注意"
              text="caffeinate -s は AC 電源時のみ効く"
              icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
            />
          )}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function statusIcon(status: Status | undefined): Image.ImageLike {
  switch (status) {
    case "on":
      return { source: Icon.CircleFilled, tintColor: Color.Green };
    case "partial":
      return { source: Icon.Warning, tintColor: Color.Yellow };
    case "off":
      return { source: Icon.Circle, tintColor: Color.SecondaryText };
    default:
      return Icon.CircleEllipsis;
  }
}

function statusTitle(status: Status | undefined): string {
  switch (status) {
    case "on":
      return "ON";
    case "partial":
      return "一部のみ ON";
    case "off":
      return "OFF";
    default:
      return "確認中";
  }
}

function statusSubtitle(state: KeepAwakeState | undefined): string | undefined {
  if (state === undefined) {
    return undefined;
  }
  switch (statusOf(state)) {
    case "on":
      return state.keeper?.remainingSeconds != null
        ? `残り ${formatDuration(state.keeper.remainingSeconds)}`
        : "無期限";
    case "partial":
      return `${state.sleepDisabled ? "sleep 無効化済み" : "sleep 有効なまま"} / ${
        state.keeper !== null ? "caffeinate 稼働中" : "caffeinate なし"
      }`;
    default:
      return undefined;
  }
}

function statusAccessories(state: KeepAwakeState | undefined): List.Item.Accessory[] {
  if (state === undefined) {
    return [];
  }
  const accessories: List.Item.Accessory[] = [];
  const remaining = state.keeper?.remainingSeconds ?? null;
  if (remaining !== null) {
    accessories.push({ text: `${formatClock(deadline(remaining))} まで` });
  }
  if (!state.onACPower) {
    accessories.push({
      icon: { source: Icon.Battery, tintColor: Color.Yellow },
      tooltip: "バッテリー駆動中。caffeinate -s は AC 電源時のみ効く",
    });
  }
  return accessories;
}

function deadline(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
  }
  if (minutes > 0) {
    return `${minutes}分`;
  }
  return `${total}秒`;
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
