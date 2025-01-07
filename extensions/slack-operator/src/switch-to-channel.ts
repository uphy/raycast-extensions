import { openSlackAndSendKeys } from "./slack";

export default async function switchToChannel() {
  await openSlackAndSendKeys(`"k" using {command down}`);
}
