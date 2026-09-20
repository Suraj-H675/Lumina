import type { Metadata } from "next";
import Link from "next/link";

import {
  formatLocaleDateTime,
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../../../lib/i18n/format";
import type { PublishedLocale } from "../../../../lib/i18n/locales";
import type { VoyagerMessages } from "../../../../lib/i18n/messages/types";
import {
  VOYAGER_DEFINITION,
  VOYAGER_DISTANCE_UNIT,
  VOYAGER_HORIZONS_NAME,
  VOYAGER_HORIZONS_SHORT_NAME,
  VOYAGER_MILESTONES,
  VOYAGER_MISSION_NAME,
  VOYAGER_NASA_NAME,
  VOYAGER_RAW_SNAPSHOT,
  VOYAGER_REFERENCE_FRAME_LABEL,
  VOYAGER_SAMPLES,
  VOYAGER_SOURCES,
  VOYAGER_TIME_SCALE,
  VOYAGER_X_AXIS_LABEL,
  VOYAGER_Y_AXIS_LABEL,
  VOYAGER_Z_AXIS_LABEL,
  voyagerSampleYear,
  voyagerSourceById,
} from "../../../../lib/visualizations/voyager-1";
import { VoyagerTrajectoryExplorer } from "./voyager-trajectory-explorer";

export function createVoyagerMetadata(messages: VoyagerMessages): Metadata {
  return {
    alternates: { canonical: "/explore/missions/voyager-1" },
    title: formatMessageTemplate(messages.metadataTitle, { mission: VOYAGER_MISSION_NAME }),
    description: formatMessageTemplate(messages.metadataDescription, {
      mission: VOYAGER_MISSION_NAME,
      provider: VOYAGER_HORIZONS_NAME,
    }),
  };
}

export default function VoyagerOnePage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: VoyagerMessages }>) {
  const launchDate = VOYAGER_MILESTONES[0]?.date ?? "1977-09-05";
  const vectorStartDate = VOYAGER_RAW_SNAPSHOT.start_tdb.slice(0, 10);
  return (
    <div className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--muted)] underline underline-offset-4"
          href="/explore"
        >
          {messages.backToExplore}
        </Link>
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {formatMessageTemplate(messages.title, { mission: VOYAGER_MISSION_NAME })}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          {formatMessageTemplate(messages.intro, {
            historyProvider: VOYAGER_NASA_NAME,
            launchDate: formatMissionDate(launchDate, locale),
            mission: VOYAGER_MISSION_NAME,
            trajectoryProvider: VOYAGER_HORIZONS_NAME,
            vectorStartDate: formatMissionDate(vectorStartDate, locale),
          })}
        </p>
      </header>

      <MissionTimeline messages={messages.timeline} />
      <VoyagerTrajectoryExplorer
        centerBodyName={messages.centerBodyName}
        locale={locale}
        messages={messages.trajectory}
      />
      <ModelDisclosure messages={messages.model} />
      <SnapshotProvenance locale={locale} messages={messages.provenance} />
      <TrajectoryTable
        centerBodyName={messages.centerBodyName}
        locale={locale}
        messages={messages.table}
      />
      <Sources title={messages.sourcesTitle} />
    </div>
  );
}

function MissionTimeline({ messages }: Readonly<{ messages: VoyagerMessages["timeline"] }>) {
  return (
    <section aria-labelledby="voyager-timeline-heading" className="space-y-5">
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="voyager-timeline-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, {
            historyProvider: VOYAGER_NASA_NAME,
            trajectoryProvider: VOYAGER_HORIZONS_SHORT_NAME,
          })}
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
                  {formatMessageTemplate(messages.source, { source: source.title })}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ModelDisclosure({ messages }: Readonly<{ messages: VoyagerMessages["model"] }>) {
  return (
    <section
      aria-labelledby="voyager-model-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="voyager-model-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <DisclosureList title={messages.assumptionsTitle} values={VOYAGER_DEFINITION.assumptions} />
        <DisclosureList title={messages.limitationsTitle} values={VOYAGER_DEFINITION.limitations} />
      </div>
    </section>
  );
}

function SnapshotProvenance({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: VoyagerMessages["provenance"] }>) {
  return (
    <section aria-labelledby="voyager-provenance-heading" className="space-y-5">
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="voyager-provenance-heading">
          {formatMessageTemplate(messages.title, {
            provider: VOYAGER_HORIZONS_SHORT_NAME,
          })}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, {
            provider: VOYAGER_HORIZONS_SHORT_NAME,
          })}
        </p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={messages.providerLabel} value={VOYAGER_RAW_SNAPSHOT.provider} />
        <Fact
          label={messages.targetLabel}
          value={formatMessageTemplate(messages.targetValue, {
            mission: VOYAGER_MISSION_NAME,
            targetId: VOYAGER_RAW_SNAPSHOT.target_id,
          })}
        />
        <Fact label={messages.centerLabel} value={VOYAGER_RAW_SNAPSHOT.center} />
        <Fact label={messages.referenceFrameLabel} value={VOYAGER_RAW_SNAPSHOT.reference_frame} />
        <Fact
          label={messages.outputLabel}
          value={formatMessageTemplate(messages.outputValue, {
            outputType: VOYAGER_RAW_SNAPSHOT.output_type,
            outputUnits: VOYAGER_RAW_SNAPSHOT.output_units,
          })}
        />
        <Fact label={messages.samplingLabel} value={VOYAGER_RAW_SNAPSHOT.sample_step} />
        <Fact
          label={messages.firstEpochLabel}
          value={formatMessageTemplate(messages.timeScaleValue, {
            timeScale: VOYAGER_TIME_SCALE,
            value: VOYAGER_RAW_SNAPSHOT.start_tdb,
          })}
        />
        <Fact
          label={messages.lastSampleLabel}
          value={formatMessageTemplate(messages.timeScaleValue, {
            timeScale: VOYAGER_TIME_SCALE,
            value: VOYAGER_RAW_SNAPSHOT.last_sample_tdb,
          })}
        />
        <Fact
          label={messages.bytesLabel}
          value={formatLocaleNumber(VOYAGER_RAW_SNAPSHOT.bytes, locale, { useGrouping: false })}
        />
        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 sm:col-span-2 lg:col-span-3">
          <dt className="text-sm text-[var(--muted)]">{messages.shaLabel}</dt>
          <dd className="mt-1 break-all font-mono text-sm">{VOYAGER_RAW_SNAPSHOT.sha256}</dd>
        </div>
      </dl>
      <a
        className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
        href={VOYAGER_RAW_SNAPSHOT.api_documentation_url}
        rel="noreferrer"
      >
        {formatMessageTemplate(messages.documentation, {
          provider: VOYAGER_HORIZONS_NAME,
        })}
      </a>
    </section>
  );
}

function TrajectoryTable({
  centerBodyName,
  locale,
  messages,
}: Readonly<{
  centerBodyName: string;
  locale: PublishedLocale;
  messages: VoyagerMessages["table"];
}>) {
  return (
    <section aria-labelledby="voyager-table-heading" className="space-y-4">
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="voyager-table-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, {
            center: centerBodyName,
            frame: VOYAGER_REFERENCE_FRAME_LABEL,
            unit: VOYAGER_DISTANCE_UNIT,
            xAxis: VOYAGER_X_AXIS_LABEL,
            yAxis: VOYAGER_Y_AXIS_LABEL,
            zAxis: VOYAGER_Z_AXIS_LABEL,
          })}
        </p>
      </div>
      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full min-w-[62rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="p-3">{messages.yearHeader}</th>
              <th className="p-3">
                {formatMessageTemplate(messages.epochHeader, {
                  timeScale: VOYAGER_TIME_SCALE,
                })}
              </th>
              <th className="p-3">
                {formatMessageTemplate(messages.axisHeader, {
                  axis: VOYAGER_X_AXIS_LABEL,
                  unit: VOYAGER_DISTANCE_UNIT,
                })}
              </th>
              <th className="p-3">
                {formatMessageTemplate(messages.axisHeader, {
                  axis: VOYAGER_Y_AXIS_LABEL,
                  unit: VOYAGER_DISTANCE_UNIT,
                })}
              </th>
              <th className="p-3">
                {formatMessageTemplate(messages.axisHeader, {
                  axis: VOYAGER_Z_AXIS_LABEL,
                  unit: VOYAGER_DISTANCE_UNIT,
                })}
              </th>
              <th className="p-3">
                {formatMessageTemplate(messages.distanceHeader, {
                  unit: VOYAGER_DISTANCE_UNIT,
                })}
              </th>
            </tr>
          </thead>
          <tbody>
            {VOYAGER_SAMPLES.map((sample) => (
              <tr className="border-b border-[var(--border)] last:border-0" key={sample.jd_tdb}>
                <th className="p-3 font-semibold">
                  {formatLocaleNumber(voyagerSampleYear(sample), locale, { useGrouping: false })}
                </th>
                <td className="p-3 font-mono text-sm">{sample.epoch_tdb.replace("A.D. ", "")}</td>
                <td className="p-3 font-mono text-sm">
                  {formatLocaleFixedNumber(sample.x_au, 6, locale)}
                </td>
                <td className="p-3 font-mono text-sm">
                  {formatLocaleFixedNumber(sample.y_au, 6, locale)}
                </td>
                <td className="p-3 font-mono text-sm">
                  {formatLocaleFixedNumber(sample.z_au, 6, locale)}
                </td>
                <td className="p-3 font-mono text-sm">
                  {formatLocaleFixedNumber(sample.radius_au, 6, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Sources({ title }: Readonly<{ title: string }>) {
  return (
    <section aria-labelledby="voyager-sources-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="voyager-sources-heading">
        {title}
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

function formatMissionDate(value: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(new Date(value + "T00:00:00Z"), locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });
}
