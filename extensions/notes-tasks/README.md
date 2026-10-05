# Notes Tasks

Browse the work items of an Obsidian vault task system — one file per task, an outline that carries the ordering, and a deterministic script that derives today's candidates from both.

| Command | Description |
| --- | --- |
| Today's Tasks | Today's candidates in the order the vault derived, plus what starts soon and what is excluded |
| Search Work Items | Every work item, filtered by project, backlog or blocking, with what each one unblocks |
| Capture Task | A new work item, prefilled from the clipboard, handed to the vault's task skill |
| Top Task | The first candidate in the menu bar, as a single coloured dot |
| Start Task | Start or close a work item by name. Meant for the deeplink in the vault's HTML task view |
| Morning Planning / Daily Routine / Wrap up Session / Review Work Items | The task skill's other modes, each in its own herdr tab |

## The menu bar carries state in colour, not width

Japanese task names are wide, so the menu bar shows the icon alone by default and puts the meaning in its colour: red when something is overdue, purple when the index is stale, green when there is nothing left, otherwise the top candidate's priority colour. The name and the counts live in the tooltip and the dropdown, which is where you look once you have noticed the colour.

**Menu Bar Display** switches this to icon plus overdue count, or icon plus task name, if you would rather trade the width for it.

## The extension never parses Markdown

The vault owns a deterministic script (`tasks/_scripts/today.py --write`) that writes two things at once: `今日の候補.md` for a human to review in Obsidian, and `tasks/_scripts/.index.json` for this extension. A PostToolUse hook runs it whenever a task file changes, so the index is kept current without anything here writing to the vault.

The index is built so that **nothing is left for the reader to compute**:

| The vault side emits | So the extension never has to |
| --- | --- |
| `estimate_days: 3.0` next to `estimate: "3d"` | Parse a duration string |
| `notion_url` resolved from the sync state's page ids | Read the sync state file |
| `obsidian_uri` already URL-encoded, `wikilink` already assembled | Build paths |
| `blocks`, the reverse lookup of `depends_on` | Walk a dependency graph |
| Body split per `## heading` with `{done, total}` checkbox counts | Parse Markdown or frontmatter |
| Wikilinks rewritten as `obsidian://` Markdown links | Resolve vault links |

What the index deliberately does **not** carry is display strings — no emoji, no `07/24 overdue`. Mapping a reason code or a date onto an icon is this extension's job, so presentation concerns never leak back into the vault.

`schema_version` guards the contract between the two repositories: a mismatch is reported instead of being read as if it fit.

## Starting and closing a task hands the work to herdr

Selecting a task and pressing `⌘⇧↵` opens a tab in [herdr](https://herdr.dev), starts an agent in it with the vault as its working directory, and submits `/task-manage run <task>`. `⌘⇧X` does the same with `/task-manage close <task>`. The tab is labelled with the task name, so a herdr workspace ends up reading like a list of what is in flight.

The tab is always created in one workspace — **Herdr Workspace**, created against the vault if it is not there yet — because the working directory is always the vault, never a code repository. The index knows a task's project but not the repository it is worked in, and inventing that mapping here would put a second source of truth next to the vault's.

`⌘⇧M` opens a form first, so a line of context ("start from the migration script, stop at the dry run") rides along after the command. The same dispatch backs the four commands for the skill's other modes — morning planning, the daily routine, wrapping up a session, and reviewing the work items — and `Capture Task`, which sends `/task-manage add`.

The HTML view can start a task too: its detail panel links to the `Start Task` command through a `raycast://` deeplink (the `r` key), which looks the name up in the index and dispatches the same way.

This keeps the extension read-only. It does not set a status itself; it asks the vault's own task skill to, which routes the change through the single writer like every other mutation.

herdr's CLI is a thin front over its socket API, so this is four JSON round trips (`workspace list`, `tab create`, `agent start`, `agent prompt`) and no terminal scripting. Two consequences: herdr's server has to be running, and `herdr` has to be on **Path**, since Raycast does not inherit the login shell's.

## The HTML task view is opened through the browser, not through `open`

The vault also generates a single-file HTML view of the same index (`tasks/タスクビュー.html`), which keeps its whole state — tab, selection, filters — in the URL fragment. Selecting a task and pressing `⌘⇧V` opens it there, and two more actions open the same task in the gantt or the dependency tab.

Getting the fragment across takes a detour. macOS resolves a `file:` URL through LaunchServices, which folds it back to a path and **drops the fragment**: `open 'file:///…#{"tab":"gantt"}'` lands on the default tab, and so does AppleScript's bare `open location`. Naming the application keeps it intact, so the default handler for the file is looked up first and then told to `open location` itself.

## Regenerating the index

A PostToolUse hook in the vault regenerates the index whenever a task changes, so this is only needed after midnight — the candidates are computed against a base date — or when working from Raycast without opening Obsidian at all. `⌘R` runs the vault's two scripts (`today.py --write`, then `gen_html.py`) with the vault as the working directory and reloads.

This is not an exception to being read-only. Both scripts refuse to touch a task file; they only write the derived index, `今日の候補.md` and the HTML view.

## Read-only, on purpose

The vault routes every durable task mutation through a single writer, so this extension only opens, copies, and asks. Nothing here changes a status, a date or the ordering.

That has one consequence worth knowing: today's candidates are computed against a base date, so after midnight the ranking stays on yesterday's basis until the vault regenerates it. Both view commands show an "索引が古い" row when that happens, and the menu bar switches its title to match.

## Setup

Set **Vault Path** to the vault holding `tasks/` (default `~/dev/notes`). The index is read from `tasks/_scripts/.index.json` inside it. If it is not there yet, press `⌘R` to generate it, run `python3 tasks/_scripts/today.py --write` in the vault, or just edit any task and let the hook do it.

The rest only matters for the herdr actions: **Herdr Workspace** is the workspace tabs are created in, **Herdr Agent** is what gets started in them (it receives `/task-manage`, so it has to be able to run the vault's skills), and **Path** is where `herdr` lives — `/opt/homebrew/bin` on Apple silicon.
