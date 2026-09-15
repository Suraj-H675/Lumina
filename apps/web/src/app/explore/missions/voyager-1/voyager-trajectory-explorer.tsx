"use client";

import { useMemo, useState } from "react";

import {
  VOYAGER_SAMPLES,
  voyagerSampleYear,
  type VoyagerTrajectorySample,
} from "../../../../lib/visualizations/voyager-1";

export function VoyagerTrajectoryExplorer() {
  const [sampleIndex, setSampleIndex] = useState(VOYAGER_SAMPLES.length - 1);
  const sample = VOYAGER_SAMPLES[sampleIndex]!;

  return (
    <section
      aria-labelledby="voyager-trajectory-heading"
      className="space-y-6 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-3">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          JPL Horizons · pinned annual vectors
        </p>
        <h2 className="text-2xl font-semibold" id="voyager-trajectory-heading">
          Voyager 1 trajectory reference
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          The path below is an XY projection of Sun-centered geometric positions in the J2000
          ecliptic frame. Z is not drawn in the projection and remains visible numerically. Annual
          points are connected only as a visual guide; Lumina does not interpolate a continuous
          flight solution.
        </p>
      </div>

      <label className="block max-w-3xl space-y-2 font-semibold">
        <span>
          Selected annual sample: {voyagerSampleYear(sample)} · {sample.radius_au.toFixed(2)} AU
          from the Sun
        </span>
        <input
          aria-label="Voyager annual trajectory sample"
          className="min-h-11 w-full"
          max={VOYAGER_SAMPLES.length - 1}
          min={0}
          onChange={(event) => setSampleIndex(Number(event.currentTarget.value))}
          step={1}
          type="range"
          value={sampleIndex}
        />
      </label>

      <div className="grid gap-6 xl:grid-cols-2">
        <TrajectoryProjection selectedIndex={sampleIndex} />
        <DistanceHistory selectedIndex={sampleIndex} />
      </div>

      <SelectedVector sample={sample} />
    </section>
  );
}

function TrajectoryProjection({ selectedIndex }: Readonly<{ selectedIndex: number }>) {
  const plot = useMemo(() => {
    const maxAbs = Math.max(
      ...VOYAGER_SAMPLES.flatMap((sample) => [Math.abs(sample.x_au), Math.abs(sample.y_au)]),
    );
    const center = 260;
    const span = 225;
    const scale = span / maxAbs;
    const point = (sample: VoyagerTrajectorySample) => ({
      x: center + sample.x_au * scale,
      y: center - sample.y_au * scale,
    });
    return { center, points: VOYAGER_SAMPLES.map(point) };
  }, []);
  const selected = plot.points[selectedIndex]!;

  return (
    <figure className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-4">
      <figcaption className="space-y-1">
        <span className="block font-semibold">J2000 ecliptic XY projection</span>
        <span className="block text-xs leading-5 text-[var(--muted)]">
          Equal X/Y scale in AU. This is a projection, not a full 3D path; Z is omitted here.
        </span>
      </figcaption>
      <svg
        aria-label="Voyager 1 heliocentric ecliptic XY trajectory projection"
        className="h-auto w-full"
        role="img"
        viewBox="0 0 520 520"
      >
        <line
          x1="20"
          x2="500"
          y1={plot.center}
          y2={plot.center}
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        <line
          x1={plot.center}
          x2={plot.center}
          y1="20"
          y2="500"
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        <polyline
          fill="none"
          points={plot.points.map((point) => `${point.x},${point.y}`).join(" ")}
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx={plot.center} cy={plot.center} fill="currentColor" r="5" />
        <circle
          cx={selected.x}
          cy={selected.y}
          fill="var(--background)"
          r="7"
          stroke="currentColor"
          strokeWidth="3"
        />
        <text fill="currentColor" fontSize="12" x={plot.center + 9} y={plot.center - 9}>
          Sun
        </text>
        <text fill="currentColor" fontSize="12" x="430" y={plot.center - 8}>
          +X
        </text>
        <text fill="currentColor" fontSize="12" x={plot.center + 8} y="28">
          +Y
        </text>
      </svg>
    </figure>
  );
}

function DistanceHistory({ selectedIndex }: Readonly<{ selectedIndex: number }>) {
  const plot = useMemo(() => {
    const width = 520;
    const height = 260;
    const margin = 28;
    const maxRadius = Math.max(...VOYAGER_SAMPLES.map((sample) => sample.radius_au));
    const points = VOYAGER_SAMPLES.map((sample, index) => ({
      x: margin + (index / (VOYAGER_SAMPLES.length - 1)) * (width - margin * 2),
      y: height - margin - (sample.radius_au / maxRadius) * (height - margin * 2),
    }));
    return { height, margin, maxRadius, points, width };
  }, []);
  const selected = plot.points[selectedIndex]!;

  return (
    <figure className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-4">
      <figcaption className="space-y-1">
        <span className="block font-semibold">Heliocentric distance history</span>
        <span className="block text-xs leading-5 text-[var(--muted)]">
          Distance is the reviewed Python-derived √(X² + Y² + Z²) value for each annual Horizons
          sample.
        </span>
      </figcaption>
      <svg
        aria-label="Voyager 1 heliocentric distance by annual sample"
        className="h-auto w-full"
        role="img"
        viewBox={`0 0 ${plot.width} ${plot.height}`}
      >
        <line
          x1={plot.margin}
          x2={plot.margin}
          y1={plot.margin}
          y2={plot.height - plot.margin}
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        <line
          x1={plot.margin}
          x2={plot.width - plot.margin}
          y1={plot.height - plot.margin}
          y2={plot.height - plot.margin}
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        <polyline
          fill="none"
          points={plot.points.map((point) => `${point.x},${point.y}`).join(" ")}
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          cx={selected.x}
          cy={selected.y}
          fill="var(--background)"
          r="6"
          stroke="currentColor"
          strokeWidth="3"
        />
        <text fill="currentColor" fontSize="11" x={plot.margin + 4} y={plot.margin + 12}>
          {plot.maxRadius.toFixed(0)} AU
        </text>
        <text fill="currentColor" fontSize="11" x={plot.margin} y={plot.height - 6}>
          1977
        </text>
        <text fill="currentColor" fontSize="11" x={plot.width - 56} y={plot.height - 6}>
          2026
        </text>
      </svg>
    </figure>
  );
}

function SelectedVector({ sample }: Readonly<{ sample: VoyagerTrajectorySample }>) {
  return (
    <section aria-labelledby="selected-voyager-vector-heading" className="space-y-4">
      <h3 className="text-xl font-semibold" id="selected-voyager-vector-heading">
        Selected Horizons vector · {voyagerSampleYear(sample)}
      </h3>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <VectorFact label="Epoch (TDB)" value={sample.epoch_tdb.replace("A.D. ", "")} />
        <VectorFact label="X" value={`${sample.x_au.toFixed(6)} AU`} />
        <VectorFact label="Y" value={`${sample.y_au.toFixed(6)} AU`} />
        <VectorFact label="Z" value={`${sample.z_au.toFixed(6)} AU`} />
        <VectorFact label="Distance" value={`${sample.radius_au.toFixed(6)} AU`} />
      </dl>
    </section>
  );
}

function VectorFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-3">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm">{value}</dd>
    </div>
  );
}
