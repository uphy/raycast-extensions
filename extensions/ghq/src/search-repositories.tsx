import {
  ActionPanel,
  Action,
  List,
  useNavigation,
  getPreferenceValues,
  Keyboard,
  Icon,
  closeMainWindow,
  popToRoot,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { execFile, ExecFileOptions } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface Preferences {
  editor: string;
  query: string | undefined;
  pathEnv: string;
}

interface Repo {
  fullPath: string;
  name: string;
}

interface Remote {
  name: string;
  url: string;
}

interface ListRemoteProps {
  repo: Repo;
  remotes: Remote[];
}

class CommandRunner {
  constructor(private readonly pathEnv: string) {}

  async list(query?: string): Promise<Repo[]> {
    const result = await this.exec("ghq", ["list", "-p", query ?? ""]);
    return result
      .trim()
      .split("\n")
      .filter((path) => path !== "")
      .map((path) => ({
        fullPath: path,
        name: path.split("/").splice(-1)[0],
      }));
  }

  async openRepo(repo: Repo, editor: string): Promise<void> {
    await this.exec(editor, [repo.fullPath]);
  }

  async exists(command: string): Promise<boolean> {
    try {
      await this.exec("which", [command]);
      return true;
    } catch {
      return false;
    }
  }

  async remotes(repo: Repo): Promise<Remote[]> {
    return (await this.exec("git", ["remote", "-v"], { cwd: repo.fullPath }))
      .split("\n")
      .filter((line) => line.endsWith("(fetch)"))
      .map((line) => {
        const parts = line.split("\t");
        return {
          name: parts[0],
          url: parts[1].split(" ")[0],
        };
      });
  }

  private async exec(command: string, args: string[], options?: ExecFileOptions): Promise<string> {
    options = options || {};
    if (!options.env) {
      options.env = { ...process.env, PATH: `${process.env.PATH}:${this.pathEnv}` };
    }
    const result = await execFileAsync(command, args, options);
    return result.stdout;
  }
}

function ListRemote(props: ListRemoteProps) {
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

export default function Command() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const preferences = getPreferenceValues<Preferences>();
  const pathEnv = preferences.pathEnv;
  const query = preferences.query;
  const { pop, push } = useNavigation();

  const runner = new CommandRunner(pathEnv);

  useEffect(() => {
    runner
      .list(query)
      .then((repoList) => {
        setRepos(repoList);
      })
      .catch((error) => {
        console.error("Error fetching repositories:", error);
        setRepos([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [query]);

  const openRepo = async (repo: Repo, editor: string) => {
    try {
      pop();
      closeMainWindow();
      await runner.openRepo(repo, editor);
    } catch (error) {
      console.error("Error opening repository:", error);
    }
  };

  const openInBrowser = async (repo: Repo) => {
    const remotes = await runner.remotes(repo);
    push(<ListRemote repo={repo} remotes={remotes} />);
  };

  return (
    <List isLoading={loading} searchBarPlaceholder="Search for a repository...">
      {repos.map((repo) => (
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
