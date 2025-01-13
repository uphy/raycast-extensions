import { execFile, ExecFileOptions } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface Repo {
  fullPath: string;
  name: string;
}

export interface Remote {
  name: string;
  url: string;
}

export class CommandRunner {
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

  async clone(url: string, options?: CloneOptions): Promise<void> {
    const args: string[] = ["get"];
    const update = options?.update ?? false;
    const shallow = options?.shallow ?? false;

    await this.exec("ghq", ["get", url]);
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

type CloneOptions = {
  update: boolean;
  shallow: boolean;
  branch: string;
};
