import { runManageMode } from "./lib/manage-mode";

/** `/task-manage plan`（朝の日次計画）を herdr のタブで起こす。 */
export default async function Command() {
  await runManageMode("plan");
}
