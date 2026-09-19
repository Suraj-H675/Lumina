import type { Metadata } from "next";
import Link from "next/link";

import {
  loadReviewedDiscoveries,
  type DiscoveryConfirmationState,
} from "../../lib/discoveries/content";

export const metadata: Metadata = {
  title: "Reviewed discoveries",
  description:
    "A small version-controlled set of recent space-science and mission updates reviewed against primary or peer-reviewed sources.",
};

export default function DiscoveriesPage() {
  const bundle = loadReviewedDiscoveries();
  return (
    <article className="max-w-5xl space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          Mission Control · Reviewed discoveries
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Reviewed discoveries</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          These are authored, version-controlled summaries checked against the sources linked on
          each card. Lumina does not generate or continuously scrape science-news prose.
        </p>
        <p className="text-sm leading-6 text-[var(--muted)]">
          Bundle reviewed <time dateTime={bundle.reviewed_at}>{bundle.reviewed_at}</time>.
        </p>
      </header>

      <section aria-labelledby="reviewed-discoveries-heading" className="space-y-5">
        <h2 className="text-2xl font-semibold" id="reviewed-discoveries-heading">
          Current reviewed set
        </h2>{" "}
        <div className="grid gap-5 lg:grid-cols-2">
          {bundle.entries.map((entry) => (
            <article
              className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5"
              key={entry.id}
            >
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--accent)]">
                  {entry.content_type} · published {entry.publication_date}
                </p>
                <h3 className="text-xl font-semibold leading-7">{entry.title}</h3>
              </div>
              <p className="leading-7 text-[var(--muted)]">{entry.summary}</p>
              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                <h4 className="font-semibold">Why it matters</h4>
                <p className="leading-7 text-[var(--muted)]">{entry.why_it_matters}</p>
              </div>
              <dl className="grid gap-3 text-sm">
                <Fact
                  label="Independent-confirmation state"
                  value={confirmationLabel(entry.independent_confirmation_state)}
                />
                <Fact label="Event date" value={entry.event_date ?? "No separate event date"} />
              </dl>
              <div className="space-y-2">
                <h4 className="font-semibold">Reviewed sources</h4>
                <ul className="space-y-2">
                  {entry.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
                        href={source.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {source.organization}: {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>
      <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/">
        Back to Mission Control
      </Link>
    </article>
  );
}

function confirmationLabel(value: DiscoveryConfirmationState): string {
  if (value === "peer-reviewed-publication")
    return "Underlying result published in peer-reviewed literature";
  if (value === "independently-confirmed") return "Independently confirmed";
  return "Official primary source only; no independent confirmation claimed here";
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">{value}</dd>
    </div>
  );
}
