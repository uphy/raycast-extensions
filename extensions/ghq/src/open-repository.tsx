import { LaunchProps } from "@raycast/api";
import { useCommandRunner, usePreferences } from "./hooks";
import { RepositoryView } from "./components/RepositoryView";

type Arguments = {
  path: string;
};

export default function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const path = props.arguments.path;
  const preferences = usePreferences();
  const runner = useCommandRunner(preferences);

  return <RepositoryView path={path} runner={runner} />;
}
