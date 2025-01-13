import { join } from "path";
import fs from "fs/promises";

export type ReminderSettings = {
  reminders: { [file: string]: Reminder[] };
  settings: {
    reminderTime: string;
  };
};

export type Reminder = {
  title: string;
  time: string;
  rowNumber: string;
};

export async function readReminderSettings(vaultPath: string): Promise<ReminderSettings | null> {
  const reminderSettingFile = join(vaultPath, ".obsidian", "plugins", "obsidian-reminder-plugin", "data.json");
  if (!(await fs.stat(reminderSettingFile)).isFile()) {
    return null;
  }
  return JSON.parse(await fs.readFile(reminderSettingFile, "utf-8"));
}

export function parseDate(settings: ReminderSettings, text: string): Date {
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

export function formatDate(date: Date): string {
  // YYYY-MM-DD HH:MM
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export type Group<T> = {
  name: string;
  reminders: T[];
  format: (date: Date) => string;
};

export function groupReminder<T>(reminders: T[], dueFunc: (reminder: T) => Date): Group<T>[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const nextMonth = new Date(today);
  nextMonth.setMonth(today.getMonth() + 1);

  const groups: Group<T>[] = [
    {
      name: "Overdue",
      reminders: [],
      format: (date) => date.toISOString().split("T")[0],
    },
    {
      name: "Today",
      reminders: [],
      format: (date) => date.toTimeString().slice(0, 5),
    },
    {
      name: "Tomorrow",
      reminders: [],
      format: (date) => date.toTimeString().slice(0, 5),
    },
    {
      name: "In a week",
      reminders: [],
      format: (date) => `${date.getMonth() + 1}/${date.getDate()}`,
    },
    {
      name: "In a month",
      reminders: [],
      format: (date) => `${date.getMonth() + 1}/${date.getDate()}`,
    },
    {
      name: "Over 1 month",
      reminders: [],
      format: (date) => `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`,
    },
  ];

  reminders.forEach((reminder) => {
    const dueDate = dueFunc(reminder);

    if (dueDate < today) {
      groups[0].reminders.push(reminder); // Overdue
    } else if (dueDate >= today && dueDate < tomorrow) {
      groups[1].reminders.push(reminder); // Today
    } else if (dueDate >= tomorrow && dueDate < dayAfterTomorrow) {
      groups[2].reminders.push(reminder); // Tomorrow
    } else if (dueDate >= dayAfterTomorrow && dueDate < nextWeek) {
      groups[3].reminders.push(reminder); // MM/DD (1 week or less)
    } else if (dueDate >= nextWeek && dueDate < nextMonth) {
      groups[4].reminders.push(reminder); // Over 1 week
    } else if (dueDate >= nextMonth) {
      groups[5].reminders.push(reminder); // Over 1 month
    }
  });

  return groups.map((group) => ({
    ...group,
    reminders: group.reminders.map((reminder) => ({
      ...reminder,
      formattedDate: group.format(dueFunc(reminder)),
    })),
  }));
}
