import { getPreferenceValues } from "@raycast/api";
import { CommandRunner, Repo } from "./command";
import { useEffect, useState } from "react";
import { Preferences } from "./preferences";

export function usePreferences() {
  return getPreferenceValues<Preferences>();
}

export function useCommandRunner(preferences: Preferences) {
  return new CommandRunner(preferences.pathEnv);
}

export function useRepositories(preferences: Preferences, runner: CommandRunner) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const query = preferences.query;

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
  }, []);

  return { repos, loading };
}
