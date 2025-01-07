import { Cache, clearSearchBar, closeMainWindow, getPreferenceValues } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

interface SlackOperatorPreferences {
  slackLaunchWait: string;
}

export async function openSlackAndSendKeys(keys: string) {
  const preferences = getPreferenceValues<SlackOperatorPreferences>();
  const waitTime = preferences.slackLaunchWait;
  await clearSearchBar();
  await closeMainWindow();

  console.info("Opening Slack and sending keys", keys);
  await runAppleScript(`
    tell application "Slack"
        activate
    end tell

    delay ${waitTime}

    tell application "System Events"
        keystroke ${keys}
    end tell
`);
  console.info("Slack opened and keys sent");
}
