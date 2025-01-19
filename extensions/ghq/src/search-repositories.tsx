import { RepositoryList } from "./components/";
import { useCommandRunner, usePreferences, useRepositories } from "./hooks";

export default function Command() {
  const preferences = usePreferences();
  const runner = useCommandRunner(preferences);
  const { repos, loading } = useRepositories(preferences, runner);

  return <RepositoryList repos={repos} loading={loading} runner={runner} />;
}
