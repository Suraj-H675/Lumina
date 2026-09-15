import type { Metadata } from "next";
import Link from "next/link";

import {
  SYSTEM_COMPARE_DEFINITION,
  SYSTEM_COMPARE_ITEMS,
  systemCompareItemById,
} from "../../../lib/visualizations/system-scale-compare";
import { SystemScaleCompareExplorer } from "./system-scale-compare-explorer";

export const metadata: Metadata = {
  alternates: { canonical: "/explore/system-compare" },
  title: "System Scale Compare",
  description:
    "Compare reviewed Solar System mean distances, exoplanet semi-major axes, and Voyager heliocentric vector magnitudes on a labelled shared AU scale.",
};

export default function SystemScaleComparePage() {
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
          ← Explore catalogue
        </Link>
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Advanced compare · Phase 5B
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">System Scale Compare</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Put three reviewed AU-valued references on one scale without erasing what each number
          means. Shared units support arithmetic comparison; they do not turn different scientific
          quantities into the same measurement.
        </p>
      </header>

      <SystemScaleCompareExplorer />
      <DefaultComparison defaults={defaults} />
      <ModelDisclosure />
      <ReferenceInventory />
    </div>
  );
}

function DefaultComparison({
  defaults,
}: Readonly<{ defaults: NonNullable<ReturnType<typeof systemCompareItemById>>[] }>) {
  return (
    <section aria-labelledby="default-system-compare-heading" className="space-y-4">
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="default-system-compare-heading">
          Default comparison data
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          This table is the no-JavaScript numeric baseline: Earth&apos;s mean Sun distance,
          Kepler-452 b&apos;s semi-major axis, and Voyager 1&apos;s 2026 heliocentric vector
          magnitude.
        </p>
      </div>
      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full min-w-[52rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="p-3">Reference</th>
              <th className="p-3">Scientific quantity</th>
              <th className="p-3">Value</th>
              <th className="p-3">1 AU arithmetic multiple</th>
            </tr>
          </thead>
          <tbody>
            {defaults.map((item) => (
              <tr className="border-b border-[var(--border)] last:border-0" key={item.id}>
                <th className="p-3 font-semibold">{item.name}</th>
                <td className="p-3">{item.quantity_label}</td>
                <td className="p-3 font-mono">{item.value_au.toFixed(6)} AU</td>
                <td className="p-3 font-mono">{item.earth_reference_ratio.toFixed(3)}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelDisclosure() {
  return (
    <section
      aria-labelledby="system-compare-model-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="system-compare-model-heading">
          Composition model and limits
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Python composes only positive AU-valued outputs from the three already-reviewed Phase 5B
          artifacts. React selects among those precomputed outputs; it does not reinterpret source
          science or derive cross-model similarity.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <DisclosureList title="Assumptions" values={SYSTEM_COMPARE_DEFINITION.assumptions} />
        <DisclosureList title="Limitations" values={SYSTEM_COMPARE_DEFINITION.limitations} />
      </div>
    </section>
  );
}

function ReferenceInventory() {
  return (
    <section aria-labelledby="reference-inventory-heading" className="space-y-4">
      <div className="max-w-4xl space-y-2">
        <h2 className="text-2xl font-semibold" id="reference-inventory-heading">
          Complete reviewed reference inventory
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          All 68 selectable references are listed here so the interactive controls never become the
          only way to inspect the underlying values.
        </p>
      </div>
      <details className="border border-[var(--border)] p-4">
        <summary className="cursor-pointer font-semibold">Show all 68 AU references</summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[58rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="p-3">Group</th>
                <th className="p-3">Reference</th>
                <th className="p-3">Quantity</th>
                <th className="p-3">AU value</th>
                <th className="p-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {SYSTEM_COMPARE_ITEMS.map((item) => (
                <tr className="border-b border-[var(--border)] last:border-0" key={item.id}>
                  <td className="p-3">{item.group_label}</td>
                  <th className="p-3 font-semibold">{item.name}</th>
                  <td className="p-3">{item.quantity_label}</td>
                  <td className="p-3 font-mono">{item.value_au.toFixed(6)}</td>
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
