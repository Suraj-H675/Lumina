import type { Metadata } from "next";

import { ParticipateEnhanced } from "../../components/participate-enhanced";
import { ParticipateNoScript } from "../../components/participate-no-script";
import { loadParticipate } from "../../lib/server/participate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  alternates: { canonical: "/participate" },
  title: "Participate",
  description:
    "Reviewed astronomy citizen-science projects, evergreen observing challenges, and safe hands-on activities with explicit source and external-handoff boundaries.",
};

export default async function ParticipatePage() {
  const outcome = await loadParticipate();
  if (outcome.kind !== "ok") {
    return (
      <article className="max-w-4xl space-y-6">
        <header className="space-y-4">
          <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
            Participate
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Participate</h1>
        </header>
        <section
          aria-labelledby="participate-unavailable-heading"
          className="space-y-3"
          role="alert"
        >
          <h2 className="text-2xl font-semibold" id="participate-unavailable-heading">
            Participate is temporarily unavailable
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Lumina could not load the reviewed Participate contract from its own API. No project
            status, challenge, activity, or external destination is being reconstructed in the
            browser.
          </p>
        </section>
      </article>
    );
  }

  return (
    <>
      <ParticipateNoScript response={outcome.data} />
      <ParticipateEnhanced response={outcome.data} />
    </>
  );
}
