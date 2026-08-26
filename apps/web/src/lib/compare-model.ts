import type { EntityDetailResponse } from "@lumina/api-client";

/**
 * The comparison model for /compare.
 *
 * Scientific rules encoded here:
 * - rows align ONLY on `quantity.code`, the stable canonical quantity token
 *   already exposed by the accepted public contract (`QuantityReference.code`,
 *   persisted as `quantity.code`). No label, unit, or substring matching.
 * - the canonical selection is shown because the accepted domain contract
 *   defines exactly one preferred measurement per quantity (the reviewed
 *   pipeline's `current_selection`); `measurement_count` stays visible so a
 *   single displayed number can never silently hide competing measurements.
 * - no derived deltas, scores, rankings, or winner semantics are produced.
 * - missing quantities remain visible as unavailable rows.
 */

export type CompareObjectState =
  | Readonly<{ detail: EntityDetailResponse; kind: "ok"; slug: string }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{
      kind: "unknown";
      /** The slug from the URL that resolved to nothing in the catalogue. */
      slug: string;
    }>;

export type CompareCellMeasurement = Readonly<{
  originalUnit: string;
  originalValue: string;
  sourceLabel: string;
  unitSymbol: string;
  value: string;
}>;

export type CompareCell =
  | Readonly<{ kind: "unmeasured" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{
      kind: "unknown";
      /** The URL slug that has no catalogue object behind it. */
      slug: string;
    }>
  | Readonly<{
      kind: "value";
      /**
       * The domain's own canonical selection. Competing measurements are never
       * hidden: `measurementCount` is rendered with the value when it exceeds one.
       */
      measurementCount: number;
      measurement: CompareCellMeasurement;
    }>;

export type CompareRow = Readonly<{
  cells: Array<CompareCell>;
  /** Stable canonical quantity token; the only alignment key. */
  quantityCode: string;
  /** Human-readable quantity name from the accepted contract. */
  quantityName: string;
}>;

export type CompareModel = Readonly<{
  objects: Array<CompareObjectState>;
  rows: Array<CompareRow>;
}>;

/** Deterministic presentation order for quantity codes accepted today. */
const PRESENTATION_ORDER: ReadonlyArray<string> = [
  "gaia_g_mean_magnitude",
  "gaia_bp_mean_magnitude",
  "gaia_rp_mean_magnitude",
];

function presentationRank(quantityCode: string): number {
  const index = PRESENTATION_ORDER.indexOf(quantityCode);
  return index === -1 ? PRESENTATION_ORDER.length : index;
}

/**
 * Build the side-by-side matrix.
 *
 * Row set: union of every loaded object's quantities, keyed by
 * `quantity.code`. Row names come from the first loaded occurrence of that
 * code (all occurrences share one persisted vocabulary name). Ordering:
 * presentation map first, then deterministic byte-wise `quantity.code` order.
 * Cells keep each object's actual units — different units are shown honestly,
 * never converted or compared numerically.
 */
export function buildCompareModel(objects: Array<CompareObjectState>): CompareModel {
  const loaded = objects.filter(
    (entry): entry is Extract<CompareObjectState, { kind: "ok" }> => entry.kind === "ok",
  );

  // Union of canonical quantity identities across loaded objects, in first-
  // seen order per object, then by presentation rank / code for stability.
  const codes = new Set<string>();
  const nameByCode = new Map<string, string>();
  for (const entry of loaded) {
    for (const quantityEntry of entry.detail.quantities) {
      const { code } = quantityEntry.quantity;
      if (!nameByCode.has(code)) {
        nameByCode.set(code, quantityEntry.quantity.name);
        codes.add(code);
      }
    }
  }
  const orderedCodes = [...codes].sort((left, right) => {
    const rankDifference = presentationRank(left) - presentationRank(right);
    return rankDifference !== 0 ? rankDifference : left.localeCompare(right);
  });

  const rows: Array<CompareRow> = orderedCodes.map((code) => ({
    cells: objects.map((state) => {
      if (state.kind !== "ok") {
        return state.kind === "unknown"
          ? { kind: "unknown", slug: state.slug }
          : { kind: "unavailable" };
      }
      const match = state.detail.quantities.find((entry) => entry.quantity.code === code);
      if (match === undefined) return { kind: "unavailable" };
      if (match.current_selection === null) return { kind: "unmeasured" };
      const measurement = match.current_selection.measurement;
      return {
        kind: "value",
        measurement: {
          originalUnit: measurement.original_unit,
          originalValue: measurement.original_value,
          sourceLabel: `${measurement.source.provider.name} · ${measurement.source.dataset.name} (${measurement.source.dataset.release_version})`,
          unitSymbol: measurement.unit.symbol,
          value: measurement.value,
        },
        measurementCount: match.measurement_count,
      };
    }),
    quantityCode: code,
    quantityName: nameByCode.get(code) ?? "",
  }));

  return { objects, rows };
}
