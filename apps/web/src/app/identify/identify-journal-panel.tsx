"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";

import type { IdentificationSolutionResponse } from "@lumina/api-client";

import {
  IdentificationJournalSaveError,
  saveIdentificationSolutionToJournal,
} from "../../lib/journal/identification";

export function IdentifyJournalPanel({
  completedAt,
  solution,
  sourceImage,
}: Readonly<{
  completedAt: string | null;
  solution: IdentificationSolutionResponse;
  sourceImage: File | null;
}>) {
  const [title, setTitle] = useState("");
  const [observationTime, setObservationTime] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [telescope, setTelescope] = useState("");
  const [camera, setCamera] = useState("");
  const [conditions, setConditions] = useState("");
  const [notes, setNotes] = useState("");
  const [attachImage, setAttachImage] = useState(false);
  const [state, setState] = useState<
    | Readonly<{ kind: "idle" }>
    | Readonly<{ kind: "saving" }>
    | Readonly<{ entryId: string; kind: "saved" }>
    | Readonly<{ kind: "error"; message: string }>
  >({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (completedAt === null) {
      setState({
        kind: "error",
        message: "The solved-result timestamp is unavailable, so the journal save was refused.",
      });
      return;
    }
    const parsedLocation = parseLocation(locationLabel, latitude, longitude);
    if (!parsedLocation.ok) {
      setState({ kind: "error", message: parsedLocation.message });
      return;
    }
    const observationTimeUtc = parseObservationTime(observationTime);
    if (observationTime.length > 0 && observationTimeUtc === null) {
      setState({
        kind: "error",
        message: "Enter a valid observation date and time, or leave it blank.",
      });
      return;
    }
    if (title.trim().length === 0) {
      setState({ kind: "error", message: "Give this journal entry a title." });
      return;
    }

    setState({ kind: "saving" });
    try {
      const entry = await saveIdentificationSolutionToJournal({
        attachImage,
        camera,
        completedAt,
        conditions,
        latitudeDeg: parsedLocation.latitudeDeg,
        locationLabel: parsedLocation.label,
        longitudeDeg: parsedLocation.longitudeDeg,
        notes,
        observationTimeUtc,
        solution,
        sourceImage,
        telescope,
        title,
      });
      setState({ entryId: entry.id, kind: "saved" });
    } catch (error) {
      setState({ kind: "error", message: journalFailureMessage(error) });
    }
  }

  return (
    <section
      aria-labelledby="identify-journal-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Browser-local journal
        </p>
        <h2 className="text-2xl font-semibold" id="identify-journal-heading">
          Save this solved observation
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Journal data stays in this browser. Lumina does not read EXIF time or location into the
          journal: date, place, equipment, conditions, and notes below are saved only from what you
          explicitly enter.
        </p>
        <p className="text-sm leading-6 text-[var(--muted)]">
          The journal keeps a bounded local snapshot of at most 100 unique loaded annotation labels,
          plus the normalized plate-solve calibration and WCS fingerprint. It never stores Nova
          provider job or submission identifiers.
        </p>
      </div>

      {state.kind === "saved" ? (
        <div className="space-y-3" role="status">
          <p className="font-semibold">Saved to this browser&apos;s local journal.</p>
          <p className="text-sm text-[var(--muted)]">
            Entry ID: <code>{state.entryId}</code>
          </p>
          <Link className="font-semibold text-[var(--link)] underline" href="/journal">
            Open Journal
          </Link>
        </div>
      ) : (
        <form className="grid gap-5 lg:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <label className="space-y-2 font-semibold lg:col-span-2">
            <span>Journal title</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: Andromeda wide-field test"
              required
              value={title}
            />
          </label>

          <label className="space-y-2 font-semibold">
            <span>Observation date and time (optional)</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              onChange={(event) => setObservationTime(event.target.value)}
              type="datetime-local"
              value={observationTime}
            />
            <span className="block text-xs font-normal leading-5 text-[var(--muted)]">
              Interpreted in this browser&apos;s current time zone and stored as UTC. Leave blank if
              you do not know it.
            </span>
          </label>

          <label className="space-y-2 font-semibold">
            <span>Location label (optional)</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              maxLength={120}
              onChange={(event) => setLocationLabel(event.target.value)}
              placeholder="Example: Back garden"
              value={locationLabel}
            />
          </label>

          <label className="space-y-2 font-semibold">
            <span>Latitude (optional)</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              inputMode="decimal"
              max="90"
              min="-90"
              onChange={(event) => setLatitude(event.target.value)}
              step="any"
              type="number"
              value={latitude}
            />
          </label>

          <label className="space-y-2 font-semibold">
            <span>Longitude (optional)</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              inputMode="decimal"
              max="180"
              min="-180"
              onChange={(event) => setLongitude(event.target.value)}
              step="any"
              type="number"
              value={longitude}
            />
          </label>

          <label className="space-y-2 font-semibold">
            <span>Telescope / optics (optional)</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              maxLength={140}
              onChange={(event) => setTelescope(event.target.value)}
              value={telescope}
            />
          </label>

          <label className="space-y-2 font-semibold">
            <span>Camera (optional)</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              maxLength={140}
              onChange={(event) => setCamera(event.target.value)}
              value={camera}
            />
          </label>

          <label className="space-y-2 font-semibold lg:col-span-2">
            <span>Conditions (optional)</span>
            <textarea
              className="min-h-24 w-full border border-[var(--border-strong)] bg-[var(--background)] p-3"
              maxLength={2_000}
              onChange={(event) => setConditions(event.target.value)}
              value={conditions}
            />
          </label>

          <label className="space-y-2 font-semibold lg:col-span-2">
            <span>Notes (optional)</span>
            <textarea
              className="min-h-32 w-full border border-[var(--border-strong)] bg-[var(--background)] p-3"
              maxLength={10_000}
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </label>

          <label className="flex min-h-11 items-start gap-3 lg:col-span-2">
            <input
              checked={attachImage}
              className="mt-1"
              disabled={sourceImage === null}
              onChange={(event) => setAttachImage(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>Keep a local copy of this image in the browser journal.</strong>
              <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
                Off by default. If enabled, Lumina stores a filename-free JPEG/PNG Blob in local
                IndexedDB; it is not uploaded again.
              </span>
            </span>
          </label>

          {state.kind === "error" ? (
            <p className="lg:col-span-2" role="alert">
              {state.message}
            </p>
          ) : null}

          <button
            className="min-h-11 justify-self-start border border-[var(--border-strong)] px-5 font-semibold disabled:opacity-50 lg:col-span-2"
            disabled={state.kind === "saving"}
            type="submit"
          >
            {state.kind === "saving" ? "Saving locally…" : "Save to local journal"}
          </button>
        </form>
      )}
    </section>
  );
}

type ParsedLocation =
  | Readonly<{ label: string; latitudeDeg: number | null; longitudeDeg: number | null; ok: true }>
  | Readonly<{ message: string; ok: false }>;

function parseLocation(
  labelValue: string,
  latitudeValue: string,
  longitudeValue: string,
): ParsedLocation {
  const label = labelValue.trim();
  const hasLatitude = latitudeValue.trim().length > 0;
  const hasLongitude = longitudeValue.trim().length > 0;
  if (!hasLatitude && !hasLongitude && label.length === 0) {
    return { label: "", latitudeDeg: null, longitudeDeg: null, ok: true };
  }
  if (label.length === 0)
    return { message: "Add a location label or clear the location fields.", ok: false };
  if (hasLatitude !== hasLongitude) {
    return {
      message: "Enter both latitude and longitude, or leave both coordinates blank.",
      ok: false,
    };
  }
  if (!hasLatitude) return { label, latitudeDeg: null, longitudeDeg: null, ok: true };
  const latitudeDeg = Number(latitudeValue);
  const longitudeDeg = Number(longitudeValue);
  if (
    !Number.isFinite(latitudeDeg) ||
    latitudeDeg < -90 ||
    latitudeDeg > 90 ||
    !Number.isFinite(longitudeDeg) ||
    longitudeDeg < -180 ||
    longitudeDeg > 180
  ) {
    return { message: "Latitude must be −90…90 and longitude −180…180.", ok: false };
  }
  return { label, latitudeDeg, longitudeDeg, ok: true };
}

function parseObservationTime(value: string): string | null {
  if (value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function journalFailureMessage(error: unknown): string {
  if (!(error instanceof IdentificationJournalSaveError)) {
    return "The local journal save failed. Nothing was intentionally uploaded or changed remotely.";
  }
  switch (error.reason) {
    case "entry-limit":
      return "The local journal has reached its entry limit. Remove entries before saving another.";
    case "attachment-limit":
    case "invalid-attachment":
      return "The journal entry could not retain that local image attachment.";
    case "storage-unavailable":
      return "This browser is not allowing IndexedDB journal storage right now.";
    case "attachment-rollback-failed":
      return "The image attachment failed and Lumina could not fully roll back the local journal operation. Review the Journal before retrying.";
    case "invalid-journal-input":
    case "invalid-entry":
      return "The journal fields could not be validated. Check the entered values and try again.";
    case "entry-not-found":
    case "storage-corrupted":
    case "storage-write-failed":
      return "The browser rejected the journal write. Nothing was changed on the remote solver.";
  }
}
