import type { StellarLaboratoryCalculationResponse } from "@lumina/api-client";

import {
  STELLAR_LABORATORY_DEFINITION,
  STELLAR_LABORATORY_SOURCES,
  type StellarLaboratoryState,
} from "../lib/simulations/stellar-laboratory";

type StellarLaboratoryNoScriptProps = Readonly<{
  initialState: StellarLaboratoryState;
  initialStateInvalid: boolean;
  initialCalculation: StellarLaboratoryCalculationResponse | null;
}>;

function numeric(value: number, unit = ""): string {
  const formatted =
    Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)
      ? value.toExponential(5)
      : value.toLocaleString("en", { maximumSignificantDigits: 7 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function SourceList() {
  return (
    <ul>
      {STELLAR_LABORATORY_DEFINITION.references.map((sourceId) => {
        const source = STELLAR_LABORATORY_SOURCES.find((candidate) => candidate.id === sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <>Unavailable source record: {sourceId}</>
            ) : (
              <a href={source.url} rel="noreferrer">
                {source.title} — {source.organization_or_authors}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ResultTable({ result }: Readonly<{ result: StellarLaboratoryCalculationResponse }>) {
  const rows = [
    ["Initial mass", numeric(result.inputs.initial_mass_msun, "M☉")],
    ["Typical main-sequence luminosity", numeric(result.luminosity_lsun, "L☉")],
    ["Typical main-sequence radius", numeric(result.radius_rsun, "R☉")],
    ["Typical effective temperature", numeric(result.effective_temperature_k, "K")],
    [
      "Nearest source colour anchor",
      `${result.nearest_spectral_type_anchor}; B−V ${numeric(result.approximate_b_minus_v_mag)}`,
    ],
    ["Approximate main-sequence lifetime", numeric(result.main_sequence_lifetime_years, "years")],
    ["Expected remnant", result.expected_remnant],
  ] as const;
  return (
    <table>
      <caption>
        Canonical approximate Stellar Laboratory result from Lumina&apos;s astronomy API.
      </caption>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StellarLaboratoryNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: StellarLaboratoryNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Stellar Laboratory</p>
          <h1>Stellar Laboratory</h1>
          <p>
            Explore a source-backed approximate main-sequence mass mapping. Lumina&apos;s Python
            astronomy domain owns the empirical relations, lifetime interpolation, and broad remnant
            classification; this page does not recreate them in the browser.
          </p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="stellar-nojs-invalid">
            <h2 id="stellar-nojs-invalid">Shared stellar-laboratory state rejected</h2>
            <p>The reviewed one-Solar-mass preset is shown instead.</p>
          </section>
        ) : null}
        <section aria-labelledby="stellar-nojs-input">
          <h2 id="stellar-nojs-input">Requested mass</h2>
          <p>{numeric(initialState.initial_mass_msun, "M☉")}</p>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="stellar-nojs-unavailable">
            <h2 id="stellar-nojs-unavailable">No canonical result available</h2>
            <p>No browser-generated fallback stellar properties are substituted.</p>
          </section>
        ) : (
          <section aria-labelledby="stellar-nojs-result">
            <h2 id="stellar-nojs-result">Approximate main-sequence result</h2>
            <p>Model version: {initialCalculation.model_version}</p>
            <ResultTable result={initialCalculation} />
            <h3>Broad educational lifecycle</h3>
            <ol>
              {initialCalculation.evolutionary_path.map((stage) => (
                <li key={stage}>{stage}</li>
              ))}
            </ol>
            <p>{initialCalculation.metallicity_scope}</p>
            <p>{initialCalculation.remnant_boundary_note}</p>
          </section>
        )}
        <section aria-labelledby="stellar-nojs-model">
          <h2 id="stellar-nojs-model">Model contract and provenance</h2>
          <p>{STELLAR_LABORATORY_DEFINITION.default_preset}</p>
          <p>{STELLAR_LABORATORY_DEFINITION.sampling_policy}</p>
          <h3>Limitations</h3>
          <ul>
            {STELLAR_LABORATORY_DEFINITION.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Reviewed sources</h3>
          <SourceList />
        </section>
      </article>
    </noscript>
  );
}
