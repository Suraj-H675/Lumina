import type { Metadata } from "next";
import Link from "next/link";

import { formatLocaleNumber, formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { ExoplanetSystemsMessages } from "../../../lib/i18n/messages/types";
import {
  EXOPLANET_ARCHIVE_COLUMN_SET_NAME,
  EXOPLANET_ARCHIVE_TAP_NAME,
  EXOPLANET_DISTANCE_UNIT,
  EXOPLANET_RAW_SNAPSHOT,
  EXOPLANET_SYSTEM_DEFINITION,
} from "../../../lib/visualizations/exoplanet-systems";
import { ExoplanetSystemExplorer } from "./exoplanet-system-explorer";

export function createExoplanetSystemsMetadata(messages: ExoplanetSystemsMessages): Metadata {
  return {
    alternates: { canonical: "/explore/exoplanet-systems" },
    title: messages.metadataTitle,
    description: formatMessageTemplate(messages.metadataDescription, {
      provider: EXOPLANET_RAW_SNAPSHOT.provider,
    }),
  };
}

export default function ExoplanetSystemsPage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: ExoplanetSystemsMessages }>) {
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
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{messages.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.intro}</p>
      </header>

      <ExoplanetSystemExplorer locale={locale} messages={messages.explorer} />

      <section
        aria-labelledby="exoplanet-model-heading"
        className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
      >
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="exoplanet-model-heading">
            {messages.model.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.model.description}</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <ModelList
            title={messages.model.assumptionsTitle}
            values={EXOPLANET_SYSTEM_DEFINITION.assumptions}
          />
          <ModelList
            title={messages.model.limitationsTitle}
            values={EXOPLANET_SYSTEM_DEFINITION.limitations}
          />
        </div>
      </section>

      <section aria-labelledby="exoplanet-provenance-heading" className="space-y-5">
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="exoplanet-provenance-heading">
            {messages.provenance.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.provenance.description, {
              provider: EXOPLANET_RAW_SNAPSHOT.provider,
            })}
          </p>
        </div>
        <dl className="grid gap-4 md:grid-cols-2">
          <ProvenanceFact
            label={messages.provenance.providerLabel}
            value={EXOPLANET_RAW_SNAPSHOT.provider}
          />
          <ProvenanceFact
            label={messages.provenance.archiveTableLabel}
            value={EXOPLANET_RAW_SNAPSHOT.table}
          />
          <ProvenanceFact
            label={messages.provenance.retrievedLabel}
            value={EXOPLANET_RAW_SNAPSHOT.retrieved_at}
          />
          <ProvenanceFact
            label={messages.provenance.bytesLabel}
            value={formatLocaleNumber(EXOPLANET_RAW_SNAPSHOT.bytes, locale, { useGrouping: false })}
          />
          <div className="border border-[var(--border)] bg-[var(--surface)] p-4 md:col-span-2">
            <dt className="text-sm text-[var(--muted)]">{messages.provenance.shaLabel}</dt>
            <dd className="mt-1 break-all font-mono text-sm">{EXOPLANET_RAW_SNAPSHOT.sha256}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <a
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
            href={EXOPLANET_RAW_SNAPSHOT.documentation_url}
            rel="noreferrer"
          >
            {formatMessageTemplate(messages.provenance.tapDocumentation, {
              provider: EXOPLANET_RAW_SNAPSHOT.provider,
              tap: EXOPLANET_ARCHIVE_TAP_NAME,
            })}
          </a>
          <a
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
            href={EXOPLANET_RAW_SNAPSHOT.column_documentation_url}
            rel="noreferrer"
          >
            {formatMessageTemplate(messages.provenance.columnDocumentation, {
              columnSet: EXOPLANET_ARCHIVE_COLUMN_SET_NAME,
            })}
          </a>
        </div>
        <details className="border border-[var(--border)] p-4">
          <summary className="cursor-pointer font-semibold">
            {formatMessageTemplate(messages.provenance.querySummary, {
              tap: EXOPLANET_ARCHIVE_TAP_NAME,
            })}
          </summary>
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
          {messages.continue.title}
        </h2>
        <p className="max-w-3xl leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.continue.description, {
            unit: EXOPLANET_DISTANCE_UNIT,
          })}
        </p>
        <Link
          className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
          href="/explore/solar-system"
        >
          {messages.continue.action}
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
