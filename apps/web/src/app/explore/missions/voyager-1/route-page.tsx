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
import styles from "../../system-exploration.module.css";
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
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link className={styles.backLink} href="/explore">
            {messages.backToExplore}
          </Link>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>
            {formatMessageTemplate(messages.title, { mission: VOYAGER_MISSION_NAME })}
          </h1>
          <p className={styles.intro}>
            {formatMessageTemplate(messages.intro, {
              historyProvider: VOYAGER_NASA_NAME,
              launchDate: formatMissionDate(launchDate, locale),
              mission: VOYAGER_MISSION_NAME,
              trajectoryProvider: VOYAGER_HORIZONS_NAME,
              vectorStartDate: formatMissionDate(vectorStartDate, locale),
            })}
          </p>
        </div>
        <dl className={styles.heroRail}>
          <div className={styles.heroFact}>
            <dt>{messages.provenance.providerLabel}</dt>
            <dd>{VOYAGER_RAW_SNAPSHOT.provider}</dd>
          </div>
          <div className={styles.heroFact}>
            <dt>{messages.provenance.lastSampleLabel}</dt>
            <dd>{VOYAGER_RAW_SNAPSHOT.last_sample_tdb}</dd>
          </div>
        </dl>
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
    <section aria-labelledby="voyager-timeline-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="voyager-timeline-heading">
          {messages.title}
        </h2>
        <p className={styles.sectionSummary}>
          {formatMessageTemplate(messages.description, {
            historyProvider: VOYAGER_NASA_NAME,
            trajectoryProvider: VOYAGER_HORIZONS_SHORT_NAME,
          })}
        </p>
      </div>
      <ol className={styles.sourceList}>
        {VOYAGER_MILESTONES.map((milestone) => {
          const source = voyagerSourceById(milestone.source_id);
          return (
            <li className={styles.sourceItem} key={`${milestone.date}-${milestone.title}`}>
              <div>
                <time className={styles.sourceOrg} dateTime={milestone.date}>
                  {milestone.date}
                </time>
                <h3 className={styles.modelTitle}>{milestone.title}</h3>
              </div>
              <div>
                <p className={styles.sourceScope}>{milestone.detail}</p>
                {source === null ? null : (
                  <a className={styles.sourceLink} href={source.url} rel="noreferrer">
                    {formatMessageTemplate(messages.source, { source: source.title })}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ModelDisclosure({ messages }: Readonly<{ messages: VoyagerMessages["model"] }>) {
  return (
    <section aria-labelledby="voyager-model-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="voyager-model-heading">
          {messages.title}
        </h2>
        <p className={styles.sectionSummary}>{messages.description}</p>
      </div>
      <div className={styles.modelGrid}>
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
    <section aria-labelledby="voyager-provenance-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="voyager-provenance-heading">
          {formatMessageTemplate(messages.title, {
            provider: VOYAGER_HORIZONS_SHORT_NAME,
          })}
        </h2>
        <p className={styles.sectionSummary}>
          {formatMessageTemplate(messages.description, {
            provider: VOYAGER_HORIZONS_SHORT_NAME,
          })}
        </p>
      </div>
      <div className={styles.sectionBody}>
        <dl className={styles.provenanceGrid}>
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
          <div className={`${styles.provenanceFact} ${styles.provenanceFactWide}`}>
            <dt className={styles.factLabel}>{messages.shaLabel}</dt>
            <dd className={styles.factValue}>{VOYAGER_RAW_SNAPSHOT.sha256}</dd>
          </div>
        </dl>
        <div className={styles.actions}>
          <a
            className={styles.actionLink}
            href={VOYAGER_RAW_SNAPSHOT.api_documentation_url}
            rel="noreferrer"
          >
            {formatMessageTemplate(messages.documentation, {
              provider: VOYAGER_HORIZONS_NAME,
            })}
          </a>
        </div>
      </div>
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
    <section aria-labelledby="voyager-table-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="voyager-table-heading">
          {messages.title}
        </h2>
        <p className={styles.sectionSummary}>
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
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{messages.yearHeader}</th>
              <th>
                {formatMessageTemplate(messages.epochHeader, {
                  timeScale: VOYAGER_TIME_SCALE,
                })}
              </th>
              <th>
                {formatMessageTemplate(messages.axisHeader, {
                  axis: VOYAGER_X_AXIS_LABEL,
                  unit: VOYAGER_DISTANCE_UNIT,
                })}
              </th>
              <th>
                {formatMessageTemplate(messages.axisHeader, {
                  axis: VOYAGER_Y_AXIS_LABEL,
                  unit: VOYAGER_DISTANCE_UNIT,
                })}
              </th>
              <th>
                {formatMessageTemplate(messages.axisHeader, {
                  axis: VOYAGER_Z_AXIS_LABEL,
                  unit: VOYAGER_DISTANCE_UNIT,
                })}
              </th>
              <th>
                {formatMessageTemplate(messages.distanceHeader, {
                  unit: VOYAGER_DISTANCE_UNIT,
                })}
              </th>
            </tr>
          </thead>
          <tbody>
            {VOYAGER_SAMPLES.map((sample) => (
              <tr key={sample.jd_tdb}>
                <th>
                  {formatLocaleNumber(voyagerSampleYear(sample), locale, { useGrouping: false })}
                </th>
                <td className={styles.dataValue}>{sample.epoch_tdb.replace("A.D. ", "")}</td>
                <td className={styles.dataValue}>
                  {formatLocaleFixedNumber(sample.x_au, 6, locale)}
                </td>
                <td className={styles.dataValue}>
                  {formatLocaleFixedNumber(sample.y_au, 6, locale)}
                </td>
                <td className={styles.dataValue}>
                  {formatLocaleFixedNumber(sample.z_au, 6, locale)}
                </td>
                <td className={styles.dataValue}>
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
    <section aria-labelledby="voyager-sources-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="voyager-sources-heading">
          {title}
        </h2>
      </div>
      <ul className={styles.sourceList}>
        {VOYAGER_SOURCES.map((source) => (
          <li className={styles.sourceItem} key={source.id}>
            <div>
              <a className={styles.sourceLink} href={source.url} rel="noreferrer">
                {source.title}
              </a>
              <p className={styles.sourceOrg}>{source.organization_or_authors}</p>
            </div>
            <p className={styles.sourceScope}>{source.claim_scope}</p>
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
    <div className={styles.modelPanel}>
      <h3 className={styles.modelTitle}>{title}</h3>
      <ul className={styles.modelList}>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.provenanceFact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
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
