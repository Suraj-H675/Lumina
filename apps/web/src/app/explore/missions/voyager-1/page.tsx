import type { Metadata } from "next";
import Link from "next/link";

import {
  VOYAGER_DEFINITION,
  VOYAGER_MILESTONES,
  VOYAGER_RAW_SNAPSHOT,
  VOYAGER_SAMPLES,
  VOYAGER_SOURCES,
  voyagerSampleYear,
  voyagerSourceById,
} from "../../../../lib/visualizations/voyager-1";
import { VoyagerTrajectoryExplorer } from "./voyager-trajectory-explorer";

export const metadata: Metadata = {
  alternates: { canonical: "/explore/missions/voyager-1" },
  title: "Voyager 1 Mission Timeline and Trajectory",
  description:
    "Explore a source-labelled Voyager 1 mission timeline and a pinned JPL Horizons heliocentric trajectory without implying interpolated or live spacecraft positions.",
};

export default function VoyagerOnePage() {
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
          Mission timeline · Phase 5B
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Voyager 1 Mission Timeline and Trajectory
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Follow documented mission milestones and a checksum-pinned JPL Horizons trajectory.
          Mission history and trajectory samples remain separate source contracts: NASA records the
          launch on September 5, 1977, while the pinned Horizons vector series begins September 6.
        </p>
      </header>

      <MissionTimeline />
      <VoyagerTrajectoryExplorer />
      <ModelDisclosure />
      <SnapshotProvenance />
      <TrajectoryTable />
      <Sources />
    </div>
  );
}

function MissionTimeline() {
  return (
    <section aria-labelledby="voyager-timeline-heading" className="space-y-5">
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="voyager-timeline-heading">
          Mission milestones
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          These dates come from NASA mission history. They are not inferred from the annual Horizons
          vector samples.
        </p>
      </div>
      <ol className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
        {VOYAGER_MILESTONES.map((milestone) => {
          const source = voyagerSourceById(milestone.source_id);
          return (
            <li
              className="border border-[var(--border)] p-5"
              key={`${milestone.date}-${milestone.title}`}
            >
              <time className="font-mono text-sm text-[var(--muted)]" dateTime={milestone.date}>
                {milestone.date}
              </time>
              <h3 className="mt-2 text-lg font-semibold">{milestone.title}</h3>
              <p className="mt-2 leading-7 text-[var(--muted)]">{milestone.detail}</p>
              {source === null ? null : (
                <a
                  className="mt-3 inline-block text-sm font-semibold text-[var(--link)] underline underline-offset-4"
                  href={source.url}
                  rel="noreferrer"
                >
                  Source: {source.title} ↗
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ModelDisclosure() {
  return (
    <section
      aria-labelledby="voyager-model-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="voyager-model-heading">
          Model and limitations
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Lumina does not propagate a spacecraft orbit in the browser. It renders a reviewed static
          artifact whose annual XYZ vectors were parsed and validated by the Python astronomy
          domain.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <DisclosureList title="Assumptions" values={VOYAGER_DEFINITION.assumptions} />
        <DisclosureList title="Limitations" values={VOYAGER_DEFINITION.limitations} />
      </div>
    </section>
  );
}

function SnapshotProvenance() {
  return (
    <section aria-labelledby="voyager-provenance-heading" className="space-y-5">
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="voyager-provenance-heading">
          Horizons snapshot provenance
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          This route makes no live Horizons request. The pinned text response is validated by
          SHA-256 before the reviewed JSON artifact can be regenerated.
        </p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Provider" value={VOYAGER_RAW_SNAPSHOT.provider} />
        <Fact label="Target" value={`Voyager 1 (${VOYAGER_RAW_SNAPSHOT.target_id})`} />
        <Fact label="Center" value={VOYAGER_RAW_SNAPSHOT.center} />
        <Fact label="Reference frame" value={VOYAGER_RAW_SNAPSHOT.reference_frame} />
        <Fact
          label="Output"
          value={`${VOYAGER_RAW_SNAPSHOT.output_type} · ${VOYAGER_RAW_SNAPSHOT.output_units}`}
        />
        <Fact label="Sampling" value={VOYAGER_RAW_SNAPSHOT.sample_step} />
        <Fact label="First vector epoch" value={`${VOYAGER_RAW_SNAPSHOT.start_tdb} TDB`} />
        <Fact label="Last pinned sample" value={`${VOYAGER_RAW_SNAPSHOT.last_sample_tdb} TDB`} />
        <Fact label="Raw response bytes" value={VOYAGER_RAW_SNAPSHOT.bytes.toString()} />
        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 sm:col-span-2 lg:col-span-3">
          <dt className="text-sm text-[var(--muted)]">SHA-256</dt>
          <dd className="mt-1 break-all font-mono text-sm">{VOYAGER_RAW_SNAPSHOT.sha256}</dd>
        </div>
      </dl>
      <a
        className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
        href={VOYAGER_RAW_SNAPSHOT.api_documentation_url}
        rel="noreferrer"
      >
        JPL Horizons API documentation ↗
      </a>
    </section>
  );
}

function TrajectoryTable() {
  return (
    <section aria-labelledby="voyager-table-heading" className="space-y-4">
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="voyager-table-heading">
          Complete annual vector table
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          The table is the accessible numeric alternative to both charts. X, Y, and Z are
          Sun-centered J2000-ecliptic coordinates in AU; distance is derived from all three axes.
        </p>
      </div>
      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full min-w-[62rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="p-3">Year</th>
              <th className="p-3">Epoch (TDB)</th>
              <th className="p-3">X (AU)</th>
              <th className="p-3">Y (AU)</th>
              <th className="p-3">Z (AU)</th>
              <th className="p-3">Heliocentric distance (AU)</th>
            </tr>
          </thead>
          <tbody>
            {VOYAGER_SAMPLES.map((sample) => (
              <tr className="border-b border-[var(--border)] last:border-0" key={sample.jd_tdb}>
                <th className="p-3 font-semibold">{voyagerSampleYear(sample)}</th>
                <td className="p-3 font-mono text-sm">{sample.epoch_tdb.replace("A.D. ", "")}</td>
                <td className="p-3 font-mono text-sm">{sample.x_au.toFixed(6)}</td>
                <td className="p-3 font-mono text-sm">{sample.y_au.toFixed(6)}</td>
                <td className="p-3 font-mono text-sm">{sample.z_au.toFixed(6)}</td>
                <td className="p-3 font-mono text-sm">{sample.radius_au.toFixed(6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Sources() {
  return (
    <section aria-labelledby="voyager-sources-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="voyager-sources-heading">
        Sources
      </h2>
      <ul className="grid list-none gap-4 p-0 lg:grid-cols-2">
        {VOYAGER_SOURCES.map((source) => (
          <li className="border border-[var(--border)] p-5" key={source.id}>
            <a
              className="font-semibold text-[var(--link)] underline underline-offset-4"
              href={source.url}
              rel="noreferrer"
            >
              {source.title}
            </a>
            <p className="mt-2 text-sm text-[var(--muted)]">{source.organization_or_authors}</p>
            <p className="mt-3 text-sm leading-6">{source.claim_scope}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DisclosureList({
  title,
  values,
}: Readonly<{ title: string; values: ReadonlyArray<string> }>) {
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

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm">{value}</dd>
    </div>
  );
}
