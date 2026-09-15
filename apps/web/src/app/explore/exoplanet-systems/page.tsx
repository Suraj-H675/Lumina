import type { Metadata } from "next";
import Link from "next/link";

import {
  EXOPLANET_RAW_SNAPSHOT,
  EXOPLANET_SYSTEM_DEFINITION,
} from "../../../lib/visualizations/exoplanet-systems";
import { ExoplanetSystemExplorer } from "./exoplanet-system-explorer";

export const metadata: Metadata = {
  alternates: { canonical: "/explore/exoplanet-systems" },
  title: "Exoplanet System Layouts",
  description:
    "Compare pinned NASA Exoplanet Archive semi-major-axis layouts for Lumina's five reviewed host-star systems without implying current planet positions.",
};

export default function ExoplanetSystemsPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--muted)] underline underline-offset-4"
          href="/explore"
        >
          ← Explore catalogue
        </Link>
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          System explorer · Phase 5B
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Exoplanet System Layouts
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Compare confirmed planets around the five host stars already reviewed by Lumina. The
          layout uses cited orbit semi-major axes—not current positions, not generated orbits, and
          not an artist&apos;s impression.
        </p>
      </header>

      <ExoplanetSystemExplorer />

      <section
        aria-labelledby="exoplanet-model-heading"
        className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
      >
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="exoplanet-model-heading">
            Model and limitations
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            The Python astronomy domain validates the pinned archive snapshot and computes both
            display coordinates. The browser selects among those reviewed outputs; it does not
            estimate missing planets, orbit phases, or orbital elements.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <ModelList title="Assumptions" values={EXOPLANET_SYSTEM_DEFINITION.assumptions} />
          <ModelList title="Limitations" values={EXOPLANET_SYSTEM_DEFINITION.limitations} />
        </div>
      </section>

      <section aria-labelledby="exoplanet-provenance-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="exoplanet-provenance-heading">
            Snapshot provenance
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Lumina does not query NASA when you open this page. It uses this checksum-pinned,
            reviewed snapshot so the visual remains reproducible.
          </p>
        </div>
        <dl className="grid gap-4 md:grid-cols-2">
          <ProvenanceFact label="Provider" value={EXOPLANET_RAW_SNAPSHOT.provider} />
          <ProvenanceFact label="Archive table" value={EXOPLANET_RAW_SNAPSHOT.table} />
          <ProvenanceFact label="Retrieved" value={EXOPLANET_RAW_SNAPSHOT.retrieved_at} />
          <ProvenanceFact
            label="Raw snapshot bytes"
            value={EXOPLANET_RAW_SNAPSHOT.bytes.toString()}
          />
          <div className="border border-[var(--border)] bg-[var(--surface)] p-4 md:col-span-2">
            <dt className="text-sm text-[var(--muted)]">SHA-256</dt>
            <dd className="mt-1 break-all font-mono text-sm">{EXOPLANET_RAW_SNAPSHOT.sha256}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <a
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
            href={EXOPLANET_RAW_SNAPSHOT.documentation_url}
            rel="noreferrer"
          >
            NASA Exoplanet Archive TAP documentation ↗
          </a>
          <a
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
            href={EXOPLANET_RAW_SNAPSHOT.column_documentation_url}
            rel="noreferrer"
          >
            PS / PSCompPars column definitions ↗
          </a>
        </div>
        <details className="border border-[var(--border)] p-4">
          <summary className="cursor-pointer font-semibold">Exact pinned TAP query</summary>
          <p className="mt-3 overflow-x-auto whitespace-pre font-mono text-xs leading-5 text-[var(--muted)]">
            {EXOPLANET_RAW_SNAPSHOT.query}
          </p>
        </details>
      </section>

      <section
        aria-labelledby="exoplanet-next-heading"
        className="space-y-4 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="exoplanet-next-heading">
          Compare the reference system
        </h2>
        <p className="max-w-3xl leading-7 text-[var(--muted)]">
          The Solar System explorer uses a different reviewed source and a wider 0–30.05 AU range.
          Comparing the two makes the chosen display scale explicit instead of visually mixing the
          data sets.
        </p>
        <Link
          className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
          href="/explore/solar-system"
        >
          Open Solar System distance reference →
        </Link>
      </section>
    </div>
  );
}

function ModelList({ title, values }: Readonly<{ title: string; values: ReadonlyArray<string> }>) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--muted)]">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function ProvenanceFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-mono">{value}</dd>
    </div>
  );
}
