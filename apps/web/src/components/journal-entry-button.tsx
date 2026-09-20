"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { formatMessageTemplate } from "../lib/i18n/format";
import type { JournalEntryMessages } from "../lib/i18n/messages/types";
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
  messages: JournalEntryMessages;
  objectName: string;
  plannerContext?: PlannerJournalContext;
}>;

type LocationValidationReason =
  "coordinate-pair-required" | "coordinates-invalid" | "location-label-required";

type ParsedLocation =
  | Readonly<{ location: ConfirmedJournalLocation | null; ok: true }>
  | Readonly<{ ok: false; reason: LocationValidationReason }>;

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
    return { ok: false, reason: "location-label-required" };
  }
  if (hasLatitude !== hasLongitude) {
    return { ok: false, reason: "coordinate-pair-required" };
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
    return { ok: false, reason: "coordinates-invalid" };
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

function locationValidationMessage(
  reason: LocationValidationReason,
  messages: JournalEntryMessages["validation"],
): string {
  if (reason === "location-label-required") return messages.locationLabelRequired;
  if (reason === "coordinate-pair-required") return messages.coordinatePairRequired;
  return messages.coordinatesInvalid;
}

function storageFailureMessage(error: unknown, messages: JournalEntryMessages["failures"]): string {
  if (!(error instanceof JournalStorageError)) {
    return messages.generic;
  }
  if (error.reason === "entry-limit") {
    return messages.entryLimit;
  }
  if (error.reason === "storage-unavailable") {
    return messages.storageUnavailable;
  }
  if (error.reason === "invalid-entry") {
    return messages.invalidEntry;
  }
  return messages.writeRejected;
}

export function JournalEntryButton({
  entityId,
  messages,
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
      setState({ kind: "error", message: messages.validation.titleRequired });
      return;
    }
    const timeUtc = observationTimeUtc(observedAt);
    if (observedAt.length > 0 && timeUtc === null) {
      setState({
        kind: "error",
        message: messages.validation.timeInvalid,
      });
      return;
    }
    const parsedLocation = parseLocation(locationLabel, latitude, longitude);
    if (!parsedLocation.ok) {
      setState({
        kind: "error",
        message: locationValidationMessage(parsedLocation.reason, messages.validation),
      });
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
      setState({ kind: "error", message: storageFailureMessage(error, messages.failures) });
    }
  }

  return (
    <>
      <button className={actionClassName} onClick={() => setOpen(true)} type="button">
        <span aria-hidden="true">✎</span> {messages.addAction}
      </button>
      {open ? (
        <ModalDialog
          description={formatMessageTemplate(messages.description, { objectName })}
          onClose={close}
          open
          title={messages.dialogTitle}
        >
          {state.kind === "saved" ? (
            <div className="space-y-4" role="status">
              <p className="font-semibold">{messages.savedStatus}</p>
              <Link className="font-semibold text-[var(--link)] underline" href="/journal">
                {messages.openJournal}
              </Link>
              <button className={actionClassName} onClick={close} type="button">
                {messages.doneAction}
              </button>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={(event) => void submit(event)}>
              <p className="text-sm leading-6 text-[var(--muted)]">{messages.form.intro}</p>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>{messages.form.titleLabel}</span>
                <input
                  className={inputClassName}
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={formatMessageTemplate(messages.form.titlePlaceholder, {
                    objectName,
                  })}
                  required
                  value={title}
                />
              </label>
              <div className="space-y-2">
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>{messages.form.observationTimeLabel}</span>
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
                    {messages.form.usePlannerTime}
                  </button>
                ) : null}
                <p className="text-xs leading-5 text-[var(--muted)]">{messages.form.timeHelp}</p>
              </div>
              <fieldset className="space-y-3 rounded-md border border-[var(--border)] p-4">
                <legend className="px-1 text-sm font-semibold">
                  {messages.form.locationLegend}
                </legend>
                {plannerContext !== undefined ? (
                  <div className="space-y-2">
                    <button
                      className={actionClassName}
                      onClick={() => {
                        setLatitude(String(plannerContext.latitudeDeg));
                        setLongitude(String(plannerContext.longitudeDeg));
                        if (locationLabel.trim().length === 0)
                          setLocationLabel(messages.form.plannerLocationLabel);
                      }}
                      type="button"
                    >
                      {messages.form.usePlannerCoordinates}
                    </button>
                    <p className="text-xs leading-5 text-[var(--muted)]">
                      {messages.form.plannerCoordinatesHelp}
                    </p>
                  </div>
                ) : null}
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>{messages.form.locationLabel}</span>
                  <input
                    className={inputClassName}
                    maxLength={120}
                    onChange={(event) => setLocationLabel(event.target.value)}
                    placeholder={messages.form.locationPlaceholder}
                    value={locationLabel}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm font-medium">
                    <span>{messages.form.latitudeLabel}</span>
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
                    <span>{messages.form.longitudeLabel}</span>
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
                <span>{messages.form.notesLabel}</span>
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
                  {state.kind === "saving" ? messages.form.savingAction : messages.form.saveAction}
                </button>
                <button className={actionClassName} onClick={close} type="button">
                  {messages.cancelAction}
                </button>
              </div>
            </form>
          )}
        </ModalDialog>
      ) : null}
    </>
  );
}
