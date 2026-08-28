"use client";

import { useEffect, useId, useMemo, useState } from "react";

import {
  loadBrightStarContext,
  type BrightContextStar,
} from "../lib/observation/bright-star-context";
import {
  loadConstellationContext,
  loadNamedAnchorContext,
  resolveTargetConstellation,
  type ConstellationRegion,
  type ConstellationContext,
  type NamedAnchorContext,
  type TargetMembership,
} from "../lib/observation/iau-context";
import { calculateMoonHorizontalPosition } from "../lib/observation/lunar";
import type { HorizontalPosition, ObservationPlan } from "../lib/observation/domain";
import {
  NAMED_ANCHOR_LABEL_CAP,
  calculateBrightContextHorizontalPositions,
  computeSolarSystemMarkers,
  filterAboveHorizonMarkers,
  positionNamedSkyAnchors,
  projectAzimuthAtRadius,
  projectConstellationBoundary,
  projectHorizontalPosition,
  projectSkyPosition,
  selectNamedAnchorLabels,
  selectRenderedBrightContextStars,
  starMarkerOpacity,
  starMarkerRadius,
  targetForSkyFinder,
  type BelowHorizonProjectionPoint,
  type SkyFinderTarget,
  type SkyProjectionPoint,
  type SkyReferenceMarker,
  type PositionedBrightContextStar,
  type PositionedNamedSkyAnchor,
  type ProjectedConstellationBoundary,
  type RenderedBrightContextSelection,
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

type BrightStarContextState =
  | Readonly<{ status: "idle" | "loading" | "failure" }>
  | Readonly<{ status: "ready"; stars: ReadonlyArray<BrightContextStar> }>;

type NamedAnchorContextState =
  | Readonly<{ status: "loading" | "failure" }>
  | Readonly<{ status: "ready"; context: NamedAnchorContext }>;

type ConstellationContextState =
  | Readonly<{ status: "loading" | "failure" }>
  | Readonly<{ status: "ready"; context: ConstellationContext }>;

function formatAltitude(altitude: number): string {
  return `${altitude < 0 ? "−" : ""}${Math.abs(altitude).toFixed(1)}°`;
}

function formatAzimuth(position: HorizontalPosition): string {
  return `${position.azimuth.toFixed(1)}° · ${position.compass}`;
}

function formatSpokenAltitude(altitude: number): string {
  return `${Math.abs(altitude).toFixed(1)} degrees`;
}

function formatAngularSeparation(separation: number): string {
  return `${separation.toFixed(1)}°`;
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
  fontSize = 11,
}: Readonly<{
  children: string;
  className?: string;
  fontSize?: number;
  point: Readonly<{ x: number; y: number }>;
}>) {
  const labelPoint = labelPointForMarker(point);
  return (
    <text
      className={className}
      fill="var(--foreground)"
      fontSize={fontSize}
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

function BrightStarLayer({
  stars,
}: Readonly<{ stars: ReadonlyArray<PositionedBrightContextStar> }>) {
  if (stars.length === 0) return null;
  return (
    <g aria-hidden="true" data-testid="sky-finder-bright-star-layer" pointerEvents="none">
      {stars.map((star) => {
        const projection = projectHorizontalPosition(star.position, SKY_VIEW);
        const radius = starMarkerRadius(star.gMagnitude);
        const opacity = starMarkerOpacity(star.gMagnitude);
        return projection === null || radius === null || opacity === null ? null : (
          <circle
            cx={projection.x}
            cy={projection.y}
            data-source-id={star.sourceId}
            data-testid="sky-finder-context-star"
            fill="var(--foreground)"
            fillOpacity={opacity}
            key={star.sourceId}
            pointerEvents="none"
            r={radius}
          />
        );
      })}
    </g>
  );
}

function ConstellationBoundaryLayer({
  paths,
}: Readonly<{ paths: ProjectedConstellationBoundary }>) {
  if (paths.length === 0) return null;
  return (
    <g
      aria-hidden="true"
      data-testid="sky-finder-constellation-boundary"
      fill="none"
      pointerEvents="none"
    >
      {paths.map((path, index) => (
        <path
          d={path
            .map(
              (point, pointIndex) =>
                `${pointIndex === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
            )
            .join(" ")}
          key={`boundary-${index}`}
          stroke="var(--focus)"
          strokeOpacity="0.42"
          strokeWidth="0.9"
        />
      ))}
    </g>
  );
}

function NamedAnchorLayer({
  anchors,
  labels,
}: Readonly<{
  anchors: ReadonlyArray<PositionedNamedSkyAnchor>;
  labels: ReadonlyArray<PositionedNamedSkyAnchor>;
}>) {
  if (anchors.length === 0) return null;
  const labelSourceIds = new Set(labels.map((anchor) => anchor.gaiaSourceId));
  return (
    <g aria-hidden="true" data-testid="sky-finder-named-anchor-layer" pointerEvents="none">
      {anchors.map((anchor) => {
        const projection = projectHorizontalPosition(anchor.position, SKY_VIEW);
        if (projection === null) return null;
        const markerRadius = starMarkerRadius(anchor.gMagnitude);
        return (
          <circle
            cx={projection.x}
            cy={projection.y}
            data-source-id={anchor.gaiaSourceId}
            data-testid="sky-finder-named-anchor-marker"
            fill="none"
            key={anchor.gaiaSourceId}
            pointerEvents="none"
            r={(markerRadius ?? 1) + 2.2}
            stroke="var(--focus)"
            strokeOpacity="0.72"
            strokeWidth="1.1"
          />
        );
      })}
      {labels.map((anchor) => {
        if (!labelSourceIds.has(anchor.gaiaSourceId)) return null;
        const projection = projectHorizontalPosition(anchor.position, SKY_VIEW);
        return projection === null ? null : (
          <MarkerLabel
            className="named-anchor-label"
            fontSize={9}
            key={`label-${anchor.gaiaSourceId}`}
            point={projection}
          >
            {anchor.iauName}
          </MarkerLabel>
        );
      })}
    </g>
  );
}

function SkyProjection({
  contextStars,
  constellationBoundary,
  namedAnchorLabels,
  namedAnchors,
  target,
  moon,
  references,
}: Readonly<{
  contextStars: ReadonlyArray<PositionedBrightContextStar>;
  constellationBoundary: ProjectedConstellationBoundary;
  moon: HorizontalPosition | null;
  namedAnchorLabels: ReadonlyArray<PositionedNamedSkyAnchor>;
  namedAnchors: ReadonlyArray<PositionedNamedSkyAnchor>;
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
          <ConstellationBoundaryLayer paths={constellationBoundary} />
          <BrightStarLayer stars={contextStars} />
          <NamedAnchorLayer anchors={namedAnchors} labels={namedAnchorLabels} />
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
          {moonProjection !== null ? (
            <SecondaryMarker kind="moon" name="Moon" point={moonProjection.point} />
          ) : null}
          <TargetMarker projection={targetProjection} target={target} />
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

function BrightStarContextMetadata({
  contextState,
  selection,
  showContext,
  transformFailed,
}: Readonly<{
  contextState: BrightStarContextState;
  selection: RenderedBrightContextSelection;
  showContext: boolean;
  transformFailed: boolean;
}>) {
  let status: string;
  if (!showContext) {
    status = "Bright-star context is hidden.";
  } else if (contextState.status === "idle" || contextState.status === "loading") {
    status = "Loading pinned bright-star context…";
  } else if (contextState.status === "failure" || transformFailed) {
    status = "Bright-star context unavailable.";
  } else if (selection.capApplied) {
    status = `Showing the 1,200 brightest context stars above the horizon from the pinned Gaia DR3 G ≤ 5.5 slice. ${selection.aboveHorizonCount.toLocaleString()} context stars are above the geometric horizon.`;
  } else {
    status = `${selection.aboveHorizonCount.toLocaleString()} context stars above the geometric horizon.`;
  }
  return (
    <section
      aria-labelledby="bright-star-context-heading"
      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5"
      data-testid="sky-finder-bright-star-metadata"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          className="text-lg font-semibold text-[var(--foreground)]"
          id="bright-star-context-heading"
        >
          Bright-star context
        </h3>
        <span className="text-xs text-[var(--muted)]">Gaia DR3 · G ≤ 5.5</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--foreground)]" role="status">
        {status}
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        Positions: Gaia DR3 catalogue epoch J2016.0. Proper motion not propagated.
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Marker size is derived from Gaia G magnitude; it is a visual encoding, not stellar physical
        size or a guarantee of visibility.
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Source: ESA Gaia Archive · processed by Gaia DPAC. Context rows are not searchable Lumina
        catalogue entities.
      </p>
    </section>
  );
}

function ConstellationContextMetadata({
  boundaryPaths,
  contextState,
  region,
  membership,
  showBoundary,
}: Readonly<{
  boundaryPaths: ProjectedConstellationBoundary;
  contextState: ConstellationContextState;
  membership: TargetMembership | null;
  region: ConstellationRegion | null;
  showBoundary: boolean;
}>) {
  let status: string;
  if (contextState.status === "loading") {
    status = "Loading constellation context…";
  } else if (contextState.status === "failure" || membership === null || region === null) {
    status = "Constellation context unavailable.";
  } else if (!showBoundary) {
    status = "Constellation boundary is hidden.";
  } else if (boundaryPaths.length === 0) {
    status = "No boundary segment is above the geometric horizon at this selected time.";
  } else {
    status = "Target constellation boundary shown for the selected observer and instant.";
  }
  return (
    <section
      aria-labelledby="constellation-context-heading"
      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5"
      data-testid="sky-finder-constellation-metadata"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          className="text-lg font-semibold text-[var(--foreground)]"
          id="constellation-context-heading"
        >
          Constellation region
        </h3>
        <span className="text-xs text-[var(--muted)]">Official IAU region</span>
      </div>
      {membership !== null && region !== null ? (
        <>
          <p
            className="mt-2 text-xl font-semibold text-[var(--foreground)]"
            data-testid="sky-finder-target-constellation"
          >
            Constellation {region.latinName}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Official abbreviation{" "}
            <span className="font-mono">{membership.constellationAbbreviation}</span>
          </p>
        </>
      ) : null}
      <p className="mt-2 text-sm leading-6 text-[var(--foreground)]" role="status">
        {status}
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        Constellations are official IAU sky regions; the boundary shown is not a stick-figure
        drawing. The pinned boundary coordinates are J2000.0 equatorial regions transformed to the
        selected observer and instant.
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Source: International Astronomical Union. This context uses region geometry only; it does
        not describe physical proximity or guarantee visibility.
      </p>
    </section>
  );
}

function NamedAnchorReferenceList({
  anchors,
  brightContextStatus,
  contextState,
  showAnchors,
  transformFailed,
}: Readonly<{
  anchors: ReadonlyArray<PositionedNamedSkyAnchor>;
  brightContextStatus: BrightStarContextState["status"];
  contextState: NamedAnchorContextState;
  showAnchors: boolean;
  transformFailed: boolean;
}>) {
  const referenceAnchors = anchors.slice(0, NAMED_ANCHOR_LABEL_CAP);
  const nearest = anchors[0];
  let status: string;
  if (!showAnchors) {
    status = "Named star anchor markers and labels are hidden.";
  } else if (contextState.status === "loading" || brightContextStatus === "loading") {
    status = "Loading named sky anchors…";
  } else if (
    contextState.status === "failure" ||
    brightContextStatus === "failure" ||
    transformFailed ||
    anchors.length === 0
  ) {
    status = "Named star anchors unavailable.";
  } else {
    status = `${anchors.length.toLocaleString()} named anchors reuse the pinned Gaia star positions.`;
  }
  return (
    <section
      aria-labelledby="named-anchor-heading"
      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5"
      data-testid="sky-finder-named-anchor-list"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-[var(--foreground)]" id="named-anchor-heading">
          Named sky anchors
        </h3>
        <span className="text-xs text-[var(--muted)]">Objective geometric context</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--foreground)]" role="status">
        {status}
      </p>
      {nearest !== undefined && showAnchors ? (
        <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
          Nearest named sky anchor by angular separation:{" "}
          <span className="font-semibold">{nearest.iauName}</span> ·{" "}
          {formatAngularSeparation(nearest.angularSeparationDegrees)}.
        </p>
      ) : null}
      {referenceAnchors.length > 0 ? (
        <ul aria-label="Named sky anchors at selected time" className="mt-2">
          {referenceAnchors.map((anchor) => (
            <li
              aria-label={`${anchor.iauName}: altitude ${formatAltitude(anchor.position.altitude)}; azimuth ${formatAzimuth(anchor.position)}; angular separation ${formatAngularSeparation(anchor.angularSeparationDegrees)} from target`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-[var(--border)] py-3 last:border-b-0"
              data-testid="sky-finder-named-anchor-row"
              key={anchor.gaiaSourceId}
            >
              <span className="font-medium text-[var(--foreground)]">{anchor.iauName}</span>
              <span className="font-mono text-sm text-[var(--foreground)]">
                {formatAltitude(anchor.position.altitude)}
              </span>
              <span className="text-xs text-[var(--muted)]">Altitude · geometric</span>
              <span className="font-mono text-sm text-[var(--muted)]">
                {formatAzimuth(anchor.position)}
              </span>
              <span className="col-span-2 text-xs text-[var(--muted)]">
                Angular separation from target ·{" "}
                {formatAngularSeparation(anchor.angularSeparationDegrees)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
        Proper names: IAU Working Group on Star Names. Positions: ESA Gaia DR3 / Gaia DPAC. Above
        the geometric horizon is not a naked-eye visibility claim; proper motion is not propagated.
      </p>
    </section>
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
  targetSlug,
}: Readonly<{ plan: ObservationPlan; targetName: string; targetSlug: string }>) {
  const [showReferences, setShowReferences] = useState(true);
  const [showBrightStarContext, setShowBrightStarContext] = useState(true);
  const [showNamedAnchors, setShowNamedAnchors] = useState(true);
  const [showConstellationBoundary, setShowConstellationBoundary] = useState(true);
  const [brightStarContext, setBrightStarContext] = useState<BrightStarContextState>({
    status: "loading",
  });
  const [namedAnchorContext, setNamedAnchorContext] = useState<NamedAnchorContextState>({
    status: "loading",
  });
  const [constellationContext, setConstellationContext] = useState<ConstellationContextState>({
    status: "loading",
  });
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
  useEffect(() => {
    let active = true;
    void loadBrightStarContext().then(
      (stars) => {
        if (active) setBrightStarContext({ status: "ready", stars });
      },
      () => {
        if (active) setBrightStarContext({ status: "failure" });
      },
    );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void loadNamedAnchorContext().then(
      (context) => {
        if (active) setNamedAnchorContext({ status: "ready", context });
      },
      () => {
        if (active) setNamedAnchorContext({ status: "failure" });
      },
    );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void loadConstellationContext().then(
      (context) => {
        if (active) setConstellationContext({ status: "ready", context });
      },
      () => {
        if (active) setConstellationContext({ status: "failure" });
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const positionedBrightStars = useMemo(
    () =>
      brightStarContext.status === "ready"
        ? calculateBrightContextHorizontalPositions(
            brightStarContext.stars,
            observerLocation,
            selectedInstant,
          )
        : [],
    [brightStarContext, observerLocation, selectedInstant],
  );
  const brightStarSelection = useMemo(
    () => selectRenderedBrightContextStars(positionedBrightStars),
    [positionedBrightStars],
  );
  const brightStarTransformFailed =
    brightStarContext.status === "ready" &&
    brightStarContext.stars.length > 0 &&
    positionedBrightStars.length === 0;
  const targetConstellationMembership = useMemo(
    () =>
      constellationContext.status === "ready"
        ? resolveTargetConstellation(constellationContext.context, targetSlug, plan.coordinate)
        : null,
    [constellationContext, plan.coordinate, targetSlug],
  );
  const targetConstellationRegion = useMemo(
    () =>
      targetConstellationMembership === null || constellationContext.status !== "ready"
        ? null
        : (constellationContext.context.constellations.find(
            (item) => item.abbreviation === targetConstellationMembership.constellationAbbreviation,
          ) ?? null),
    [constellationContext, targetConstellationMembership],
  );
  const constellationBoundary = useMemo(
    () =>
      targetConstellationRegion === null || constellationContext.status !== "ready"
        ? []
        : projectConstellationBoundary(
            targetConstellationRegion,
            observerLocation,
            selectedInstant,
            SKY_VIEW,
          ),
    [constellationContext.status, observerLocation, selectedInstant, targetConstellationRegion],
  );
  const namedAnchors = useMemo(
    () =>
      namedAnchorContext.status !== "ready" ||
      brightStarContext.status !== "ready" ||
      brightStarTransformFailed
        ? []
        : positionNamedSkyAnchors(
            namedAnchorContext.context.rows,
            positionedBrightStars,
            target.position,
          ),
    [
      brightStarContext.status,
      brightStarTransformFailed,
      namedAnchorContext,
      positionedBrightStars,
      target.position,
    ],
  );
  const namedAnchorLabels = useMemo(() => selectNamedAnchorLabels(namedAnchors), [namedAnchors]);
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
        target marker is primary; named sky anchors, the Moon, solar-system markers, the target
        constellation region, and pinned Gaia bright stars are context.
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <SkyProjection
          contextStars={
            showBrightStarContext && !brightStarTransformFailed ? brightStarSelection.stars : []
          }
          constellationBoundary={showConstellationBoundary ? constellationBoundary : []}
          moon={moon}
          namedAnchorLabels={showNamedAnchors ? namedAnchorLabels : []}
          namedAnchors={showNamedAnchors ? namedAnchors : []}
          references={references}
          target={target}
        />
        <div className="space-y-4">
          <FinderInstruction target={target} />
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)]">
            <input
              aria-describedby={`sky-finder-named-anchor-toggle-help-${finderId}`}
              checked={showNamedAnchors}
              className="h-5 w-5 shrink-0 [accent-color:var(--focus)]"
              onChange={(event) => setShowNamedAnchors(event.target.checked)}
              type="checkbox"
            />
            <span>Show named star anchors</span>
          </label>
          <p
            className="text-xs leading-5 text-[var(--muted)]"
            id={`sky-finder-named-anchor-toggle-help-${finderId}`}
          >
            Official IAU proper names are layered onto their matching Gaia DR3 context stars. The
            underlying bright-star dots are controlled separately.
          </p>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)]">
            <input
              aria-describedby={`sky-finder-constellation-toggle-help-${finderId}`}
              checked={showConstellationBoundary}
              className="h-5 w-5 shrink-0 [accent-color:var(--focus)]"
              onChange={(event) => setShowConstellationBoundary(event.target.checked)}
              type="checkbox"
            />
            <span>Show constellation boundary</span>
          </label>
          <p
            className="text-xs leading-5 text-[var(--muted)]"
            id={`sky-finder-constellation-toggle-help-${finderId}`}
          >
            Shows the selected target&apos;s official IAU sky-region boundary, not an artistic
            constellation drawing.
          </p>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)]">
            <input
              aria-describedby={`sky-finder-star-toggle-help-${finderId}`}
              checked={showBrightStarContext}
              className="h-5 w-5 shrink-0 [accent-color:var(--accent)]"
              onChange={(event) => setShowBrightStarContext(event.target.checked)}
              type="checkbox"
            />
            <span>Show bright-star context</span>
          </label>
          <p
            className="text-xs leading-5 text-[var(--muted)]"
            id={`sky-finder-star-toggle-help-${finderId}`}
          >
            Neutral markers come only from the pinned Gaia DR3 G ≤ 5.5 context artifact and are
            shown above the geometric horizon.
          </p>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)]">
            <input
              aria-describedby={`sky-finder-solar-toggle-help-${finderId}`}
              checked={showReferences}
              className="h-5 w-5 shrink-0 [accent-color:var(--accent)]"
              onChange={(event) => setShowReferences(event.target.checked)}
              type="checkbox"
            />
            <span>Show solar-system markers</span>
          </label>
          <p
            className="text-xs leading-5 text-[var(--muted)]"
            id={`sky-finder-solar-toggle-help-${finderId}`}
          >
            Sun, Mercury, Venus, Mars, Jupiter, and Saturn are shown only when above the geometric
            horizon. Above the horizon does not mean visible.
          </p>
        </div>
      </div>
      <BrightStarContextMetadata
        contextState={brightStarContext}
        selection={brightStarSelection}
        showContext={showBrightStarContext}
        transformFailed={brightStarTransformFailed}
      />
      <ConstellationContextMetadata
        boundaryPaths={constellationBoundary}
        contextState={constellationContext}
        membership={targetConstellationMembership}
        region={targetConstellationRegion}
        showBoundary={showConstellationBoundary}
      />
      <NamedAnchorReferenceList
        anchors={namedAnchors}
        brightContextStatus={brightStarContext.status}
        contextState={namedAnchorContext}
        showAnchors={showNamedAnchors}
        transformFailed={brightStarTransformFailed}
      />
      <ReferenceList
        moon={moon}
        references={references}
        showReferences={showReferences}
        target={target}
      />
    </section>
  );
}
