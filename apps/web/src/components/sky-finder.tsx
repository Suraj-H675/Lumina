"use client";

import { useId, useMemo, useState } from "react";

import { calculateMoonHorizontalPosition } from "../lib/observation/lunar";
import type { HorizontalPosition, ObservationPlan } from "../lib/observation/domain";
import {
  computeSolarSystemMarkers,
  filterAboveHorizonMarkers,
  projectAzimuthAtRadius,
  projectHorizontalPosition,
  projectSkyPosition,
  targetForSkyFinder,
  type BelowHorizonProjectionPoint,
  type SkyFinderTarget,
  type SkyProjectionPoint,
  type SkyReferenceMarker,
} from "../lib/observation/sky-finder";

const SKY_VIEW = {
  centerX: 180,
  centerY: 180,
  skyRadius: 122,
  belowHorizonPadding: 14,
} as const;

const CARDINAL_LABELS = [
  { azimuth: 0, label: "N" },
  { azimuth: 45, label: "NE" },
  { azimuth: 90, label: "E" },
  { azimuth: 135, label: "SE" },
  { azimuth: 180, label: "S" },
  { azimuth: 225, label: "SW" },
  { azimuth: 270, label: "W" },
  { azimuth: 315, label: "NW" },
] as const;

const GUIDE_AZIMUTHS = CARDINAL_LABELS.map(({ azimuth }) => azimuth);

function formatAltitude(altitude: number): string {
  return `${altitude < 0 ? "−" : ""}${Math.abs(altitude).toFixed(1)}°`;
}

function formatAzimuth(position: HorizontalPosition): string {
  return `${position.azimuth.toFixed(1)}° · ${position.compass}`;
}

function formatSpokenAltitude(altitude: number): string {
  return `${Math.abs(altitude).toFixed(1)} degrees`;
}

function pointForAzimuth(azimuth: number, radius: number): Readonly<{ x: number; y: number }> {
  const point = projectAzimuthAtRadius(azimuth, radius, SKY_VIEW.centerX, SKY_VIEW.centerY);
  if (point === null) throw new Error("Sky finder received an invalid guide direction");
  return point;
}

function textAnchorForPoint(point: Readonly<{ x: number; y: number }>): "start" | "middle" | "end" {
  if (point.x < SKY_VIEW.centerX - 24) return "end";
  if (point.x > SKY_VIEW.centerX + 24) return "start";
  return "middle";
}

function labelPointForMarker(
  point: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  const anchor = textAnchorForPoint(point);
  return {
    x: point.x + (anchor === "start" ? 10 : anchor === "end" ? -10 : 0),
    y: point.y < SKY_VIEW.centerY ? point.y - 12 : point.y + 22,
  };
}

function MarkerLabel({
  point,
  children,
  className = "",
}: Readonly<{
  children: string;
  className?: string;
  point: Readonly<{ x: number; y: number }>;
}>) {
  const labelPoint = labelPointForMarker(point);
  return (
    <text
      className={className}
      fill="var(--foreground)"
      fontSize="11"
      fontWeight="600"
      textAnchor={textAnchorForPoint(point)}
      x={labelPoint.x}
      y={labelPoint.y}
    >
      {children}
    </text>
  );
}

function TargetMarker({
  target,
  projection,
}: Readonly<{ projection: ReturnType<typeof projectSkyPosition>; target: SkyFinderTarget }>) {
  if (projection === null) return null;
  const point = projection.point;
  const isBelowHorizon = projection.kind === "below-horizon";
  const edgePoint = pointForAzimuth(point.azimuth, SKY_VIEW.skyRadius);
  return (
    <g data-testid={isBelowHorizon ? "sky-finder-target-below" : "sky-finder-target-marker"}>
      {isBelowHorizon ? (
        <line
          stroke="var(--accent)"
          strokeDasharray="3 3"
          strokeOpacity="0.75"
          strokeWidth="1.5"
          x1={edgePoint.x}
          x2={point.x}
          y1={edgePoint.y}
          y2={point.y}
        />
      ) : null}
      <circle
        cx={point.x}
        cy={point.y}
        fill="var(--background)"
        fillOpacity="0.9"
        r={isBelowHorizon ? 7 : 9}
        stroke="var(--accent)"
        strokeDasharray={isBelowHorizon ? "3 2" : undefined}
        strokeWidth="2"
      />
      {isBelowHorizon ? null : (
        <>
          <line
            stroke="var(--accent)"
            strokeWidth="1.5"
            x1={point.x - 13}
            x2={point.x + 13}
            y1={point.y}
            y2={point.y}
          />
          <line
            stroke="var(--accent)"
            strokeWidth="1.5"
            x1={point.x}
            x2={point.x}
            y1={point.y - 13}
            y2={point.y + 13}
          />
        </>
      )}
      <circle cx={point.x} cy={point.y} fill="var(--accent)" r="3.5" />
      <MarkerLabel className="target-label" point={point}>
        {target.name}
      </MarkerLabel>
    </g>
  );
}

function SecondaryMarker({
  name,
  point,
  kind,
}: Readonly<{
  kind: "moon" | "reference";
  name: string;
  point: SkyProjectionPoint | BelowHorizonProjectionPoint;
}>) {
  const isBelowHorizon = "radius" in point && point.radius > SKY_VIEW.skyRadius;
  const edgePoint = pointForAzimuth(point.azimuth, SKY_VIEW.skyRadius);
  return (
    <g data-testid={`sky-finder-${kind}-${isBelowHorizon ? "below" : "marker"}`}>
      {isBelowHorizon ? (
        <line
          stroke="var(--muted)"
          strokeDasharray="2 3"
          strokeOpacity="0.65"
          x1={edgePoint.x}
          x2={point.x}
          y1={edgePoint.y}
          y2={point.y}
        />
      ) : null}
      <circle
        cx={point.x}
        cy={point.y}
        fill={kind === "moon" ? "var(--accent-gold, var(--focus))" : "var(--muted)"}
        fillOpacity={kind === "moon" ? 0.95 : 0.85}
        r={kind === "moon" ? 6 : 4}
        stroke="var(--background)"
        strokeDasharray={isBelowHorizon ? "2 2" : undefined}
        strokeWidth="2"
      />
      <MarkerLabel className={kind === "reference" ? "hidden sm:inline" : ""} point={point}>
        {name}
      </MarkerLabel>
    </g>
  );
}

function SkyProjection({
  target,
  moon,
  references,
}: Readonly<{
  moon: HorizontalPosition | null;
  references: ReadonlyArray<SkyReferenceMarker>;
  target: SkyFinderTarget;
}>) {
  const gradientId = useId().replaceAll(":", "");
  const targetProjection = projectSkyPosition(target.position, SKY_VIEW);
  const moonProjection = moon === null ? null : projectSkyPosition(moon, SKY_VIEW);

  return (
    <figure aria-labelledby={`sky-projection-caption-${gradientId}`} className="space-y-3">
      <div className="mx-auto w-full max-w-[30rem] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background-raised)] p-2 sm:p-4">
        <svg
          aria-hidden="true"
          className="block h-auto w-full"
          data-testid="sky-finder-map"
          role="presentation"
          viewBox="0 0 360 360"
        >
          <defs>
            <radialGradient id={gradientId} cx="50%" cy="44%" r="62%">
              <stop offset="0%" stopColor="var(--surface-hover)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--background)" stopOpacity="0.95" />
            </radialGradient>
          </defs>
          <circle
            cx={SKY_VIEW.centerX}
            cy={SKY_VIEW.centerY}
            fill={`url(#${gradientId})`}
            r={SKY_VIEW.skyRadius}
            stroke="var(--border-strong)"
            strokeWidth="1.5"
          />
          {[30, 60].map((altitude) => (
            <circle
              cx={SKY_VIEW.centerX}
              cy={SKY_VIEW.centerY}
              fill="none"
              key={altitude}
              r={SKY_VIEW.skyRadius * ((90 - altitude) / 90)}
              stroke="var(--border-strong)"
              strokeDasharray="2 5"
              strokeOpacity="0.7"
              strokeWidth="1"
            />
          ))}
          {GUIDE_AZIMUTHS.map((azimuth) => {
            const point = pointForAzimuth(azimuth, SKY_VIEW.skyRadius);
            return (
              <line
                key={azimuth}
                stroke="var(--border-strong)"
                strokeOpacity={azimuth % 90 === 0 ? 0.65 : 0.35}
                strokeWidth={azimuth % 90 === 0 ? 1.2 : 1}
                x1={SKY_VIEW.centerX}
                x2={point.x}
                y1={SKY_VIEW.centerY}
                y2={point.y}
              />
            );
          })}
          <circle
            cx={SKY_VIEW.centerX}
            cy={SKY_VIEW.centerY}
            fill="none"
            r="3"
            stroke="var(--muted)"
            strokeWidth="1"
          />
          {CARDINAL_LABELS.map(({ azimuth, label }) => {
            const point = pointForAzimuth(azimuth, SKY_VIEW.skyRadius + 22);
            return (
              <text
                fill={azimuth % 90 === 0 ? "var(--foreground)" : "var(--muted)"}
                fontSize={azimuth % 90 === 0 ? "14" : "11"}
                fontWeight={azimuth % 90 === 0 ? "700" : "600"}
                key={label}
                textAnchor="middle"
                x={point.x}
                y={point.y + 4}
              >
                {label}
              </text>
            );
          })}
          <text fill="var(--muted)" fontSize="10" textAnchor="middle" x={SKY_VIEW.centerX} y="333">
            Horizon · 0°
          </text>
          <text fill="var(--muted)" fontSize="10" textAnchor="middle" x={SKY_VIEW.centerX} y="174">
            Zenith · 90°
          </text>
          <text fill="var(--muted)" fontSize="10" textAnchor="middle" x="136" y="184">
            60°
          </text>
          <text fill="var(--muted)" fontSize="10" textAnchor="middle" x="84" y="184">
            30°
          </text>
          <TargetMarker projection={targetProjection} target={target} />
          {moonProjection !== null ? (
            <SecondaryMarker kind="moon" name="Moon" point={moonProjection.point} />
          ) : null}
          {references.map((reference) => {
            const projection = projectHorizontalPosition(reference.position, SKY_VIEW);
            return projection === null ? null : (
              <SecondaryMarker
                key={reference.body}
                kind="reference"
                name={reference.name}
                point={projection}
              />
            );
          })}
        </svg>
      </div>
      <figcaption
        className="text-sm leading-6 text-[var(--muted)]"
        id={`sky-projection-caption-${gradientId}`}
      >
        North is at the top, east is right, south is bottom, and west is left. The horizon is the
        outer circle; altitude increases toward the zenith at the center. Rings mark 30° and 60°.
      </figcaption>
    </figure>
  );
}

function FinderInstruction({ target }: Readonly<{ target: SkyFinderTarget }>) {
  const isBelowHorizon = target.position.altitude < 0;
  return (
    <aside
      aria-labelledby="sky-finder-instruction-heading"
      className="rounded-md border border-[var(--border-strong)] bg-[var(--background-raised)] px-4 py-5 sm:px-5"
      data-testid="sky-finder-target-guidance"
    >
      <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
        How to find {target.name}
      </p>
      <h3 className="sr-only" id="sky-finder-instruction-heading">
        How to find {target.name}
      </h3>
      {isBelowHorizon ? (
        <>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            Target is below the horizon
          </p>
          <dl className="mt-5 space-y-4">
            <div>
              <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
                Direction
              </dt>
              <dd className="mt-1 text-xl font-medium text-[var(--foreground)]">
                {formatAzimuth(target.position)} true azimuth
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
                Altitude
              </dt>
              <dd className="mt-1 font-mono text-2xl text-[var(--foreground)]">
                {formatAltitude(target.position.altitude)}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
            The direction shows where {target.name} would rise or set from this location. It is not
            currently in the visible sky.
          </p>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Face
          </p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-[var(--foreground)]">
            {target.position.compass}
          </p>
          <dl className="mt-5 space-y-4">
            <div>
              <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
                True azimuth
              </dt>
              <dd className="mt-1 text-xl font-medium text-[var(--foreground)]">
                {target.position.azimuth.toFixed(1)}°
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
                Look up
              </dt>
              <dd className="mt-1 text-xl font-medium text-[var(--foreground)]">
                {formatAltitude(target.position.altitude)} above the geometric horizon
              </dd>
            </div>
          </dl>
        </>
      )}
      <p className="mt-5 border-t border-[var(--border)] pt-4 text-xs leading-5 text-[var(--muted)]">
        Reference: geometric horizon. Azimuth is measured clockwise from true north. Phone or
        magnetic compass readings can differ by location.
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        The finder does not model local obstructions such as trees, buildings, or terrain.
      </p>
      <p className="sr-only">
        {isBelowHorizon
          ? `The target is ${formatSpokenAltitude(target.position.altitude)} below the geometric horizon at azimuth ${target.position.azimuth.toFixed(1)} degrees ${target.position.compass}.`
          : `The target is ${formatSpokenAltitude(target.position.altitude)} above the geometric horizon at azimuth ${target.position.azimuth.toFixed(1)} degrees ${target.position.compass}.`}
      </p>
    </aside>
  );
}

function PositionRow({
  label,
  position,
  role,
}: Readonly<{
  label: string;
  position: HorizontalPosition;
  role: "moon" | "reference" | "target";
}>) {
  return (
    <li
      aria-label={`${label}: altitude ${formatAltitude(position.altitude)}; azimuth ${formatAzimuth(position)}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-[var(--border)] py-3 last:border-b-0"
    >
      <span
        className={
          role === "target" ? "font-semibold text-[var(--foreground)]" : "text-[var(--foreground)]"
        }
      >
        {label}
        {role === "target" ? (
          <span className="ml-2 text-xs text-[var(--accent)]">target</span>
        ) : null}
      </span>
      <span className="font-mono text-sm text-[var(--foreground)]">
        {formatAltitude(position.altitude)}
      </span>
      <span className="text-xs text-[var(--muted)]">Altitude · geometric</span>
      <span className="font-mono text-sm text-[var(--muted)]">{formatAzimuth(position)}</span>
    </li>
  );
}

function ReferenceList({
  showReferences,
  target,
  moon,
  references,
}: Readonly<{
  moon: HorizontalPosition | null;
  references: ReadonlyArray<SkyReferenceMarker>;
  showReferences: boolean;
  target: SkyFinderTarget;
}>) {
  return (
    <section
      aria-labelledby="sky-finder-reference-heading"
      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          className="text-lg font-semibold text-[var(--foreground)]"
          id="sky-finder-reference-heading"
        >
          Reference objects at selected time
        </h3>
        <span className="text-xs text-[var(--muted)]">Geometric positions only</span>
      </div>
      <ul className="mt-2">
        <PositionRow label={target.name} position={target.position} role="target" />
        {moon !== null ? <PositionRow label="Moon" position={moon} role="moon" /> : null}
        {references.map((reference) => (
          <PositionRow
            key={reference.body}
            label={reference.name}
            position={reference.position}
            role="reference"
          />
        ))}
      </ul>
      {moon === null ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          The Moon position is unavailable for this selected instant.
        </p>
      ) : null}
      {references.length === 0 && showReferences ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          No supported solar-system reference body is above the geometric horizon at this time.
        </p>
      ) : null}
      {references.length === 0 && !showReferences ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Solar-system reference markers are hidden. Turn on the toggle to list bodies above the
          geometric horizon.
        </p>
      ) : null}
    </section>
  );
}

export function SkyFinder({
  plan,
  targetName,
}: Readonly<{ plan: ObservationPlan; targetName: string }>) {
  const [showReferences, setShowReferences] = useState(true);
  const target = useMemo(() => targetForSkyFinder(plan, targetName), [plan, targetName]);
  const observerLocation = plan.location;
  const selectedInstant = plan.selected.instant;
  const moon = useMemo(
    () => calculateMoonHorizontalPosition(observerLocation, selectedInstant),
    [observerLocation, selectedInstant],
  );
  const solarSystemMarkers = useMemo(
    () => computeSolarSystemMarkers(observerLocation, selectedInstant),
    [observerLocation, selectedInstant],
  );
  const references = showReferences ? filterAboveHorizonMarkers(solarSystemMarkers) : [];
  const finderId = useId().replaceAll(":", "");

  return (
    <section aria-labelledby={`sky-finder-heading-${finderId}`} className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
            Selected-time finder
          </p>
          <h2
            className="mt-1 text-2xl font-semibold tracking-tight"
            id={`sky-finder-heading-${finderId}`}
          >
            Sky Finder
          </h2>
        </div>
        <span className="text-sm text-[var(--muted)]">No device sensors used</span>
      </div>
      <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
        Use the direction card and circular map to orient yourself at the selected local time. The
        target marker is primary; the Moon and optional solar-system markers are context.
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <SkyProjection moon={moon} references={references} target={target} />
        <div className="space-y-4">
          <FinderInstruction target={target} />
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)]">
            <input
              aria-describedby={`sky-finder-toggle-help-${finderId}`}
              checked={showReferences}
              className="h-5 w-5 shrink-0 [accent-color:var(--accent)]"
              onChange={(event) => setShowReferences(event.target.checked)}
              type="checkbox"
            />
            <span>Show solar-system markers</span>
          </label>
          <p
            className="text-xs leading-5 text-[var(--muted)]"
            id={`sky-finder-toggle-help-${finderId}`}
          >
            Sun, Mercury, Venus, Mars, Jupiter, and Saturn are shown only when above the geometric
            horizon. Above the horizon does not mean visible.
          </p>
        </div>
      </div>
      <ReferenceList
        moon={moon}
        references={references}
        showReferences={showReferences}
        target={target}
      />
    </section>
  );
}
