import type { Metadata } from "next";
import Link from "next/link";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SystemScaleCompareMessages } from "../../../lib/i18n/messages/types";
import {
  SYSTEM_COMPARE_DEFINITION,
  SYSTEM_COMPARE_DISTANCE_UNIT,
  SYSTEM_COMPARE_ITEMS,
  systemCompareItemById,
} from "../../../lib/visualizations/system-scale-compare";
import { SystemScaleCompareExplorer } from "./system-scale-compare-explorer";

export function createSystemScaleCompareMetadata(messages: SystemScaleCompareMessages): Metadata {
  return {
    alternates: { canonical: "/explore/system-compare" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export default function SystemScaleComparePage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: SystemScaleCompareMessages }>) {
  const defaults = SYSTEM_COMPARE_DEFINITION.default_item_ids.map((id) =>
    systemCompareItemById(id)!,
  );

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

      <SystemScaleCompareExplorer locale={locale} messages={messages.explorer} />
      <DefaultComparison
        defaults={defaults}
        locale={locale}
        messages={messages.defaultComparison}
      />
      <ModelDisclosure messages={messages.model} />
      <ReferenceInventory locale={locale} messages={messages.inventory} />
    </div>
  );
}

function DefaultComparison({
  defaults,
  locale,
  messages,
}: Readonly<{
  defaults: NonNullable<ReturnType<typeof systemCompareItemById>>[];
  locale: PublishedLocale;
  messages: SystemScaleCompareMessages["defaultComparison"];
}>) {
  const [solar, exoplanet, voyager] = defaults;
  return (
    <section aria-labelledby="default-system-compare-heading" className="space-y-4">
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="default-system-compare-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, {
            exoplanet: exoplanet!.name,
            solar: solar!.name,
            voyager: voyager!.name,
          })}
        </p>
      </div>
      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full min-w-[52rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="p-3">{messages.headers.reference}</th>
              <th className="p-3">{messages.headers.scientificQuantity}</th>
              <th className="p-3">{messages.headers.value}</th>
              <th className="p-3">
                {formatMessageTemplate(messages.headers.earthMultiple, {
                  unit: SYSTEM_COMPARE_DISTANCE_UNIT,
                })}
              </th>
            </tr>
          </thead>
          <tbody>
            {defaults.map((item) => (
              <tr className="border-b border-[var(--border)] last:border-0" key={item.id}>
                <th className="p-3 font-semibold">{item.name}</th>
                <td className="p-3">{item.quantity_label}</td>
                <td className="p-3 font-mono">
                  {formatLocaleFixedNumber(item.value_au, 6, locale)} {SYSTEM_COMPARE_DISTANCE_UNIT}
                </td>
                <td className="p-3 font-mono">
                  {formatLocaleFixedNumber(item.earth_reference_ratio, 3, locale)}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelDisclosure({
  messages,
}: Readonly<{ messages: SystemScaleCompareMessages["model"] }>) {
  return (
    <section
      aria-labelledby="system-compare-model-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="system-compare-model-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <DisclosureList
          title={messages.assumptionsTitle}
          values={SYSTEM_COMPARE_DEFINITION.assumptions}
        />
        <DisclosureList
          title={messages.limitationsTitle}
          values={SYSTEM_COMPARE_DEFINITION.limitations}
        />
      </div>
    </section>
  );
}

function ReferenceInventory({
  locale,
  messages,
}: Readonly<{
  locale: PublishedLocale;
  messages: SystemScaleCompareMessages["inventory"];
}>) {
  const formattedCount = formatLocaleNumber(SYSTEM_COMPARE_ITEMS.length, locale);
  return (
    <section aria-labelledby="reference-inventory-heading" className="space-y-4">
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="reference-inventory-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, { count: formattedCount })}
        </p>
      </div>
      <details className="border border-[var(--border)] p-4">
        <summary className="cursor-pointer font-semibold">
          {formatMessageTemplate(messages.summary, {
            count: formattedCount,
            unit: SYSTEM_COMPARE_DISTANCE_UNIT,
          })}
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[58rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="p-3">{messages.headers.group}</th>
                <th className="p-3">{messages.headers.reference}</th>
                <th className="p-3">{messages.headers.quantity}</th>
                <th className="p-3">
                  {formatMessageTemplate(messages.headers.value, {
                    unit: SYSTEM_COMPARE_DISTANCE_UNIT,
                  })}
                </th>
                <th className="p-3">{messages.headers.source}</th>
              </tr>
            </thead>
            <tbody>
              {SYSTEM_COMPARE_ITEMS.map((item) => (
                <tr className="border-b border-[var(--border)] last:border-0" key={item.id}>
                  <td className="p-3">{item.group_label}</td>
                  <th className="p-3 font-semibold">{item.name}</th>
                  <td className="p-3">{item.quantity_label}</td>
                  <td className="p-3 font-mono">
                    {formatLocaleFixedNumber(item.value_au, 6, locale)}
                  </td>
                  <td className="p-3">
                    <a
                      className="text-[var(--link)] underline underline-offset-4"
                      href={item.source.url}
                      rel="noreferrer"
                    >
                      {item.source.label}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
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
