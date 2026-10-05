# Notes Tasks Changelog

## [Task view deeplinks, dependency walking and herdr modes] - {PR_MERGE_DATE}

- Open the vault's HTML task view on the selected task, in the today, gantt or dependency tab. The URL fragment carries the view state, and macOS `open` drops it, so the default browser is asked directly instead.
- Regenerate the index (and the HTML view) from Raycast. It runs the vault's two deterministic scripts, which only write derived files.
- Walk a dependency upstream (`depends_on`) or downstream (`blocks`) from the action panel, recursively. Rows excluded from today's candidates for a dependency offer the same jump.
- Search work item bodies, not just titles and projects. Section headings now carry their `done/total` count, and `## 進行` is pulled to the front of a task that is in progress.
- Add a note to a task before handing it to herdr (`⌘⇧M`).
- New `Start Task` command, so the HTML view can start or close a task through a deeplink.
- New `Capture Task` command for a new work item, prefilled from the clipboard.
- New commands for the task skill's other modes: morning planning, daily routine, wrap up, and reviewing the work items.

## [Initial Version] - {PR_MERGE_DATE}
