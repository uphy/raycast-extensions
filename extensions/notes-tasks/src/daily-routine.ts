import { runManageMode } from "./lib/manage-mode";

/** `/task-manage routine`（日次まとめて実行）を herdr のタブで起こす。 */
export default async function Command() {
  await runManageMode("routine");
}
