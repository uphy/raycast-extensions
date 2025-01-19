import { Action, ActionPanel, Detail, List } from "@raycast/api";
import { useEffect, useState } from "react";
import { CommandRunner, PullRequest, Repo } from "../model";

export function PullRequestList(props: { repo: string; runner: CommandRunner }) {
  const [loading, setLoading] = useState(true);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  useEffect(() => {
    async function fetchPullRequests() {
      try {
        setPullRequests(await props.runner.pullRequests(props.repo));
      } finally {
        setLoading(false);
      }
    }
    fetchPullRequests();
  }, []);

  function pullRequestToMarkdown(pr: PullRequest): string {
    return `# ${pr.title}

${pr.body}`;
  }
  return (
    <List isLoading={loading} isShowingDetail={true}>
      {pullRequests.map((pr) => (
        <List.Item
          key={pr.id}
          title={pr.title}
          detail={<Detail markdown={pullRequestToMarkdown(pr)}></Detail>}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open in Browser" url={pr.url} />
              <Action.CopyToClipboard title="Copy URL" content={pr.url} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
