import { homedir } from "os";
import { join } from "path";
import fs from "fs/promises";

export type ObsidianSettings = {
  vaults: {
    [vaultId: string]: {
      path: string;
      ts: number;
    };
  };
};

export async function readObsidianSettings(): Promise<ObsidianSettings> {
  const obsidianJsonFile = join(homedir(), "Library", "Application Support", "obsidian", "obsidian.json");
  return JSON.parse(await fs.readFile(obsidianJsonFile, "utf-8"));
}
