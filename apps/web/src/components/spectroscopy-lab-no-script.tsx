import type { SpectroscopyCalculationResponse } from "@lumina/api-client";

import {
  SPECTROSCOPY_DEFINITION,
  SPECTROSCOPY_SOURCES,
  type SpectroscopyState,
} from "../lib/simulations/spectroscopy-lab";

type SpectroscopyLabNoScriptProps = Readonly<{
  initialState: SpectroscopyState;
  initialStateInvalid: boolean;
  initialCalculation: SpectroscopyCalculationResponse | null;
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
      {SPECTROSCOPY_DEFINITION.references.map((sourceId) => {
        const source = SPECTROSCOPY_SOURCES.find((candidate) => candidate.id === sourceId);
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

export function SpectroscopyLabNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: SpectroscopyLabNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Spectroscopy Lab</p>
          <h1>Spectroscopy Lab</h1>
          <p>
            Explore a normalized visible teaching spectrum. Lumina&apos;s Python astronomy domain
            owns the continuum, Wien peak, wavelength shifts, representative line profiles, and
            deterministic noise.
          </p>
        </header>
        {initialStateInvalid ? (
          <section aria-labelledby="spectroscopy-nojs-invalid">
            <h2 id="spectroscopy-nojs-invalid">Shared spectroscopy state rejected</h2>
            <p>The reviewed Solar-like absorption preset is shown instead.</p>
          </section>
        ) : null}
        <section aria-labelledby="spectroscopy-nojs-input">
          <h2 id="spectroscopy-nojs-input">Requested teaching model</h2>
          <p>Mode: {initialState.mode}</p>
          <p>Temperature: {numeric(initialState.temperature_k, "K")}</p>
          <p>
            Selected species:{" "}
            {initialState.selected_elements.length === 0
              ? "none"
              : initialState.selected_elements.join(", ")}
          </p>
          <p>Radial velocity: {numeric(initialState.radial_velocity_km_s, "km/s")}</p>
          <p>Resolving power: {numeric(initialState.resolving_power)}</p>
          <p>
            Display noise σ {numeric(initialState.noise_sigma)}; seed {initialState.noise_seed}.
          </p>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="spectroscopy-nojs-unavailable">
            <h2 id="spectroscopy-nojs-unavailable">No canonical result available</h2>
            <p>No browser-generated spectrum or line positions are substituted.</p>
          </section>
        ) : (
          <section aria-labelledby="spectroscopy-nojs-result">
            <h2 id="spectroscopy-nojs-result">Canonical normalized spectrum</h2>
            <p>Model version: {initialCalculation.model_version}</p>
            <p>Wien peak: {numeric(initialCalculation.wien_peak_nm, "nm")}</p>
            <p>
              Returned samples: {initialCalculation.wavelength_nm.length}; vacuum range{" "}
              {numeric(initialCalculation.wavelength_nm[0] ?? 0, "nm")} to{" "}
              {numeric(initialCalculation.wavelength_nm.at(-1) ?? 0, "nm")}.
            </p>
            <p>{initialCalculation.identification_explanation}</p>
            {initialCalculation.representative_lines.length > 0 ? (
              <table>
                <caption>Returned representative source-backed line metadata.</caption>
                <thead>
                  <tr>
                    <th scope="col">Species</th>
                    <th scope="col">Feature</th>
                    <th scope="col">Rest vacuum nm</th>
                    <th scope="col">Shifted vacuum nm</th>
                    <th scope="col">Illustrative FWHM nm</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalculation.representative_lines.map((line) => (
                    <tr key={`${line.element}-${line.label}`}>
                      <td>{line.element}</td>
                      <td>{line.label}</td>
                      <td>{numeric(line.rest_wavelength_vacuum_nm)}</td>
                      <td>{numeric(line.shifted_wavelength_vacuum_nm)}</td>
                      <td>{numeric(line.illustrative_fwhm_nm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <p>{initialCalculation.continuum_note}</p>
            <p>{initialCalculation.line_strength_note}</p>
            <p>{initialCalculation.resolution_note}</p>
            <p>{initialCalculation.noise_note}</p>
          </section>
        )}
        <section aria-labelledby="spectroscopy-nojs-model">
          <h2 id="spectroscopy-nojs-model">Model contract and provenance</h2>
          <p>{SPECTROSCOPY_DEFINITION.sampling_policy}</p>
          <h3>Limitations</h3>
          <ul>
            {SPECTROSCOPY_DEFINITION.limitations.map((item) => (
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
