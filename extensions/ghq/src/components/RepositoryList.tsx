import { Action, ActionPanel, Icon, List, useNavigation } from "@raycast/api";
import { CommandRunner, Repo } from "../model";
import { RepositoryView } from "./RepositoryView";
import { createDeeplink } from "@raycast/utils";

export function RepositoryList(props: { runner: CommandRunner; repos: Repo[]; loading: boolean }) {
  function deeplink(repo: Repo) {
    return createDeeplink({
      command: "open-repository",
      arguments: {
        path: repo.fullPath,
      },
    });
  }
  return (
    <List isLoading={props.loading} searchBarPlaceholder="Search for a repository...">
      {props.repos.map((repo) => (
        <List.Item
          key={repo.fullPath}
          title={repo.name}
          subtitle={repo.fullPath}
          actions={
            <ActionPanel>
              <Action.Push title="Open" target={<RepositoryView path={repo.fullPath} runner={props.runner} />} />
              <Action.CreateQuicklink
                title="Create Quicklink"
                quicklink={{
                  name: `Repository - ${repo.name}`,
                  link: deeplink(repo),
                }}
              />
            </ActionPanel>
          }
          icon={Icon.Folder}
        />
      ))}
    </List>
  );
}
