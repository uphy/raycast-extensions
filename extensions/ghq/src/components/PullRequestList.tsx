import { Action, ActionPanel, Detail, Icon, Keyboard, List, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { CommandRunner, PullRequest, SavedQuery, storage } from "../model";
import { SavedQueryForm } from "./PullRequestListSavedQueryForm";
import { randomUUID } from "crypto";

export function PullRequestList(props: { repo: string; runner: CommandRunner }) {
  const [history, setHistory] = useState<string[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const { push } = useNavigation();

  useEffect(() => {
    storage.getQueryHistory(props.repo).then((h) => {
      setHistory(h);
    });

    storage.getSavedQueries(props.repo).then((q) => {
      setSavedQueries(q);
    });
  }, []);

  async function deleteQueryHistory(query: string) {
    await storage.deleteQueryHistory(props.repo, query);
    setHistory(await storage.getQueryHistory(props.repo));
  }

  function search(query: string) {
    push(<Search repo={props.repo} initQuery={query} runner={props.runner} />);
  }

  function saveQuery(query: string) {
    push(
      <SavedQueryForm
        title="Save Query"
        initValue={{
          id: randomUUID(),
          name: "Saved Query",
          query,
        }}
        onSubmit={(savedQuery) => {
          async function addSavedQuery() {
            await storage.addSavedQuery(props.repo, savedQuery);
            setSavedQueries(await storage.getSavedQueries(props.repo));
          }

          addSavedQuery();
        }}
      />,
    );
  }

  function editSavedQuery(query: SavedQuery) {
    push(
      <SavedQueryForm
        title="Edit Saved Query"
        initValue={query}
        onSubmit={(savedQuery) => {
          async function updateSavedQuery() {
            await storage.updateSavedQuery(props.repo, savedQuery);
            setSavedQueries(await storage.getSavedQueries(props.repo));
          }

          updateSavedQuery();
        }}
      />,
    );
  }

  function moveUpDownSavedQuery(query: SavedQuery, direction: "up" | "down") {
    async function moveUpDownSavedQuery() {
      await storage.moveUpDownSavedQuery(props.repo, query, direction);
      setSavedQueries(await storage.getSavedQueries(props.repo));
    }

    moveUpDownSavedQuery();
  }

  function deleteSavedQuery(id: string) {
    async function deleteSavedQuery() {
      await storage.deleteSavedQuery(props.repo, id);
      setSavedQueries(await storage.getSavedQueries(props.repo));
    }

    deleteSavedQuery();
  }

  return (
    <List>
      <List.Item
        title="Search"
        icon={Icon.ArrowRight}
        actions={
          <ActionPanel>
            <Action title="Search" onAction={() => search("state:open")} />
          </ActionPanel>
        }
      />
      <List.Section title="Saved Queries">
        {savedQueries.map((q) => (
          <List.Item
            key={q.id}
            title={q.name}
            icon={Icon.Star}
            actions={
              <ActionPanel>
                <Action title="Search" onAction={() => search(q.query)} />
                <Action title="Edit" onAction={() => editSavedQuery(q)} shortcut={Keyboard.Shortcut.Common.Edit} />
                <Action title="Move Up" onAction={() => moveUpDownSavedQuery(q, "up")} />
                <Action title="Move Down" onAction={() => moveUpDownSavedQuery(q, "down")} />
                <Action
                  title="Delete"
                  onAction={() => deleteSavedQuery(q.id)}
                  style={Action.Style.Destructive}
                  shortcut={Keyboard.Shortcut.Common.Remove}
                />
              </ActionPanel>
            }
          ></List.Item>
        ))}
      </List.Section>
      <List.Section title="History">
        {history.map((q) => (
          <List.Item
            key={q}
            title={q}
            icon={Icon.Filter}
            actions={
              <ActionPanel>
                <Action title="Search" onAction={() => search(q)} />
                <Action title="Save Query" onAction={() => saveQuery(q)} />
                <Action
                  title="Delete"
                  onAction={() => deleteQueryHistory(q)}
                  style={Action.Style.Destructive}
                  shortcut={Keyboard.Shortcut.Common.Remove}
                />
              </ActionPanel>
            }
          ></List.Item>
        ))}
      </List.Section>
    </List>
  );
}

export function Search(props: { repo: string; initQuery: string; runner: CommandRunner }) {
  const [loading, setLoading] = useState(true);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [query, setQuery] = useState<string>(props.initQuery);
  const { push } = useNavigation();

  useEffect(() => {
    async function fetchPullRequests() {
      if (query == null) {
        return;
      }

      console.info(`Fetching pull requests for ${props.repo} with query: ${query}`);
      try {
        const results = await props.runner.pullRequests(props.repo, query);
        setPullRequests(results);
        if (results.length > 0) {
          const q = query.trim();
          if (q.length > 0) {
            await storage.pushQueryHistory(props.repo, q);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    fetchPullRequests();
  }, [query]);

  function pullRequestToMarkdown(pr: PullRequest): string {
    return `${pr.body}`;
  }

  function saveQuery(query: string) {
    push(
      <SavedQueryForm
        title="Save Query"
        initValue={{
          id: randomUUID(),
          name: "Saved Query",
          query,
        }}
        onSubmit={(savedQuery) => {
          async function addSavedQuery() {
            await storage.addSavedQuery(props.repo, savedQuery);
          }

          addSavedQuery();
        }}
      />,
    );
  }

  return (
    <List
      isLoading={loading}
      isShowingDetail={true}
      searchText={query}
      onSearchTextChange={setQuery}
      throttle={true}
      filtering={false}
    >
      <List.Section title="Results">
        {pullRequests.map((pr) => (
          <List.Item
            key={pr.id}
            title={pr.title}
            icon={Icon.ArrowRight}
            detail={
              <Detail
                markdown={pullRequestToMarkdown(pr)}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Title" text={pr.title} />
                    <List.Item.Detail.Metadata.Label title="Author" text={pr.author.name} />
                    <List.Item.Detail.Metadata.Label title="Branch" text={pr.branch} />
                  </List.Item.Detail.Metadata>
                }
              ></Detail>
            }
            actions={
              <ActionPanel>
                <Action.OpenInBrowser title="Open in Browser" url={pr.url} />
                <Action.CopyToClipboard title="Copy URL" content={pr.url} />
                <ActionPanel.Section title="Query">
                  <Action title="Save Query" onAction={() => saveQuery(query)} />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
