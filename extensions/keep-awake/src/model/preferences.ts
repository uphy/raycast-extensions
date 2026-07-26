import { getPreferenceValues } from "@raycast/api";

export interface Preferences {
  timerPresets: string | undefined;
}

export type TimerPreset = {
  label: string;
  seconds: number;
};

const DEFAULT_PRESETS = "30m, 1h, 3h, 8h";

/** preference の書式が壊れていても操作不能にならないよう、読めた分だけ使い、全滅なら既定に戻す。 */
export function timerPresets(): TimerPreset[] {
  const configured = parsePresets(getPreferenceValues<Preferences>().timerPresets ?? "");
  return configured.length > 0 ? configured : parsePresets(DEFAULT_PRESETS);
}

function parsePresets(value: string): TimerPreset[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map(parsePreset)
    .filter((preset): preset is TimerPreset => preset !== null);
}

function parsePreset(entry: string): TimerPreset | null {
  const match = /^(\d+)\s*([mh])$/i.exec(entry);
  if (match === null) {
    return null;
  }
  const amount = Number(match[1]);
  if (amount <= 0) {
    return null;
  }
  const isHours = match[2].toLowerCase() === "h";
  return {
    label: isHours ? `${amount}時間` : `${amount}分`,
    seconds: amount * (isHours ? 3600 : 60),
  };
}
