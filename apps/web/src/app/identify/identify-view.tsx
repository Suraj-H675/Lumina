"use client";

import {
  createIdentificationSubmission,
  deleteIdentificationSubmission,
  identificationStatusEndpoint,
  requestEndpoint,
  type IdentificationCapabilitiesResponse,
  type IdentificationStatusResponse,
} from "@lumina/api-client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

type IdentifyViewProps = Readonly<{
  apiOrigin: string;
  capabilities: IdentificationCapabilitiesResponse;
}>;

type ActiveSubmission = Readonly<{
  jobId: string | null;
  solverType: "fake" | "nova";
  submissionId: string;
  status: IdentificationStatusResponse | null;
}>;

type UiState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "uploading" }>
  | Readonly<{ active: ActiveSubmission; kind: "active"; pollingWarning: boolean }>
  | Readonly<{ kind: "deleted" }>
  | Readonly<{ kind: "error"; message: string }>;

const TERMINAL = new Set(["succeeded", "unsolved", "failed", "dead_letter", "expired", "deleted"]);

export function IdentifyView({ apiOrigin, capabilities }: IdentifyViewProps) {
  const [consented, setConsented] = useState(false);
  const [state, setState] = useState<UiState>({ kind: "idle" });
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.kind !== "active") return;
    const current = state.active.status?.status;
    if (current !== undefined && TERMINAL.has(current)) return;

    const controller = new AbortController();
    let cancelled = false;
    const poll = async () => {
      const result = await requestEndpoint(
        apiOrigin,
        identificationStatusEndpoint(state.active.submissionId),
        { signal: controller.signal },
      );
      if (cancelled) return;
      if (result.kind === "ok") {
        setState({
          active: { ...state.active, status: result.data },
          kind: "active",
          pollingWarning: false,
        });
      } else if (
        result.kind !== "unavailable" ||
        result.reason !== "transport" ||
        !controller.signal.aborted
      ) {
        setState({ ...state, pollingWarning: true });
      }
    };
    const timer = window.setTimeout(() => void poll(), 1_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [apiOrigin, state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!consented) {
      setState({
        kind: "error",
        message: "Confirm the temporary private processing notice first.",
      });
      return;
    }
    if (file === undefined) {
      setState({ kind: "error", message: "Choose one JPEG or PNG image first." });
      return;
    }
    const accepted = capabilities.accepted_media_types ?? ["image/jpeg", "image/png"];
    if (!accepted.includes(file.type as "image/jpeg" | "image/png")) {
      setState({ kind: "error", message: "Choose a JPEG or PNG image." });
      return;
    }
    if (file.size > capabilities.max_bytes) {
      setState({
        kind: "error",
        message: "That image exceeds the current private-upload size limit.",
      });
      return;
    }

    setDeleteConfirm(false);
    setState({ kind: "uploading" });
    const result = await createIdentificationSubmission(apiOrigin, file, file.name, {
      consentRemoteProcessing: capabilities.remote_processing,
    });
    if (result.kind !== "ok") {
      setState({ kind: "error", message: uploadFailureMessage(result) });
      return;
    }
    setState({
      active: {
        jobId: result.data.job_id,
        solverType: result.data.solver_type,
        status: null,
        submissionId: result.data.submission_id,
      },
      kind: "active",
      pollingWarning: false,
    });
  }

  async function deleteActive() {
    if (state.kind !== "active") return;
    const result = await deleteIdentificationSubmission(apiOrigin, state.active.submissionId);
    if (result.kind !== "ok") {
      setState({ ...state, pollingWarning: true });
      return;
    }
    setDeleteConfirm(false);
    setConsented(false);
    if (fileRef.current !== null) fileRef.current.value = "";
    setState({ kind: "deleted" });
  }

  return (
    <div className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {capabilities.remote_processing
            ? "Identify · Phase 6B remote plate solving"
            : "Identify · Phase 6A infrastructure"}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Identify an astronomical image
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          {capabilities.remote_processing
            ? "Lumina can send one explicitly consented image to Astrometry.net Nova for private plate solving, then normalize the returned astrometric calibration, WCS, and annotations."
            : "This phase validates Lumina's private upload, job, retention, and deletion workflow. The solver is a deterministic fake fixture: it does not identify the sky and does not return astrometric coordinates."}
        </p>
      </header>

      <PrivacyNotice capabilities={capabilities} />

      <section
        aria-labelledby="identify-upload-heading"
        className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
      >
        <div className="max-w-3xl space-y-2">
          <h2 className="text-2xl font-semibold" id="identify-upload-heading">
            Upload one private image
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Filename and original bytes are temporary server-private data. They are never published
            in the status response.
          </p>
        </div>
        <form className="space-y-5" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2">
            <label className="block font-semibold" htmlFor="identify-file">
              JPEG or PNG image
            </label>
            <input
              accept={(capabilities.accepted_media_types ?? ["image/jpeg", "image/png"]).join(",")}
              className="block min-h-11 max-w-full"
              disabled={state.kind === "uploading" || state.kind === "active"}
              id="identify-file"
              name="file"
              ref={fileRef}
              type="file"
            />
            <p className="text-sm leading-6 text-[var(--muted)]">
              Current bound: {formatBytes(capabilities.max_bytes)} and{" "}
              {formatInteger(capabilities.max_pixels)} pixels; each dimension must be at least{" "}
              {capabilities.min_dimension_px ?? 32}px.
            </p>
          </div>

          <label className="flex max-w-4xl items-start gap-3 leading-6">
            <input
              checked={consented}
              className="mt-1 size-5 shrink-0"
              disabled={state.kind === "uploading" || state.kind === "active"}
              onChange={(event) => setConsented(event.target.checked)}
              type="checkbox"
            />
            <span>
              {capabilities.remote_processing
                ? "I explicitly consent to Lumina temporarily storing this image and sending its bytes to the third-party Astrometry.net Nova service for private plate solving. Deleting the submission below removes Lumina's local temporary copy and identifying metadata; remote deletion and retention remain subject to Astrometry.net's service limitations."
                : "I understand that Lumina will temporarily store and process this image on the server for this identification job. No remote Astrometry.net service is contacted in this mode, and I can delete the temporary submission below."}
            </span>
          </label>

          <button
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-5 font-semibold disabled:opacity-50"
            disabled={!consented || state.kind === "uploading" || state.kind === "active"}
            type="submit"
          >
            {state.kind === "uploading"
              ? capabilities.remote_processing
                ? "Uploading for remote solve…"
                : "Uploading privately…"
              : capabilities.remote_processing
                ? "Start remote plate solve"
                : "Start private infrastructure check"}
          </button>
        </form>
        <noscript>
          <p className="mt-4 border border-[var(--border)] p-4">
            JavaScript is required to upload, poll this temporary job, and request deletion. The
            privacy and retention policy above remains authoritative.
          </p>
        </noscript>
      </section>

      <StatusPanel
        deleteConfirm={deleteConfirm}
        remoteProcessing={capabilities.remote_processing}
        onCancelDelete={() => setDeleteConfirm(false)}
        onConfirmDelete={() => void deleteActive()}
        onRequestDelete={() => setDeleteConfirm(true)}
        state={state}
      />
    </div>
  );
}

function PrivacyNotice({
  capabilities,
}: Readonly<{ capabilities: IdentificationCapabilitiesResponse }>) {
  return (
    <section
      aria-labelledby="identify-privacy-heading"
      className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <h2 className="text-2xl font-semibold" id="identify-privacy-heading">
        {capabilities.remote_processing
          ? "Remote processing requires your consent"
          : "Private by design in this phase"}
      </h2>
      <ul className="list-disc space-y-2 pl-5 leading-7 text-[var(--muted)]">
        {capabilities.remote_processing ? (
          <>
            <li>
              The image is sent to Astrometry.net Nova only after explicit consent. Lumina keeps the
              provider API key and provider-side identifiers server-private.
            </li>
            <li>
              Lumina requests Nova&apos;s private visibility mode and disallows provider-side
              modification and commercial use for the submitted image.
            </li>
            <li>
              Deleting here removes Lumina&apos;s local temporary object and scrubs identifying
              local metadata. Astrometry.net controls any provider-side retention or deletion
              limitations.
            </li>
            <li>
              A remote solve can finish without finding an astrometric solution; Lumina reports that
              separately from processing failure.
            </li>
          </>
        ) : (
          <>
            <li>No remote plate-solving service is contacted; remote processing is disabled.</li>
            <li>
              Deletion removes the private object and scrubs filename/hash metadata from the
              temporary record.
            </li>
            <li>
              The fake solver verifies workflow integrity only; a success state is not a sky
              identification.
            </li>
          </>
        )}
        <li>
          {capabilities.remote_processing
            ? "The configured local retention period is"
            : "The configured retention period is"}{" "}
          {capabilities.retention_hours} hours. Terminal jobs are eligible for cleanup after the
          retention policy; abandoned uploads are also bounded.
        </li>
      </ul>
    </section>
  );
}

function StatusPanel({
  deleteConfirm,
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
  remoteProcessing,
  state,
}: Readonly<{
  deleteConfirm: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onRequestDelete: () => void;
  remoteProcessing: boolean;
  state: UiState;
}>) {
  if (state.kind === "idle") return null;
  if (state.kind === "uploading") {
    return (
      <StatusMessage
        title={remoteProcessing ? "Preparing remote plate solve" : "Uploading privately"}
      >
        {remoteProcessing
          ? "Validating the bounded image and creating a consented remote solve before provider processing begins."
          : "Validating and storing the bounded image before the fake job is queued."}
      </StatusMessage>
    );
  }
  if (state.kind === "deleted") {
    return (
      <StatusMessage title="Temporary submission deleted">
        The private object was removed and identifying metadata was scrubbed.
      </StatusMessage>
    );
  }
  if (state.kind === "error") {
    return (
      <StatusMessage alert title="Upload not started">
        {state.message}
      </StatusMessage>
    );
  }

  const status = state.active.status;
  return (
    <section
      aria-labelledby="identify-status-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Temporary job
        </p>
        <h2 className="text-2xl font-semibold" id="identify-status-heading">
          Identification infrastructure status
        </h2>
        {state.active.jobId === null ? (
          <p className="text-sm text-[var(--muted)]">
            Remote provider identifiers are kept private and are not exposed in this interface.
          </p>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Job ID: <code>{state.active.jobId}</code>
          </p>
        )}
      </div>
      {status === null ? (
        <p role="status">
          {state.active.solverType === "nova"
            ? "Submitting. Waiting for the first private remote-solve status update…"
            : "Queued. Waiting for the first private status update…"}
        </p>
      ) : (
        <div className="space-y-3">
          <p role="status">
            <strong>Status:</strong> {statusLabel(status.status, status.solver_type)}
          </p>
          {status.progress === null || status.progress === undefined ? null : (
            <p>
              <strong>Progress:</strong> {Math.round(status.progress * 100)}%
            </p>
          )}
          {status.status === "succeeded" ? (
            status.solver_type === "nova" ? (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="font-semibold">Astrometric solution available.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Lumina stored a normalized plate calibration, WCS, and bounded annotations. The
                  visual overlay is a separate presentation step; provider credentials and provider
                  identifiers remain private.
                </p>
              </div>
            ) : (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="font-semibold">Infrastructure check completed.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  The deterministic fake solver completed the private workflow. This is not an
                  astrometric solution and contains no RA/Dec, WCS, orientation, scale, or detected
                  objects.
                </p>
              </div>
            )
          ) : null}
          {status.status === "unsolved" ? (
            <p role="status">
              Astrometry.net completed processing without finding a plate solution. This is not the
              same as a processing failure.
            </p>
          ) : null}
          {status.status === "expired" ? (
            <p role="alert">
              The remote solve did not finish within Lumina&apos;s configured timeout.
            </p>
          ) : null}
          {status.status === "failed" || status.status === "dead_letter" ? (
            <p role="alert">
              {status.solver_type === "nova"
                ? "The remote plate-solving workflow could not complete safely."
                : "The fake identification job could not complete safely."}
            </p>
          ) : null}
        </div>
      )}
      {state.pollingWarning ? (
        <p role="alert" className="text-sm">
          The latest status or deletion request was temporarily unavailable. No private data was
          shown.
        </p>
      ) : null}
      <div className="space-y-3 border-t border-[var(--border)] pt-5">
        <p className="text-sm leading-6 text-[var(--muted)]">
          {state.active.solverType === "nova"
            ? "Local deletion is available before or after the remote solve finishes; it does not promise deletion from Astrometry.net."
            : "Deletion is available before or after the fake job finishes."}
        </p>
        {deleteConfirm ? (
          <div
            className="flex flex-wrap gap-3"
            role="group"
            aria-label="Confirm temporary submission deletion"
          >
            <button
              className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
              onClick={onConfirmDelete}
              type="button"
            >
              Confirm delete
            </button>
            <button
              className="min-h-11 px-4 font-semibold text-[var(--link)] underline"
              onClick={onCancelDelete}
              type="button"
            >
              Keep submission
            </button>
          </div>
        ) : (
          <button
            className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
            onClick={onRequestDelete}
            type="button"
          >
            Delete temporary upload
          </button>
        )}
      </div>
    </section>
  );
}

function StatusMessage({
  alert = false,
  children,
  title,
}: Readonly<{ alert?: boolean; children: React.ReactNode; title: string }>) {
  return (
    <section
      aria-label={title}
      className="space-y-2 border border-[var(--border)] p-5 sm:p-7"
      role={alert ? "alert" : "status"}
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="leading-7 text-[var(--muted)]">{children}</p>
    </section>
  );
}

function uploadFailureMessage(
  result: Awaited<ReturnType<typeof createIdentificationSubmission>>,
): string {
  if (result.kind === "http-error") {
    if (result.status === 413) return "That image exceeds the current private-upload size limit.";
    if (result.status === 415) return "The server accepted only a verified JPEG or PNG image.";
    if (result.status === 422)
      return "The image could not pass the private upload validation checks.";
  }
  if (result.kind === "unavailable" && result.reason === "timeout")
    return "The private upload timed out before Lumina could confirm it.";
  return "Image identification is temporarily unavailable. No successful upload was confirmed.";
}

function statusLabel(
  value: IdentificationStatusResponse["status"],
  solverType: IdentificationStatusResponse["solver_type"],
): string {
  if (value === "succeeded")
    return solverType === "fake" ? "Fake solver completed" : "Remote solver completed";
  const labels: Record<Exclude<IdentificationStatusResponse["status"], "succeeded">, string> = {
    created: "Created",
    queued: "Queued",
    running: "Running fake solver",
    submitting: "Submitting to remote solver",
    waiting_for_solver: "Waiting for remote solver",
    solving: "Remote solver running",
    fetching_results: "Fetching normalized results",
    unsolved: "No astrometric solution",
    failed: "Failed",
    dead_letter: "Stopped after bounded retries",
    expired: "Remote solve expired",
    deleted: "Deleted",
  };
  return labels[value];
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024)
    return `${(value / (1024 * 1024)).toLocaleString("en-US", { maximumFractionDigits: 1 })} MiB`;
  return `${Math.ceil(value / 1024).toLocaleString("en-US")} KiB`;
}

function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}
