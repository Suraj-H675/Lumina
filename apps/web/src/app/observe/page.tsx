import type { Metadata } from "next";

import { ObservationPlanner } from "../../components/observation-planner";
import { isValidNightDate } from "../../lib/observation/domain";
import { resolveWebApiOrigin } from "../../lib/server/api-origin";
import { loadObjectBySlugPerRequest } from "../../lib/server/catalog";

export const metadata: Metadata = {
  title: "Observation planner",
  description:
    "Plan when and where to observe a Lumina catalogue object using deterministic astronomical calculations.",
};

type ObservePageProps = Readonly<{
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ObservePage({ searchParams }: ObservePageProps) {
  const params = await searchParams;
  const rawSlug = firstValue(params.object)?.trim().toLowerCase() ?? "";
  const slug = rawSlug.length > 0 ? rawSlug : null;
  const rawDate = firstValue(params.date);
  const initialDate = rawDate !== undefined && isValidNightDate(rawDate) ? rawDate : undefined;
  const outcome = slug === null ? null : await loadObjectBySlugPerRequest(slug);
  const configured = resolveWebApiOrigin();
  const apiOrigin = configured.valid ? configured.origin : undefined;

  return (
    <ObservationPlanner
      {...(apiOrigin === undefined ? {} : { apiOrigin })}
      detail={outcome?.kind === "ok" ? outcome.detail : null}
      {...(initialDate === undefined ? {} : { initialDate })}
      slug={slug}
      targetUnavailable={outcome !== null && outcome.kind !== "ok"}
    />
  );
}
