import { getPreferenceValues } from "@raycast/api";
import { access, constants } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

// 外部コマンドを起動するときの環境まわりを1箇所に集める層。herdr も python3 も同じ問題を
// 抱えているので、herdr.ts に置いていた PATH 解決をここへ出して両方から使う。
//
// Raycast のプロセスはログインシェルの PATH を継承せず、後から足した preference の既定値も
// 既存インストールには効かないことがある。そのため `execFile` の PATH 解決には任せず、
// 候補ディレクトリを自分で走査して絶対パスで起動する。

/**
 * 設定が空でも見に行く場所。herdr は `~/.local/bin` に置かれる（Homebrew ではない）ので、
 * Homebrew の既定（Apple silicon / Intel）と system の既定に加えてそこも見る。`~` は展開する。
 */
const FALLBACK_PATH_ENV = "~/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

type Preferences = {
  pathEnv?: string;
};

export class BinaryNotFoundError extends Error {
  constructor(
    readonly binaryName: string,
    readonly searched: string[],
  ) {
    super(`${binaryName} が見つかりません（探した場所: ${searched.join(", ")}）`);
    this.name = "BinaryNotFoundError";
  }
}

/** 実行ファイルを探す順。preference → Homebrew/system の既定 → Raycast が渡してきた PATH。 */
export function searchDirectories(): string[] {
  const { pathEnv } = getPreferenceValues<Preferences>();
  const directories = [pathEnv, FALLBACK_PATH_ENV, process.env.PATH]
    .flatMap((value) => (value ?? "").split(":"))
    .map((directory) => expandHome(directory.trim()))
    .filter((directory) => directory.length > 0);
  return [...new Set(directories)];
}

/**
 * 子プロセスに渡す環境。Raycast が注入する NODE_PATH / NODE_ENV は子プロセスの Node
 * ツールチェインを壊すので落とす（ghq の `CommandRunner` と同じ理由）。
 */
export function environment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: searchDirectories().join(":"),
    NODE_PATH: undefined,
    NODE_ENV: undefined,
  };
}

/** preference には `~/.local/bin` のように書けるようにする（execFile は `~` を展開しない）。 */
function expandHome(directory: string): string {
  return directory === "~" || directory.startsWith("~/") ? join(homedir(), directory.slice(1)) : directory;
}

const cache = new Map<string, string>();

/** 実行ファイルを絶対パスで解決する。どこを探したかは失敗時のエラーに載せる。 */
export async function resolveBinary(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }
  const directories = searchDirectories();
  for (const directory of directories) {
    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      cache.set(name, candidate);
      return candidate;
    } catch {
      // 次の候補へ
    }
  }
  throw new BinaryNotFoundError(name, directories);
}
