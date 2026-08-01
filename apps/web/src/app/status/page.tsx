import { loadFoundationStatus } from "../../lib/server/foundation-status";
import { StatusView } from "./status-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatusPage() {
  const status = await loadFoundationStatus();
  return <StatusView status={status} />;
}
