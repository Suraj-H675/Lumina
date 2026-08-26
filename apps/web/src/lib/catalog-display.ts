import type { EntityDetailResponse, EntityType } from "@lumina/api-client";

/**
 * Render an exact decimal measurement for humans without inventing precision:
 * integers stay whole, unit-scale values keep four fractional digits, and
 * sub-unit magnitudes keep six significant digits. Trailing zeros are removed.
 */
export function formatMeasurementValue(raw: string): string {
  const trimmed = raw.trim();
  if (/^-?\d+$/u.test(trimmed)) return trimmed;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return trimmed;
  const scaled = Math.abs(numeric) >= 1 ? numeric.toFixed(4) : numeric.toPrecision(6);
  const compact = scaled.includes(".") ? scaled.replace(/0+$/u, "").replace(/\.$/u, "") : scaled;
  return compact === "" || compact === "-" ? "0" : compact;
}

/** Humanize the closed public entity-type vocabulary. */
export function entityTypeLabel(entityType: EntityType): string {
  const words = entityType.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function objectTitle(detail: EntityDetailResponse): string {
  return detail.canonical_name;
}

export function objectMetaLine(detail: EntityDetailResponse): string {
  const count = detail.quantities.length;
  const base = entityTypeLabel(detail.entity_type);
  if (count === 0) return base;
  return `${base} · ${count} ${count === 1 ? "measured quantity" : "measured quantities"}`;
}

export type ObjectProvenanceRow = Readonly<{
  datasetName: string;
  providerName: string;
  quantityNames: Array<string>;
  recordId: string;
  releaseVersion: string;
}>;

/**
 * One readable provenance row per distinct source record behind the currently
 * selected measurements. Competing measurements remain visible through the
 * scientific-data section; nothing is hidden or silently merged here.
 */
export function objectProvenanceRows(detail: EntityDetailResponse): Array<ObjectProvenanceRow> {
  const rows = new Map<string, ObjectProvenanceRow>();
  for (const entry of detail.quantities) {
    const source = entry.current_selection?.measurement.source;
    if (source === undefined) continue;
    const existing = rows.get(source.source_record_id);
    if (existing === undefined) {
      rows.set(source.source_record_id, {
        datasetName: source.dataset.name,
        providerName: source.provider.name,
        quantityNames: [entry.quantity.name],
        recordId: source.source_record_id,
        releaseVersion: source.dataset.release_version,
      });
    } else if (!existing.quantityNames.includes(entry.quantity.name)) {
      existing.quantityNames.push(entry.quantity.name);
    }
  }
  return [...rows.values()];
}
