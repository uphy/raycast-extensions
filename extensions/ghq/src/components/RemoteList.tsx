import { Action, ActionPanel, closeMainWindow, Keyboard, List, popToRoot } from "@raycast/api";
import { directoryName, Remote } from "../model";

export function RemoteList(props: { repo: string; remotes: Remote[] }) {
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
    <List searchBarPlaceholder={`Select a remote for ${directoryName(props.repo)}`}>
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
