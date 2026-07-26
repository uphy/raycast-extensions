import {
  Action,
  ActionPanel,
  closeMainWindow,
  Color,
  Icon,
  Image,
  LaunchProps,
  List,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useCallback, useEffect, useRef } from "react";
import { KeepAwakeState, parseDuration, readState, Status, statusOf, timerPresets, turnOff, turnOn } from "./model";

// 開いている間だけ実体を読み直す。期限切れは caffeinate 側で起きるので、
// 表示を追いつかせるにはこちらから見に行くしかない。
const REFRESH_INTERVAL_MS = 5000;

type Arguments = {
  /** `on` / `off` / `30m` / `3h`。空なら通常どおり UI を開くだけ */
  state: string;
};

export default function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const requested = (props.arguments?.state ?? "").trim().toLowerCase();
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

  // 引数付きの起動は deeplink / Quicklink / ホットキーからの「操作の指示」なので、
  // 適用して窓を閉じ、UI を見せずに終える。これがあるおかげで外部のシェルから
  // 状態を切り替えられ、同じロジックを shell 側に持つ必要がない。
  //
  // deeplink に launchType=background は付けられない。付けると view コマンドは
  // 実行すらされない(実測: 痕跡も状態変化もゼロ)。付けなければ窓はフォーカスを
  // 奪わずに開くので、閉じるのはこちらの仕事になる。
  const handled = useRef(false);
  useEffect(() => {
    if (requested === "" || handled.current) {
      return;
    }
    handled.current = true;
    void (async () => {
      try {
        const message = await applyArgument(requested);
        await showHUD(message);
        await closeMainWindow();
      } catch (error) {
        // 失敗したときは閉じない。状態を見せて理由に気づけるようにする。
        await showFailureToast(error, { title: "切り替えられませんでした" });
        await revalidate();
      }
    })();
  }, [requested, revalidate]);

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
  const primary = primaryAction(state);

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
      {/* 一覧の項目は「いま Enter を押すと起きること」を名乗る。状態を名乗らせると
          ラベルと挙動がずれ、ActionPanel を開くまで何が走るか分からなくなる。
          状態は同じ行の subtitle と右のバッジが持つので、ひと目で分かるままにできる。 */}
      <List.Item
        icon={primary.icon}
        title={primary.title}
        accessories={statusAccessories(state)}
        detail={detail}
        actions={
          <ActionPanel>
            <Action
              title={primary.title}
              icon={primary.icon}
              onAction={() => apply(primary.running, primary.done, primary.run)}
            />
            {reload}
          </ActionPanel>
        }
      />
      <List.Section title={status === "on" ? "タイマーを張り替える" : "時間を決めて有効化"}>
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
        {/* ON でないときは先頭の項目がそのまま「無期限で有効化する」なので、
            ここに並べると同じ操作が 2 つになる。 */}
        {status === "on" && (
          <List.Item
            icon={Icon.Bolt}
            title="無期限にする"
            detail={detail}
            actions={
              <ActionPanel>
                <Action
                  title="無期限にする"
                  icon={Icon.Bolt}
                  onAction={() => apply("有効化しています…", "無期限で有効化しました", () => turnOn(null))}
                />
                {reload}
              </ActionPanel>
            }
          />
        )}
      </List.Section>
    </List>
  );
}

async function applyArgument(requested: string): Promise<string> {
  if (requested === "off") {
    await turnOff();
    return "常時起動モード: OFF";
  }
  if (requested === "on") {
    await turnOn(null);
    return "常時起動モード: ON（無期限）";
  }
  const duration = parseDuration(requested);
  if (duration === null) {
    throw new Error(`引数 "${requested}" を解釈できません。on / off / 30m / 3h のいずれかを渡してください。`);
  }
  await turnOn(duration.seconds);
  return `常時起動モード: ON（${duration.label}）`;
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

type PrimaryAction = {
  title: string;
  icon: Icon;
  running: string;
  done: string;
  run: () => Promise<void>;
};

/** 先頭の項目に置く「いま一番やりたいであろう操作」。 */
function primaryAction(state: KeepAwakeState | undefined): PrimaryAction {
  if (state !== undefined && statusOf(state) === "on") {
    return {
      title: "無効化する",
      icon: Icon.Xmark,
      running: "無効化しています…",
      done: "無効化しました",
      run: turnOff,
    };
  }
  // partial のときは script command 版と同じく ON 側に揃える。ドリフトが勝手に
  // OFF に倒れると、閉じた蓋の中で眠ってしまう。
  const duration = state?.keeper?.durationSeconds ?? null;
  return {
    title: state !== undefined && statusOf(state) === "partial" ? "揃えて有効化する" : "無期限で有効化する",
    icon: Icon.Bolt,
    running: "有効化しています…",
    done: "有効化しました",
    run: () => turnOn(duration),
  };
}

// タイトルが操作を名乗る分、状態はこのバッジが受け持つ。
//
// 残り時間・期限・電源はあえて載せない。isShowingDetail で左が狭く、詰めると
// 「残…」「...」と切れて読めなくなるうえ、どれも隣の詳細パネルにフルで出ている。
function statusAccessories(state: KeepAwakeState | undefined): List.Item.Accessory[] {
  return state === undefined ? [] : [statusTag(statusOf(state))];
}

function statusTag(status: Status): List.Item.Accessory {
  switch (status) {
    case "on":
      return { tag: { value: "ON", color: Color.Green } };
    case "partial":
      return { tag: { value: "一部のみ ON", color: Color.Yellow } };
    default:
      return { tag: { value: "OFF", color: Color.SecondaryText } };
  }
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
