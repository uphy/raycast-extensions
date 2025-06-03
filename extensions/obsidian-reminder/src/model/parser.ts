import { homedir } from "os";
import { join } from "path";
import fs from "fs/promises";
import { ObsidianSettings } from "./obsidian-settings";

export function parseDate(settings: ReminderSetting, text: string): Date {
  // YYYY-MM-DD( HH:MM)
  const parts = text.split(" ");
  const dateParts = parts[0].split("-");
  let time: string;
  if (parts.length === 2) {
    time = parts[1];
  } else {
    time = settings.settings.reminderTime ?? "00:00";
  }

  const timeParts = time.split(":");

  const parsed = new Date(
    parseInt(dateParts[0]),
    parseInt(dateParts[1]) - 1,
    parseInt(dateParts[2]),
    parseInt(timeParts[0]),
    parseInt(timeParts[1]),
  );
  return parsed;
}
