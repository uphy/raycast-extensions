# Notes Tasks

Browse the work items of an Obsidian vault task system — one file per task, an outline that carries the ordering, and a deterministic script that derives today's candidates from both.

| Command | Description |
| --- | --- |
| Today's Tasks | Today's candidates in the order the vault derived, plus what starts soon and what is excluded |
| Search Work Items | Every work item, filtered by project, backlog or blocking, with what each one unblocks |
| Top Task | The first candidate in the menu bar, as a single coloured dot |

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

## Read-only, on purpose

The vault routes every durable task mutation through a single writer, so this extension only opens and copies. Nothing here changes a status, a date or the ordering.

That has one consequence worth knowing: today's candidates are computed against a base date, so after midnight the ranking stays on yesterday's basis until the vault regenerates it. Both view commands show an "索引が古い" row when that happens, and the menu bar switches its title to match.

## Setup

Set **Vault Path** to the vault holding `tasks/` (default `~/dev/notes`). The index is read from `tasks/_scripts/.index.json` inside it. If it is not there yet, run `python3 tasks/_scripts/today.py --write` in the vault once — or just edit any task and let the hook do it.
