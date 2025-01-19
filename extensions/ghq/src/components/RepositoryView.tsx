import { Action, ActionPanel, closeMainWindow, Icon, Keyboard, List, useNavigation } from "@raycast/api";
import { CommandRunner, directoryName } from "../model";
import { RemoteList } from "./RemoteList";
import { PullRequestList } from "./PullRequestList";

export function RepositoryView(props: { path: string; runner: CommandRunner }) {
  const { push } = useNavigation();

  async function openRepo(path: string, editor: string) {
    try {
      await closeMainWindow();
      await props.runner.openRepo(path, editor);
    } catch (error) {
      console.error("Error opening repository:", error);
    }
  }
  async function openInBrowser(path: string) {
    const remotes = await props.runner.remotes(path);
    push(<RemoteList repo={path} remotes={remotes} />);
  }
  async function openPullRequests(path: string) {
    push(<PullRequestList repo={path} runner={props.runner} />);
  }

  async function openPullRequestsInBrowser(path: string) {
    await props.runner.openPullRequestList(path);
  }

  return (
    <List navigationTitle={directoryName(props.path)}>
      <List.Section title="Editor">
        <List.Item
          title="Open with Visual Studio Code"
          actions={
            <ActionPanel>
              <Action title="Open" onAction={() => openRepo(props.path, "code")} />
            </ActionPanel>
          }
          icon={{ source: Icon.Code, tintColor: "#007ACC" }}
        />
        <List.Item
          title="Open with IntelliJ IDEA"
          actions={
            <ActionPanel>
              <Action title="Open" onAction={() => openRepo(props.path, "idea")} />
            </ActionPanel>
          }
          icon={{ source: Icon.Code, tintColor: "#007ACC" }}
        />
      </List.Section>
      <List.Section title="Browser">
        <List.Item
          title="Open in Browser"
          actions={
            <ActionPanel>
              <Action title="Open" onAction={() => openInBrowser(props.path)} />
            </ActionPanel>
          }
          icon={{ source: Icon.Globe, tintColor: "#007ACC" }}
        />
        <List.Item
          title="Pull Requests"
          actions={
            <ActionPanel>
              <Action title="Open" onAction={() => openPullRequests(props.path)} />
              <Action title="Open in Browser" onAction={() => openPullRequestsInBrowser(props.path)} />
            </ActionPanel>
          }
          icon={{ source: Icon.Globe, tintColor: "#007ACC" }}
        />
      </List.Section>
      <List.Section title="Other">
        <List.Item
          title="Copy to Clipboard"
          actions={
            <ActionPanel>
              <Action.CopyToClipboard
                title="Copy Path"
                content={props.path}
                shortcut={Keyboard.Shortcut.Common.CopyPath}
              />
            </ActionPanel>
          }
          icon={{ source: Icon.Folder, tintColor: "#007ACC" }}
        />
        <List.Item
          title="Show in Finder"
          actions={
            <ActionPanel>
              <Action.ShowInFinder
                title="Show in Finder"
                path={props.path}
                shortcut={Keyboard.Shortcut.Common.OpenWith}
              />
            </ActionPanel>
          }
          icon={{ source: Icon.Folder, tintColor: "#007ACC" }}
        />
      </List.Section>
    </List>
  );
}
