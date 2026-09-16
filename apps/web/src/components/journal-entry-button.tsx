"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { saveCatalogObservationToJournal } from "../lib/journal/catalog";
import { JournalStorageError } from "../lib/journal/database";
import type { ConfirmedJournalLocation } from "../lib/journal/model";
import { ModalDialog } from "./modal-dialog";

type PlannerJournalContext = Readonly<{
  latitudeDeg: number;
  longitudeDeg: number;
  selectedTimeUtc: string;
}>;

type JournalEntryButtonProps = Readonly<{
  entityId: string;
  objectName: string;
  plannerContext?: PlannerJournalContext;
}>;

type ParsedLocation =
  | Readonly<{ location: ConfirmedJournalLocation | null; ok: true }>
  | Readonly<{ message: string; ok: false }>;

const inputClassName =
  "min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]";
const actionClassName =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] disabled:cursor-wait disabled:opacity-60";

function localDateTimeValue(utc: string): string {
  const instant = new Date(utc);
  if (Number.isNaN(instant.getTime())) return "";
  const local = new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function observationTimeUtc(value: string): string | null {
  if (value.trim().length === 0) return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

function parseLocation(
  labelValue: string,
  latitudeValue: string,
  longitudeValue: string,
): ParsedLocation {
  const label = labelValue.trim();
  const hasLatitude = latitudeValue.trim().length > 0;
  const hasLongitude = longitudeValue.trim().length > 0;
  if (!hasLatitude && !hasLongitude && label.length === 0) return { location: null, ok: true };
  if (label.length === 0) {
    return { message: "Add a location label or clear the location fields.", ok: false };
  }
  if (hasLatitude !== hasLongitude) {
    return { message: "Enter both latitude and longitude, or leave both blank.", ok: false };
  }
  if (!hasLatitude) {
    return {
      location: {
        confirmed_by_user: true,
        label,
        latitude_deg: null,
        longitude_deg: null,
      },
      ok: true,
    };
  }
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return { message: "Latitude must be −90…90 and longitude −180…180.", ok: false };
  }
  return {
    location: {
      confirmed_by_user: true,
      label,
      latitude_deg: latitude,
      longitude_deg: longitude,
    },
    ok: true,
  };
}

function storageFailureMessage(error: unknown): string {
  if (!(error instanceof JournalStorageError)) {
    return "The local journal save failed. Nothing was uploaded or changed remotely.";
  }
  if (error.reason === "entry-limit") {
    return "The local journal has reached its entry limit. Remove an entry before saving another.";
  }
  if (error.reason === "storage-unavailable") {
    return "This browser is not allowing IndexedDB journal storage right now.";
  }
  if (error.reason === "invalid-entry") {
    return "The journal fields could not be validated. Check them and try again.";
  }
  return "The browser rejected the local journal write. Nothing was uploaded remotely.";
}

export function JournalEntryButton({
  entityId,
  objectName,
  plannerContext,
}: JournalEntryButtonProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<
    | Readonly<{ kind: "idle" }>
    | Readonly<{ kind: "saving" }>
    | Readonly<{ entryId: string; kind: "saved" }>
    | Readonly<{ kind: "error"; message: string }>
  >({ kind: "idle" });

  function close() {
    setOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length === 0) {
      setState({ kind: "error", message: "Give this journal entry a title." });
      return;
    }
    const timeUtc = observationTimeUtc(observedAt);
    if (observedAt.length > 0 && timeUtc === null) {
      setState({
        kind: "error",
        message: "Enter a valid observation date and time, or leave it blank.",
      });
      return;
    }
    const parsedLocation = parseLocation(locationLabel, latitude, longitude);
    if (!parsedLocation.ok) {
      setState({ kind: "error", message: parsedLocation.message });
      return;
    }
    setState({ kind: "saving" });
    try {
      const entry = await saveCatalogObservationToJournal({
        entityId,
        location: parsedLocation.location,
        notes,
        objectName,
        observationTimeUtc: timeUtc,
        title,
      });
      setState({ entryId: entry.id, kind: "saved" });
    } catch (error) {
      setState({ kind: "error", message: storageFailureMessage(error) });
    }
  }

  return (
    <>
      <button className={actionClassName} onClick={() => setOpen(true)} type="button">
        <span aria-hidden="true">✎</span> Add to journal
      </button>
      {open ? (
        <ModalDialog
          description={`Create a browser-local observation entry for ${objectName}. Time and location are saved only from fields you explicitly confirm here.`}
          onClose={close}
          open
          title="Create journal entry"
        >
          {state.kind === "saved" ? (
            <div className="space-y-4" role="status">
              <p className="font-semibold">Saved to this browser&apos;s local journal.</p>
              <Link className="font-semibold text-[var(--link)] underline" href="/journal">
                Open Journal
              </Link>
              <button className={actionClassName} onClick={close} type="button">
                Done
              </button>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={(event) => void submit(event)}>
              <p className="text-sm leading-6 text-[var(--muted)]">
                The catalogue object is recorded as a local reference. Lumina does not infer when or
                where you observed it.
              </p>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Journal title</span>
                <input
                  className={inputClassName}
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={`${objectName} observation`}
                  required
                  value={title}
                />
              </label>
              <div className="space-y-2">
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>Observation date and time (optional)</span>
                  <input
                    className={inputClassName}
                    onChange={(event) => setObservedAt(event.target.value)}
                    type="datetime-local"
                    value={observedAt}
                  />
                </label>
                {plannerContext !== undefined ? (
                  <button
                    className={actionClassName}
                    onClick={() =>
                      setObservedAt(localDateTimeValue(plannerContext.selectedTimeUtc))
                    }
                    type="button"
                  >
                    Use selected planner time
                  </button>
                ) : null}
                <p className="text-xs leading-5 text-[var(--muted)]">
                  Stored as UTC only after you save this form. Leave blank if the observation time
                  is unknown.
                </p>
              </div>
              <fieldset className="space-y-3 rounded-md border border-[var(--border)] p-4">
                <legend className="px-1 text-sm font-semibold">Location (optional)</legend>
                {plannerContext !== undefined ? (
                  <div className="space-y-2">
                    <button
                      className={actionClassName}
                      onClick={() => {
                        setLatitude(String(plannerContext.latitudeDeg));
                        setLongitude(String(plannerContext.longitudeDeg));
                        if (locationLabel.trim().length === 0)
                          setLocationLabel("Planner coordinates");
                      }}
                      type="button"
                    >
                      Use planner coordinates
                    </button>
                    <p className="text-xs leading-5 text-[var(--muted)]">
                      Exact planner coordinates are not copied into the journal unless you choose
                      this action and then save the form.
                    </p>
                  </div>
                ) : null}
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>Location label</span>
                  <input
                    className={inputClassName}
                    maxLength={120}
                    onChange={(event) => setLocationLabel(event.target.value)}
                    placeholder="Example: Back garden"
                    value={locationLabel}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span>Latitude</span>
                    <input
                      className={inputClassName}
                      inputMode="decimal"
                      max="90"
                      min="-90"
                      onChange={(event) => setLatitude(event.target.value)}
                      step="any"
                      type="number"
                      value={latitude}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span>Longitude</span>
                    <input
                      className={inputClassName}
                      inputMode="decimal"
                      max="180"
                      min="-180"
                      onChange={(event) => setLongitude(event.target.value)}
                      step="any"
                      type="number"
                      value={longitude}
                    />
                  </label>
                </div>
              </fieldset>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Notes (optional)</span>
                <textarea
                  className={`${inputClassName} min-h-28 py-3`}
                  maxLength={10_000}
                  onChange={(event) => setNotes(event.target.value)}
                  value={notes}
                />
              </label>
              {state.kind === "error" ? <p role="alert">{state.message}</p> : null}
              <div className="flex flex-wrap gap-3">
                <button
                  className={actionClassName}
                  disabled={state.kind === "saving"}
                  type="submit"
                >
                  {state.kind === "saving" ? "Saving locally…" : "Save to local journal"}
                </button>
                <button className={actionClassName} onClick={close} type="button">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </ModalDialog>
      ) : null}
    </>
  );
}
