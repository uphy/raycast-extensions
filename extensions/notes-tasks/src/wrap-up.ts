import { runManageMode } from "./lib/manage-mode";

/** `/task-manage wrap`（セッション終了時の後片付け）を herdr のタブで起こす。 */
export default async function Command() {
  await runManageMode("wrap");
}
