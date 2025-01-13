import { Action, ActionPanel, closeMainWindow, Icon, Keyboard, List, popToRoot, useNavigation } from "@raycast/api";
import { CommandRunner, Remote, Repo } from "./command";
import { useCommandRunner, usePreferences, useRepositories } from "./hooks";

interface RemoteListProps {
  repo: Repo;
  remotes: Remote[];
}

export function RemoteList(props: RemoteListProps) {
  function remoteToUrl(remote: Remote): string | undefined {
    const URL_PATTERNS: Array<RegExp> = [
      /^(ssh:\/\/)?git@(?<host>.*?)([:/])(?<repo>.*?)(\.git)?$/,
      /^https:\/\/(?<host>.*?)\/(?<repo>.*?)(\.git)?$/,
    ];

    for (const urlPattern of URL_PATTERNS) {
      const match = remote.url.match(urlPattern);
      if (match && match.groups) {
        return `https://${match.groups["host"]}/${match.groups["repo"]}`;
      }
    }
    return undefined;
  }

  const remotes = props.remotes
    .map((remote) => {
      const url = remoteToUrl(remote);
      return url ? { ...remote, url } : null;
    })
    .filter((remote) => remote !== null) as Remote[];

  const afterAction = () => {
    popToRoot();
    closeMainWindow();
  };

  return (
    <List searchBarPlaceholder={`Select a remote for ${props.repo.name}`}>
      {remotes.map((remote) => (
        <List.Item
          key={remote.name}
          title={remote.name}
          subtitle={remote.url}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open in Browser"
                url={remote.url}
                onOpen={afterAction}
                shortcut={Keyboard.Shortcut.Common.Open}
              />
              <Action.CopyToClipboard title="Copy URL" content={remote.url} shortcut={Keyboard.Shortcut.Common.Copy} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

type RepositoryListProps = {
  runner: CommandRunner;
  repos: Repo[];
  loading: boolean;
};

export function RepositoryList(props: RepositoryListProps) {
  const { pop, push } = useNavigation();

  const openRepo = async (repo: Repo, editor: string) => {
    try {
      pop();
      closeMainWindow();
      await props.runner.openRepo(repo, editor);
    } catch (error) {
      console.error("Error opening repository:", error);
    }
  };

  const openInBrowser = async (repo: Repo) => {
    const remotes = await props.runner.remotes(repo);
    push(<RemoteList repo={repo} remotes={remotes} />);
  };

  return (
    <List isLoading={props.loading} searchBarPlaceholder="Search for a repository...">
      {props.repos.map((repo) => (
        <List.Item
          key={repo.fullPath}
          title={repo.name}
          subtitle={repo.fullPath}
          actions={
            <ActionPanel>
              <Action
                title={`Open with Visual Studio Code`}
                onAction={() => openRepo(repo, "code")}
                icon={{ source: Icon.Code, tintColor: "#007ACC" }}
              />
              <Action
                title={`Open with IntelliJ IDEA`}
                onAction={() => openRepo(repo, "idea")}
                icon={{ source: Icon.Code, tintColor: "#007ACC" }}
              />
              <Action
                title={`Open in Browser`}
                onAction={() => openInBrowser(repo)}
                icon={{ source: Icon.Globe, tintColor: "#007ACC" }}
                shortcut={Keyboard.Shortcut.Common.Open}
              />
              <Action.CopyToClipboard
                title="Copy Path"
                content={repo.fullPath}
                shortcut={Keyboard.Shortcut.Common.CopyPath}
              />
              <Action.ShowInFinder
                title="Show in Finder"
                path={repo.fullPath}
                shortcut={Keyboard.Shortcut.Common.OpenWith}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
