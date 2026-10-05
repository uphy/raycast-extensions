import { Action, ActionPanel, Clipboard, closeMainWindow, Form, Icon, showHUD } from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import { createTaskPrompt, dispatchPrompt, loadIndex } from "./model";

// 思いついたタスクをその場で捕まえるためのフォーム。ここでもタスクファイルは書かず、
// `/task-manage add` を herdr に投げる。project と memo を先に載せておくと、向こうの
// Create詳細化（AskUserQuestion で不足分を聞く手順）で聞かれる回数がその分減る。
//
// **`add` であって `create` ではない**（subcommand の綴りは vault 側の SKILL.md が正典）。

/** タイトルとして使える先頭行の長さ。これを超えたら本文として memo へ回す。 */
const TITLE_MAX = 80;

export default function Command() {
  const { data } = usePromise(loadIndex);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [memo, setMemo] = useState("");
  const [titleError, setTitleError] = useState<string | undefined>();

  useEffect(() => {
    void prefill(setTitle, setMemo);
  }, []);

  const projects = data?.ok ? data.index.projects : [];

  return (
    <Form
      navigationTitle="タスクを追加"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Herdrに追加を依頼"
            icon={Icon.Terminal}
            onSubmit={async () => {
              if (!title.trim()) {
                setTitleError("タスク名を入れてください");
                return false;
              }
              return submit(title, project, memo);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="タスク名"
        placeholder="何をしたら終わりか分かる名前"
        value={title}
        error={titleError}
        onChange={(value) => {
          setTitle(value);
          setTitleError(undefined);
        }}
      />
      <Form.Dropdown id="project" title="Project" value={project} onChange={setProject}>
        <Form.Dropdown.Item value="" title="（Herdr側で決める）" icon={Icon.QuestionMark} />
        {projects.map((item) => (
          <Form.Dropdown.Item key={item.name} value={item.name} title={`${item.name}（${item.task_count}）`} />
        ))}
      </Form.Dropdown>
      <Form.TextArea
        id="memo"
        title="メモ"
        placeholder="背景・完了条件・期日など、分かっていること"
        value={memo}
        onChange={setMemo}
        info="そのまま /task-manage add の後ろに添えられます。空でも構いません。"
      />
    </Form>
  );
}

/** クリップボードを初期値に流し込む。1行に収まらない長文はタスク名にせず memo へ置く。 */
async function prefill(setTitle: (value: string) => void, setMemo: (value: string) => void): Promise<void> {
  const text = (await Clipboard.readText())?.trim();
  if (!text) {
    return;
  }
  const lines = text.split("\n");
  const first = lines[0].trim();
  if (first.length > 0 && first.length <= TITLE_MAX) {
    setTitle(first);
    const rest = lines.slice(1).join("\n").trim();
    if (rest) {
      setMemo(rest);
    }
    return;
  }
  setMemo(text);
}

async function submit(title: string, project: string, memo: string): Promise<boolean> {
  try {
    await dispatchPrompt(title.trim(), createTaskPrompt(title, project, memo));
    await closeMainWindow();
    await showHUD(`Herdr に追加を依頼しました: ${title.trim()}`);
    return true;
  } catch (error) {
    await showFailureToast(error, { title: "Herdr に追加を依頼できません" });
    return false;
  }
}
