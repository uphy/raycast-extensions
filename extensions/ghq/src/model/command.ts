import { execFile, ExecFileOptions } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type Remote = {
  name: string;
  url: string;
};

export type PullRequest = {
  id: string;
  title: string;
  branch: string;
  createdAt: Date;
  url: string;
  body: string;
  author: {
    login: string;
    name: string;
  };
};

export function directoryName(path: string): string {
  return path.split("/").splice(-1)[0];
}

export class CommandRunner {
  constructor(private readonly pathEnv: string) {}

  async list(query?: string): Promise<string[]> {
    const result = await this.exec("ghq", ["list", "-p", query ?? ""]);
    return result.stdout
      .trim()
      .split("\n")
      .filter((path) => path !== "");
  }

  async openRepo(path: string, editor: string): Promise<void> {
    await this.exec(editor, [path]);
  }

  async remotes(path: string): Promise<Remote[]> {
    return (await this.exec("git", ["remote", "-v"], { cwd: path })).stdout
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

  async pullRequests(path: string, query?: string): Promise<PullRequest[]> {
    const q = query ?? "state:open";
    const result = await this.exec(
      "gh",
      ["pr", "list", "--json", "number,title,headRefName,createdAt,url,body,author", "--search", q],
      { cwd: path },
    );
    const parsed = JSON.parse(result.stdout) as {
      number: number;
      title: string;
      headRefName: string;
      createdAt: string;
      url: string;
      body: string;
      author: any;
    }[];
    return parsed.map((pr) => {
      return {
        id: `#${pr.number}`,
        title: pr.title,
        branch: pr.headRefName,
        createdAt: new Date(pr.createdAt),
        url: pr.url,
        body: pr.body,
        author: pr.author,
      };
    });
  }

  async openPullRequestList(path: string): Promise<void> {
    await this.exec("gh", ["pr", "list", "--web"], { cwd: path });
  }

  async clone(url: string): Promise<string | undefined> {
    const result = await this.exec("ghq", ["get", url]);
    console.info(result);
    return result.stderr
      .trim()
      .split("\n")
      .map((line) => {
        line = line.trim();
        {
          const match = line.match(/clone.+ -> (.+)/);
          if (match) {
            return match[1];
          }
        }
        {
          const match = line.match(/.*exists.+? (.+)/);
          if (match) {
            return match[1];
          }
        }
      })
      .find((line): line is NonNullable<typeof line> => line != null);
  }

  private async exec(
    command: string,
    args: string[],
    options?: ExecFileOptions,
  ): Promise<{ stdout: string; stderr: string }> {
    options = options || {};
    if (!options.env) {
      options.env = {
        ...process.env,
        PATH: `${process.env.PATH}:${this.pathEnv}`,
        NODE_PATH: undefined,
        NODE_ENV: undefined,
      };
    }
    const result = await execFileAsync(command, args, options);
    return result;
  }
}
