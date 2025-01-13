import { LaunchProps } from "@raycast/api";
import { RepositoryList } from "./lib/components";
import { useCommandRunner, usePreferences, useRepositories } from "./lib/hooks";

type Arguments = {
  url: string;
};

export default function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const preferences = usePreferences();
  const runner = useCommandRunner(preferences);

  return <RepositoryList repos={repos} loading={loading} runner={runner} />;
}
