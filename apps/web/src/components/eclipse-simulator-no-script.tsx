import type { EclipseSimulatorCalculationResponse } from "@lumina/api-client";

import {
  ECLIPSE_SIMULATOR_DEFINITION,
  ECLIPSE_SIMULATOR_SOURCES,
  type EclipseSimulatorState,
} from "../lib/simulations/eclipse-simulator";

type EclipseSimulatorNoScriptProps = Readonly<{
  initialState: EclipseSimulatorState;
  initialStateInvalid: boolean;
  initialCalculation: EclipseSimulatorCalculationResponse | null;
}>;

function number(value: number, suffix = ""): string {
  const result = value.toLocaleString("en", { maximumSignificantDigits: 7 });
  return suffix ? `${result} ${suffix}` : result;
}

function SourceList() {
  return (
    <ul>
      {ECLIPSE_SIMULATOR_DEFINITION.references.map((sourceId) => {
        const source = ECLIPSE_SIMULATOR_SOURCES.find((candidate) => candidate.id === sourceId);
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

function Safety() {
  const source = ECLIPSE_SIMULATOR_SOURCES.find((item) => item.id === "nasa-eclipse-safety");
  return (
    <section aria-labelledby="eclipse-nojs-safety">
      <h2 id="eclipse-nojs-safety">Solar-viewing safety</h2>
      <p>
        Simulator output never determines whether direct Solar viewing is safe. Partial and annular
        phases require proper Solar viewing protection; cameras, binoculars, and telescopes require
        appropriate Solar filters on the Sun-facing optics.
      </p>
      {source ? <a href={source.url}>Read NASA&apos;s eclipse viewing safety guidance.</a> : null}
    </section>
  );
}

export function EclipseSimulatorNoScript({
  initialState,
  initialStateInvalid,
  initialCalculation,
}: EclipseSimulatorNoScriptProps) {
  return (
    <noscript>
      <article>
        <header>
          <p>Phase 7 / Eclipse Simulator</p>
          <h1>Eclipse Simulator</h1>
          <p>
            Explore offline topocentric solar-eclipse geometry. Lumina&apos;s Python astronomy
            domain owns the ephemeris, apparent disk sizes, overlap, classification, and approximate
            contact search.
          </p>
        </header>
        <Safety />
        {initialStateInvalid ? (
          <section aria-labelledby="eclipse-nojs-invalid">
            <h2 id="eclipse-nojs-invalid">Shared eclipse state rejected</h2>
            <p>The reviewed Dallas 2024 reference preset is shown instead.</p>
          </section>
        ) : null}
        <section aria-labelledby="eclipse-nojs-input">
          <h2 id="eclipse-nojs-input">Observer state</h2>
          <p>UTC instant: {initialState.at_utc}</p>
          <p>
            Latitude {initialState.latitude_deg}°, longitude {initialState.longitude_deg}°,
            elevation {initialState.elevation_m} m.
          </p>
        </section>
        {initialCalculation === null ? (
          <section aria-labelledby="eclipse-nojs-unavailable">
            <h2 id="eclipse-nojs-unavailable">No canonical result available</h2>
            <p>No browser-generated eclipse geometry is substituted.</p>
          </section>
        ) : (
          <section aria-labelledby="eclipse-nojs-result">
            <h2 id="eclipse-nojs-result">Topocentric apparent geometry</h2>
            <p>Model version: {initialCalculation.model_version}</p>
            <table>
              <caption>
                Canonical Eclipse Simulator result from Lumina&apos;s astronomy API.
              </caption>
              <tbody>
                <tr>
                  <th scope="row">Local phase</th>
                  <td>{initialCalculation.instant.phase}</td>
                </tr>
                <tr>
                  <th scope="row">Shadow interpretation</th>
                  <td>{initialCalculation.instant.shadow_region}</td>
                </tr>
                <tr>
                  <th scope="row">Sun angular radius</th>
                  <td>{number(initialCalculation.instant.sun_angular_radius_deg, "deg")}</td>
                </tr>
                <tr>
                  <th scope="row">Moon angular radius</th>
                  <td>{number(initialCalculation.instant.moon_angular_radius_deg, "deg")}</td>
                </tr>
                <tr>
                  <th scope="row">Center separation</th>
                  <td>{number(initialCalculation.instant.center_separation_deg, "deg")}</td>
                </tr>
                <tr>
                  <th scope="row">Geometric Solar-disk obscuration</th>
                  <td>{number(initialCalculation.instant.obscuration_fraction * 100, "%")}</td>
                </tr>
                <tr>
                  <th scope="row">Geometric Sun altitude</th>
                  <td>{number(initialCalculation.instant.sun_altitude_deg, "deg")}</td>
                </tr>
              </tbody>
            </table>
            {initialCalculation.local_event ? (
              <>
                <h3>Approximate local contacts</h3>
                <p>Partial begins: {initialCalculation.local_event.partial_begin_utc}</p>
                {initialCalculation.local_event.central_begin_utc ? (
                  <p>Central phase begins: {initialCalculation.local_event.central_begin_utc}</p>
                ) : null}
                <p>Maximum: {initialCalculation.local_event.maximum_utc}</p>
                {initialCalculation.local_event.central_end_utc ? (
                  <p>Central phase ends: {initialCalculation.local_event.central_end_utc}</p>
                ) : null}
                <p>Partial ends: {initialCalculation.local_event.partial_end_utc}</p>
              </>
            ) : (
              <p>No local eclipse event is returned for this instant.</p>
            )}
            <p>{initialCalculation.ephemeris_note}</p>
            <p>{initialCalculation.timing_note}</p>
          </section>
        )}
        <section aria-labelledby="eclipse-nojs-model">
          <h2 id="eclipse-nojs-model">Why eclipses are not monthly</h2>
          <p>
            NASA explains that the Moon&apos;s orbit is inclined by roughly five degrees to the
            ecliptic, so at most new moons the lunar shadow passes above or below Earth.
          </p>
          <h3>Model limitations</h3>
          <ul>
            {ECLIPSE_SIMULATOR_DEFINITION.limitations.map((item) => (
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
