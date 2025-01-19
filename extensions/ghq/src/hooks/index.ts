import { getPreferenceValues } from "@raycast/api";
import { CommandRunner, directoryName, Repo } from "../model/command";
import { useEffect, useMemo, useState } from "react";
import { Preferences } from "../model/preferences";

export function usePreferences() {
  return useMemo(() => {
    return getPreferenceValues<Preferences>();
  }, []);
}

export function useCommandRunner(preferences: Preferences) {
  return useMemo(() => {
    return new CommandRunner(preferences.pathEnv);
  }, [preferences]);
}

export function useRepositories(preferences: Preferences, runner: CommandRunner) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const query = preferences.query;

  useEffect(() => {
    runner
      .list(query)
      .then((repoList) => {
        const repos = repoList.map((path) => {
          return {
            fullPath: path,
            name: directoryName(path),
          };
        });
        setRepos(repos);
      })
      .catch((error) => {
        console.error("Error fetching repositories:", error);
        setRepos([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { repos, loading };
}
