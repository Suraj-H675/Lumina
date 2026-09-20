"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";

import type { IdentificationSolutionResponse } from "@lumina/api-client";

import { formatLocaleNumber, formatMessageTemplate } from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { IdentifyMessages } from "../../lib/i18n/messages/types";
import { NOVA_SERVICE_SHORT_NAME } from "../../lib/identification/provider-display";
import {
  IdentificationJournalSaveError,
  saveIdentificationSolutionToJournal,
} from "../../lib/journal/identification";
import { MAX_JOURNAL_OBJECTS } from "../../lib/journal/model";

type JournalValidationReason =
  | "coordinatePairRequired"
  | "coordinatesInvalid"
  | "locationLabelRequired"
  | "solvedTimestampUnavailable"
  | "timeInvalid"
  | "titleRequired";

type JournalFailureReason =
  | "attachment"
  | "entryLimit"
  | "generic"
  | "invalidFields"
  | "rollbackFailed"
  | "storageUnavailable"
  | "writeRejected";

export function IdentifyJournalPanel({
  completedAt,
  locale,
  messages,
  solution,
  sourceImage,
}: Readonly<{
  completedAt: string | null;
  locale: PublishedLocale;
  messages: IdentifyMessages["journalPanel"];
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
    | Readonly<{ kind: "error"; reason: JournalValidationReason; source: "validation" }>
    | Readonly<{ kind: "error"; reason: JournalFailureReason; source: "failure" }>
  >({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (completedAt === null) {
      setState({ kind: "error", reason: "solvedTimestampUnavailable", source: "validation" });
      return;
    }
    const parsedLocation = parseLocation(locationLabel, latitude, longitude);
    if (!parsedLocation.ok) {
      setState({ kind: "error", reason: parsedLocation.reason, source: "validation" });
      return;
    }
    const observationTimeUtc = parseObservationTime(observationTime);
    if (observationTime.length > 0 && observationTimeUtc === null) {
      setState({ kind: "error", reason: "timeInvalid", source: "validation" });
      return;
    }
    if (title.trim().length === 0) {
      setState({ kind: "error", reason: "titleRequired", source: "validation" });
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
      setState({ kind: "error", reason: journalFailureReason(error), source: "failure" });
    }
  }

  return (
    <section
      aria-labelledby="identify-journal-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h2 className="text-2xl font-semibold" id="identify-journal-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
        <p className="text-sm leading-6 text-[var(--muted)]">
          {formatMessageTemplate(messages.snapshotDisclosure, {
            count: formatLocaleNumber(MAX_JOURNAL_OBJECTS, locale),
            service: NOVA_SERVICE_SHORT_NAME,
          })}
        </p>
      </div>

      {state.kind === "saved" ? (
        <div className="space-y-3" role="status">
          <p className="font-semibold">{messages.savedStatus}</p>
          <p className="text-sm text-[var(--muted)]">
            {messages.entryIdLabel} <code>{state.entryId}</code>
          </p>
          <Link className="font-semibold text-[var(--link)] underline" href="/journal">
            {messages.actions.openJournal}
          </Link>
        </div>
      ) : (
        <form className="grid gap-5 lg:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <label className="space-y-2 font-semibold lg:col-span-2">
            <span>{messages.fields.title}</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={messages.fields.titlePlaceholder}
              required
              value={title}
            />
          </label>

          <label className="space-y-2 font-semibold">
            <span>{messages.fields.observationTime}</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              onChange={(event) => setObservationTime(event.target.value)}
              type="datetime-local"
              value={observationTime}
            />
            <span className="block text-xs font-normal leading-5 text-[var(--muted)]">
              {messages.fields.observationTimeHelp}
            </span>
          </label>

          <label className="space-y-2 font-semibold">
            <span>{messages.fields.location}</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              maxLength={120}
              onChange={(event) => setLocationLabel(event.target.value)}
              placeholder={messages.fields.locationPlaceholder}
              value={locationLabel}
            />
          </label>

          <label className="space-y-2 font-semibold">
            <span>{messages.fields.latitude}</span>
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
            <span>{messages.fields.longitude}</span>
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
            <span>{messages.fields.telescope}</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              maxLength={140}
              onChange={(event) => setTelescope(event.target.value)}
              value={telescope}
            />
          </label>

          <label className="space-y-2 font-semibold">
            <span>{messages.fields.camera}</span>
            <input
              className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
              maxLength={140}
              onChange={(event) => setCamera(event.target.value)}
              value={camera}
            />
          </label>

          <label className="space-y-2 font-semibold lg:col-span-2">
            <span>{messages.fields.conditions}</span>
            <textarea
              className="min-h-24 w-full border border-[var(--border-strong)] bg-[var(--background)] p-3"
              maxLength={2_000}
              onChange={(event) => setConditions(event.target.value)}
              value={conditions}
            />
          </label>

          <label className="space-y-2 font-semibold lg:col-span-2">
            <span>{messages.fields.notes}</span>
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
              <strong>{messages.attachment.title}</strong>
              <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
                {messages.attachment.description}
              </span>
            </span>
          </label>

          {state.kind === "error" ? (
            <p className="lg:col-span-2" role="alert">
              {state.source === "validation"
                ? messages.validation[state.reason]
                : messages.failures[state.reason]}
            </p>
          ) : null}

          <button
            className="min-h-11 justify-self-start border border-[var(--border-strong)] px-5 font-semibold disabled:opacity-50 lg:col-span-2"
            disabled={state.kind === "saving"}
            type="submit"
          >
            {state.kind === "saving" ? messages.actions.saving : messages.actions.save}
          </button>
        </form>
      )}
    </section>
  );
}

type ParsedLocation =
  | Readonly<{ label: string; latitudeDeg: number | null; longitudeDeg: number | null; ok: true }>
  | Readonly<{
      ok: false;
      reason: "coordinatePairRequired" | "coordinatesInvalid" | "locationLabelRequired";
    }>;

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
  if (label.length === 0) return { ok: false, reason: "locationLabelRequired" };
  if (hasLatitude !== hasLongitude) {
    return { ok: false, reason: "coordinatePairRequired" };
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
    return { ok: false, reason: "coordinatesInvalid" };
  }
  return { label, latitudeDeg, longitudeDeg, ok: true };
}

function parseObservationTime(value: string): string | null {
  if (value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function journalFailureReason(error: unknown): JournalFailureReason {
  if (!(error instanceof IdentificationJournalSaveError)) return "generic";
  switch (error.reason) {
    case "entry-limit":
      return "entryLimit";
    case "attachment-limit":
    case "invalid-attachment":
      return "attachment";
    case "storage-unavailable":
      return "storageUnavailable";
    case "attachment-rollback-failed":
      return "rollbackFailed";
    case "invalid-journal-input":
    case "invalid-entry":
      return "invalidFields";
    case "entry-not-found":
    case "storage-corrupted":
    case "storage-write-failed":
      return "writeRejected";
  }
}
