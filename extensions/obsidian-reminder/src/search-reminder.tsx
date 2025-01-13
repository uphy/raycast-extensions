import { ActionPanel, Action, Icon, List, Detail, Keyboard } from "@raycast/api";
import { useEffect, useState } from "react";
import { showFailureToast } from "@raycast/utils";
import { readObsidianSettings, parseDate, readReminderSettings, formatDate, groupReminder, Group } from "./model";

type ReminderListItem = {
  vault: {
    id: string;
    path: string;
  };
  file: string;
  rowNumber: number;
  title: string;
  datetime: Date;
};

async function listReminders(): Promise<ReminderListItem[]> {
  const obsidianSettings = await readObsidianSettings();

  const items: ReminderListItem[] = [];
  for await (const [vaultId, vault] of Object.entries(obsidianSettings.vaults)) {
    const reminderSettings = await readReminderSettings(vault.path);
    if (!reminderSettings) {
      continue;
    }
    for (const file in reminderSettings.reminders) {
      const reminders = reminderSettings.reminders[file];
      for (const reminder of reminders) {
        items.push({
          vault: {
            id: vaultId,
            path: vault.path,
          },
          file: file,
          rowNumber: parseInt(reminder.rowNumber),
          title: reminder.title,
          datetime: parseDate(reminderSettings, reminder.time),
        });
      }
    }
  }
  return items;
}

function reminderToMarkdown(listItem: ReminderListItem): string {
  return `## ${listItem.title}

- **File**: \`${listItem.file}\`
- **Due**: ${formatDate(listItem.datetime)}
- **Row**: ${listItem.rowNumber}
- **Vault**: \`${listItem.vault.path}\`
`;
}

function markdownToPlainText(markdown: string): string {
  // remove link
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#/g, "")
    .trim();
}

function extractFilename(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/, "");
}

export default function Command() {
  const [items, setItems] = useState<ReminderListItem[]>([]);
  const [groups, setGroups] = useState<Group<ReminderListItem>[]>([]);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    async function readSetting() {
      try {
        const items = (await listReminders()).sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
        console.info(items);
        const groups = groupReminder(items, (item) => item.datetime);
        setGroups(groups);
      } catch (e) {
        await showFailureToast("Failed to read reminder setting file", { message: `${e}` });
      }
    }

    readSetting();
  }, []);

  return (
    <List isShowingDetail={showDetail}>
      {groups.map((group) => (
        <List.Section title={group.name}>
          {group.reminders.map((listItem) => (
            <List.Item
              icon={Icon.Clock}
              title={`${markdownToPlainText(listItem.title)}`}
              subtitle={`${extractFilename(listItem.file)}`}
              accessories={[
                {
                  text: group.format(listItem.datetime),
                  tooltip: formatDate(listItem.datetime),
                },
              ]}
              actions={
                <ActionPanel>
                  <Action.Open
                    title="Open in Obsidian"
                    target={"obsidian://open?vault=" + listItem.vault.id + "&file=" + encodeURIComponent(listItem.file)}
                  />
                  <Action.CopyToClipboard content={listItem.title} />
                  <Action
                    title="Toggle Detail"
                    onAction={() => setShowDetail(!showDetail)}
                    shortcut={Keyboard.Shortcut.Common.ToggleQuickLook}
                  />
                </ActionPanel>
              }
              detail={<Detail markdown={reminderToMarkdown(listItem)} />}
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
