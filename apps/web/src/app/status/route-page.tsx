import { loadFoundationStatus } from "../../lib/server/foundation-status";
import type { StatusMessages } from "../../lib/i18n/messages/types";
import { StatusView } from "./status-view";

export default async function StatusPage({ messages }: Readonly<{ messages: StatusMessages }>) {
  const status = await loadFoundationStatus();
  return <StatusView messages={messages} status={status} />;
}
