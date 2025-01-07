import { openSlackAndSendKeys } from "./slack";

export default async function openThreads() {
  await openSlackAndSendKeys(`"T" using {command down, shift down}`);
}
