import { Detail, LaunchProps } from "@raycast/api";
import { RepositoryList } from "./components";
import { useCommandRunner, usePreferences } from "./hooks";
import { useEffect, useState } from "react";
import { RepositoryView } from "./components/RepositoryView";

type Arguments = {
  url: string;
};

export default function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const preferences = usePreferences();
  const runner = useCommandRunner(preferences);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<string>();

  useEffect(() => {
    async function clone() {
      setLoading(true);
      try {
        const path = await runner.clone(props.arguments.url);
        console.info(path);
        setPath(path);
      } finally {
        setLoading(false);
      }
    }
    clone();
  }, []);

  if (!path) {
    return <Detail isLoading={loading} markdown={`Cloning repository...`} />;
  }

  return <RepositoryView path={path} runner={runner} />;
}
