import type { Metadata } from "next";
import Link from "next/link";

import { formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SolarSystemDistanceMessages } from "../../../lib/i18n/messages/types";
import {
  SOLAR_SYSTEM_DEFINITION,
  SOLAR_SYSTEM_PROVIDER_NAME,
  SOLAR_SYSTEM_SOURCES,
} from "../../../lib/visualizations/solar-system-distance";
import { SolarSystemDistanceExplorer } from "./solar-system-distance-explorer";

export function createSolarSystemDistanceMetadata(messages: SolarSystemDistanceMessages): Metadata {
  return {
    alternates: { canonical: "/explore/solar-system" },
    title: messages.metadataTitle,
    description: messages.metadataDescription,
  };
}

export default function SolarSystemPage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: SolarSystemDistanceMessages }>) {
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
        <p className="text-lg leading-8 text-[var(--muted)]">
          {formatMessageTemplate(messages.intro, { provider: SOLAR_SYSTEM_PROVIDER_NAME })}
        </p>
      </header>

      <SolarSystemDistanceExplorer locale={locale} messages={messages.explorer} />

      <section
        aria-labelledby="model-heading"
        className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
      >
        <div className="max-w-4xl space-y-2">
          <h2 className="text-2xl font-semibold" id="model-heading">
            {messages.model.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.model.description}</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <ModelList
            title={messages.model.assumptionsTitle}
            values={SOLAR_SYSTEM_DEFINITION.assumptions}
          />
          <ModelList
            title={messages.model.limitationsTitle}
            values={SOLAR_SYSTEM_DEFINITION.limitations}
          />
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
            <dt className="text-sm font-semibold">{messages.model.logMappingLabel}</dt>
            <dd className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {SOLAR_SYSTEM_DEFINITION.calculation.log_distance}
            </dd>
          </div>
          <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
            <dt className="text-sm font-semibold">{messages.model.linearMappingLabel}</dt>
            <dd className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {SOLAR_SYSTEM_DEFINITION.calculation.linear_distance}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="sources-heading" className="space-y-5">
        <div className="max-w-3xl space-y-2">
          <h2 className="text-2xl font-semibold" id="sources-heading">
            {messages.sources.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.sources.description}</p>
        </div>
        <ul className="grid list-none gap-4 p-0 lg:grid-cols-2">
          {SOLAR_SYSTEM_SOURCES.map((source) => (
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
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{source.citation}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="next-comparison-heading"
        className="space-y-4 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="next-comparison-heading">
          {messages.continue.title}
        </h2>
        <p className="max-w-3xl leading-7 text-[var(--muted)]">{messages.continue.description}</p>
        <Link
          className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
          href="/lab/scale-explorer"
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
