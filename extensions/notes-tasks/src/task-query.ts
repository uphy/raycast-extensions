import { runManageMode } from "./lib/manage-mode";

/** `/task-manage list`（棚卸し）を herdr のタブで起こす。SKILL.md の subcommand は `query` ではなく `list`。 */
export default async function Command() {
  await runManageMode("list");
}
