import { openSlackAndSendKeys } from "./slack";

export default async function openUnreads() {
  await openSlackAndSendKeys(`"A" using {command down, shift down}`);
}
