"use client";

import {
  createIdentificationSubmission,
  deleteIdentificationSubmission,
  getIdentificationSolution,
  identificationStatusEndpoint,
  requestEndpoint,
  type IdentificationCapabilitiesResponse,
  type IdentificationSolutionResponse,
  type IdentificationStatusResponse,
} from "@lumina/api-client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { formatLocaleNumber, formatMessageTemplate } from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { IdentifyMessages } from "../../lib/i18n/messages/types";
import {
  ASTROMETRY_PROVIDER_NAME,
  NOVA_SERVICE_NAME,
} from "../../lib/identification/provider-display";
import { CaptureChecksPanel } from "./capture-checks-panel";
import { IdentifyJournalPanel } from "./identify-journal-panel";
import { SolutionOverlay } from "./solution-overlay";
import { SurveyComparisonPanel } from "./survey-comparison-panel";

type IdentifyViewProps = Readonly<{
  apiOrigin: string;
  capabilities: IdentificationCapabilitiesResponse;
  locale: PublishedLocale;
  messages: IdentifyMessages;
}>;

type UploadErrorReason =
  | "consentRequired"
  | "fileRequired"
  | "serverMediaOnly"
  | "sizeLimit"
  | "timeout"
  | "unavailable"
  | "unsupportedMedia"
  | "validationFailed";

type ActiveSubmission = Readonly<{
  jobId: string | null;
  previewUrl: string | null;
  solverType: "fake" | "nova";
  sourceImage: File | null;
  submissionId: string;
  status: IdentificationStatusResponse | null;
}>;

type SolutionUiState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{
      data: IdentificationSolutionResponse;
      kind: "ready";
      loadingMore: boolean;
      warning: boolean;
    }>
  | Readonly<{ kind: "error" }>;

type UiState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "uploading" }>
  | Readonly<{ active: ActiveSubmission; kind: "active"; pollingWarning: boolean }>
  | Readonly<{ kind: "deleted" }>
  | Readonly<{ kind: "error"; reason: UploadErrorReason }>;

const TERMINAL = new Set(["succeeded", "unsolved", "failed", "dead_letter", "expired", "deleted"]);

export function IdentifyView({ apiOrigin, capabilities, locale, messages }: IdentifyViewProps) {
  const [consented, setConsented] = useState(false);
  const [state, setState] = useState<UiState>({ kind: "idle" });
  const [solutionState, setSolutionState] = useState<SolutionUiState>({ kind: "idle" });
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current !== null) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

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
        let previewUrl = state.active.previewUrl;
        const terminalWithoutSolution =
          TERMINAL.has(result.data.status) &&
          !(result.data.status === "succeeded" && result.data.solution_available === true);
        if (previewUrl !== null && terminalWithoutSolution) {
          URL.revokeObjectURL(previewUrl);
          if (previewUrlRef.current === previewUrl) previewUrlRef.current = null;
          previewUrl = null;
        }
        setState({
          active: {
            ...state.active,
            previewUrl,
            sourceImage: terminalWithoutSolution ? null : state.active.sourceImage,
            status: result.data,
          },
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

  useEffect(() => {
    if (
      state.kind !== "active" ||
      state.active.solverType !== "nova" ||
      state.active.previewUrl === null ||
      state.active.status?.status !== "succeeded" ||
      state.active.status.solution_available !== true ||
      solutionState.kind !== "idle"
    ) {
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    void getIdentificationSolution(apiOrigin, state.active.submissionId, null, {
      signal: controller.signal,
    }).then((result) => {
      if (cancelled) return;
      if (result.kind === "ok" && result.data.submission_id === state.active.submissionId) {
        setSolutionState({ data: result.data, kind: "ready", loadingMore: false, warning: false });
      } else if (
        result.kind !== "unavailable" ||
        result.reason !== "transport" ||
        !controller.signal.aborted
      ) {
        setSolutionState({ kind: "error" });
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiOrigin, solutionState.kind, state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!consented) {
      setState({ kind: "error", reason: "consentRequired" });
      return;
    }
    if (file === undefined) {
      setState({ kind: "error", reason: "fileRequired" });
      return;
    }
    const accepted = capabilities.accepted_media_types ?? ["image/jpeg", "image/png"];
    if (!accepted.includes(file.type as "image/jpeg" | "image/png")) {
      setState({ kind: "error", reason: "unsupportedMedia" });
      return;
    }
    if (file.size > capabilities.max_bytes) {
      setState({ kind: "error", reason: "sizeLimit" });
      return;
    }

    setDeleteConfirm(false);
    setSolutionState({ kind: "idle" });
    if (previewUrlRef.current !== null) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setState({ kind: "uploading" });
    const result = await createIdentificationSubmission(apiOrigin, file, file.name, {
      consentRemoteProcessing: capabilities.remote_processing,
    });
    if (result.kind !== "ok") {
      setState({ kind: "error", reason: uploadFailureReason(result) });
      return;
    }
    const previewUrl = result.data.solver_type === "nova" ? URL.createObjectURL(file) : null;
    previewUrlRef.current = previewUrl;
    setState({
      active: {
        jobId: result.data.job_id,
        previewUrl,
        solverType: result.data.solver_type,
        sourceImage: result.data.solver_type === "nova" ? file : null,
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
    setSolutionState({ kind: "idle" });
    if (previewUrlRef.current !== null) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (fileRef.current !== null) fileRef.current.value = "";
    setState({ kind: "deleted" });
  }

  async function loadMoreAnnotations() {
    if (
      state.kind !== "active" ||
      solutionState.kind !== "ready" ||
      !solutionState.data.has_more ||
      solutionState.data.next_cursor === null ||
      solutionState.loadingMore
    ) {
      return;
    }
    const current = solutionState.data;
    const cursor = current.next_cursor;
    setSolutionState({ ...solutionState, loadingMore: true, warning: false });
    const result = await getIdentificationSolution(apiOrigin, state.active.submissionId, cursor);
    if (
      result.kind !== "ok" ||
      !sameSolutionIdentity(current, result.data) ||
      (result.data.has_more &&
        (result.data.next_cursor === null || result.data.next_cursor === cursor))
    ) {
      setSolutionState({ data: current, kind: "ready", loadingMore: false, warning: true });
      return;
    }
    setSolutionState({
      data: {
        ...result.data,
        annotations: [...current.annotations, ...result.data.annotations],
      },
      kind: "ready",
      loadingMore: false,
      warning: false,
    });
  }

  return (
    <div className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {capabilities.remote_processing
            ? messages.header.remoteEyebrow
            : messages.header.localEyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.header.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          {capabilities.remote_processing
            ? formatMessageTemplate(messages.header.remoteDescription, {
                service: NOVA_SERVICE_NAME,
              })
            : messages.header.localDescription}
        </p>
      </header>

      <PrivacyNotice capabilities={capabilities} locale={locale} messages={messages.privacy} />

      <section
        aria-labelledby="identify-upload-heading"
        className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
      >
        <div className="max-w-3xl space-y-2">
          <h2 className="text-2xl font-semibold" id="identify-upload-heading">
            {messages.upload.heading}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.upload.description}</p>
        </div>
        <form className="space-y-5" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2">
            <label className="block font-semibold" htmlFor="identify-file">
              {messages.upload.fileLabel}
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
              {formatMessageTemplate(messages.upload.bound, {
                maxBytes: formatBytes(capabilities.max_bytes, locale),
                maxPixels: formatLocaleNumber(capabilities.max_pixels, locale),
                minDimension: formatLocaleNumber(capabilities.min_dimension_px ?? 32, locale),
              })}
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
                ? formatMessageTemplate(messages.upload.consentRemote, {
                    provider: ASTROMETRY_PROVIDER_NAME,
                    service: NOVA_SERVICE_NAME,
                  })
                : formatMessageTemplate(messages.upload.consentLocal, {
                    provider: ASTROMETRY_PROVIDER_NAME,
                  })}
            </span>
          </label>

          <button
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-5 font-semibold disabled:opacity-50"
            disabled={!consented || state.kind === "uploading" || state.kind === "active"}
            type="submit"
          >
            {state.kind === "uploading"
              ? capabilities.remote_processing
                ? messages.upload.actions.uploadingRemote
                : messages.upload.actions.uploadingLocal
              : capabilities.remote_processing
                ? messages.upload.actions.startRemote
                : messages.upload.actions.startLocal}
          </button>
        </form>
        <noscript>
          <p className="mt-4 border border-[var(--border)] p-4">{messages.upload.noScript}</p>
        </noscript>
      </section>

      <StatusPanel
        deleteConfirm={deleteConfirm}
        locale={locale}
        messages={messages}
        remoteProcessing={capabilities.remote_processing}
        onCancelDelete={() => setDeleteConfirm(false)}
        onConfirmDelete={() => void deleteActive()}
        onRequestDelete={() => setDeleteConfirm(true)}
        state={state}
      />

      {state.kind === "active" &&
      state.active.solverType === "nova" &&
      state.active.status?.status === "succeeded" &&
      state.active.status.solution_available ? (
        solutionState.kind === "idle" ? (
          <StatusMessage title={messages.status.solution.loadingTitle}>
            {messages.status.solution.loadingDescription}
          </StatusMessage>
        ) : solutionState.kind === "error" ? (
          <StatusMessage alert title={messages.status.solution.unavailableTitle}>
            {messages.status.solution.unavailableDescription}
          </StatusMessage>
        ) : solutionState.kind === "ready" && state.active.previewUrl !== null ? (
          <>
            <SolutionOverlay
              completedAt={state.active.status.completed_at}
              imageUrl={state.active.previewUrl}
              locale={locale}
              loadingMore={solutionState.loadingMore}
              loadMoreWarning={solutionState.warning}
              messages={messages.solutionOverlay}
              onLoadMore={() => void loadMoreAnnotations()}
              solution={solutionState.data}
            />
            <CaptureChecksPanel
              locale={locale}
              messages={messages.captureChecks}
              sourceHeightPx={solutionState.data.wcs.image_height}
              sourceImage={state.active.sourceImage}
              sourceWidthPx={solutionState.data.wcs.image_width}
            />
            <SurveyComparisonPanel
              imageUrl={state.active.previewUrl}
              solution={solutionState.data}
            />
            <IdentifyJournalPanel
              completedAt={state.active.status.completed_at}
              solution={solutionState.data}
              sourceImage={state.active.sourceImage}
            />
          </>
        ) : null
      ) : null}
    </div>
  );
}

function PrivacyNotice({
  capabilities,
  locale,
  messages,
}: Readonly<{
  capabilities: IdentificationCapabilitiesResponse;
  locale: PublishedLocale;
  messages: IdentifyMessages["privacy"];
}>) {
  return (
    <section
      aria-labelledby="identify-privacy-heading"
      className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <h2 className="text-2xl font-semibold" id="identify-privacy-heading">
        {capabilities.remote_processing ? messages.remote.title : messages.local.title}
      </h2>
      <ul className="list-disc space-y-2 pl-5 leading-7 text-[var(--muted)]">
        {capabilities.remote_processing ? (
          <>
            <li>
              {formatMessageTemplate(messages.remote.sentToProvider, {
                service: NOVA_SERVICE_NAME,
              })}
            </li>
            <li>
              {formatMessageTemplate(messages.remote.privateMode, {
                service: NOVA_SERVICE_NAME,
              })}
            </li>
            <li>
              {formatMessageTemplate(messages.remote.deletion, {
                provider: ASTROMETRY_PROVIDER_NAME,
              })}
            </li>
            <li>{messages.remote.unsolved}</li>
          </>
        ) : (
          <>
            <li>{messages.local.noRemote}</li>
            <li>{messages.local.deletion}</li>
            <li>{messages.local.fakeSolver}</li>
          </>
        )}
        <li>
          {formatMessageTemplate(
            capabilities.remote_processing ? messages.retentionRemote : messages.retentionLocal,
            { hours: formatLocaleNumber(capabilities.retention_hours, locale) },
          )}
        </li>
      </ul>
    </section>
  );
}

function StatusPanel({
  deleteConfirm,
  locale,
  messages,
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
  remoteProcessing,
  state,
}: Readonly<{
  deleteConfirm: boolean;
  locale: PublishedLocale;
  messages: IdentifyMessages;
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
        title={
          remoteProcessing
            ? messages.status.uploading.remoteTitle
            : messages.status.uploading.localTitle
        }
      >
        {remoteProcessing
          ? messages.status.uploading.remoteDescription
          : messages.status.uploading.localDescription}
      </StatusMessage>
    );
  }
  if (state.kind === "deleted") {
    return (
      <StatusMessage title={messages.status.deleted.title}>
        {messages.status.deleted.description}
      </StatusMessage>
    );
  }
  if (state.kind === "error") {
    return (
      <StatusMessage alert title={messages.status.errorTitle}>
        {messages.upload.errors[state.reason]}
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
          {messages.status.eyebrow}
        </p>
        <h2 className="text-2xl font-semibold" id="identify-status-heading">
          {messages.status.heading}
        </h2>
        {state.active.jobId === null ? (
          <p className="text-sm text-[var(--muted)]">
            {messages.status.providerIdentifiersPrivate}
          </p>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            {messages.status.jobIdLabel} <code>{state.active.jobId}</code>
          </p>
        )}
      </div>
      {status === null ? (
        <p role="status">
          {state.active.solverType === "nova"
            ? messages.status.initialRemote
            : messages.status.initialLocal}
        </p>
      ) : (
        <div className="space-y-3">
          <p role="status">
            <strong>{messages.status.labels.statusLabel}</strong>{" "}
            {statusLabel(status.status, status.solver_type, messages.status.labels)}
          </p>
          {status.progress === null || status.progress === undefined ? null : (
            <p>
              <strong>{messages.status.labels.progressLabel}</strong>{" "}
              {formatLocaleNumber(status.progress, locale, {
                maximumFractionDigits: 0,
                style: "percent",
              })}
            </p>
          )}
          {status.solver_type === "nova" && status.remote_condition === "provider_unavailable" ? (
            <p role="status">
              {formatMessageTemplate(messages.status.remoteConditions.unavailable, {
                provider: ASTROMETRY_PROVIDER_NAME,
              })}
            </p>
          ) : null}
          {status.solver_type === "nova" &&
          status.remote_condition === "provider_busy" &&
          status.status !== "failed" ? (
            <p role="status">
              {formatMessageTemplate(messages.status.remoteConditions.busyRetry, {
                provider: ASTROMETRY_PROVIDER_NAME,
              })}
            </p>
          ) : null}
          {status.solver_type === "nova" &&
          status.remote_condition === "provider_busy" &&
          status.status === "failed" ? (
            <p role="alert">
              {formatMessageTemplate(messages.status.remoteConditions.busyFailed, {
                provider: ASTROMETRY_PROVIDER_NAME,
              })}
            </p>
          ) : null}
          {status.status === "succeeded" ? (
            status.solver_type === "nova" ? (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="font-semibold">{messages.status.results.remoteSuccessTitle}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {messages.status.results.remoteSuccessDescription}
                </p>
              </div>
            ) : (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="font-semibold">{messages.status.results.fakeSuccessTitle}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {messages.status.results.fakeSuccessDescription}
                </p>
              </div>
            )
          ) : null}
          {status.status === "unsolved" ? (
            <p role="status">
              {formatMessageTemplate(messages.status.results.unsolved, {
                provider: ASTROMETRY_PROVIDER_NAME,
              })}
            </p>
          ) : null}
          {status.status === "expired" ? (
            <p role="alert">{messages.status.results.expired}</p>
          ) : null}
          {(status.status === "failed" || status.status === "dead_letter") &&
          status.remote_condition !== "provider_busy" ? (
            <p role="alert">
              {status.solver_type === "nova"
                ? messages.status.results.remoteFailure
                : messages.status.results.fakeFailure}
            </p>
          ) : null}
        </div>
      )}
      {state.pollingWarning ? (
        <p role="alert" className="text-sm">
          {messages.status.pollingWarning}
        </p>
      ) : null}
      <div className="space-y-3 border-t border-[var(--border)] pt-5">
        <p className="text-sm leading-6 text-[var(--muted)]">
          {state.active.solverType === "nova"
            ? formatMessageTemplate(messages.status.deletion.remoteDescription, {
                provider: ASTROMETRY_PROVIDER_NAME,
              })
            : messages.status.deletion.localDescription}
        </p>
        {deleteConfirm ? (
          <div
            className="flex flex-wrap gap-3"
            role="group"
            aria-label={messages.status.deletion.confirmGroupLabel}
          >
            <button
              className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
              onClick={onConfirmDelete}
              type="button"
            >
              {messages.status.deletion.confirmDelete}
            </button>
            <button
              className="min-h-11 px-4 font-semibold text-[var(--link)] underline"
              onClick={onCancelDelete}
              type="button"
            >
              {messages.status.deletion.keepSubmission}
            </button>
          </div>
        ) : (
          <button
            className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
            onClick={onRequestDelete}
            type="button"
          >
            {messages.status.deletion.deleteUpload}
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

function uploadFailureReason(
  result: Awaited<ReturnType<typeof createIdentificationSubmission>>,
): UploadErrorReason {
  if (result.kind === "http-error") {
    if (result.status === 413) return "sizeLimit";
    if (result.status === 415) return "serverMediaOnly";
    if (result.status === 422) return "validationFailed";
  }
  if (result.kind === "unavailable" && result.reason === "timeout") return "timeout";
  return "unavailable";
}

function statusLabel(
  value: IdentificationStatusResponse["status"],
  solverType: IdentificationStatusResponse["solver_type"],
  labels: IdentifyMessages["status"]["labels"],
): string {
  if (value === "succeeded")
    return solverType === "fake" ? labels.fakeSucceeded : labels.remoteSucceeded;
  const mappedLabels: Record<
    Exclude<IdentificationStatusResponse["status"], "succeeded">,
    string
  > = {
    created: labels.stateCreated,
    queued: labels.stateQueued,
    running: labels.stateRunningFake,
    submitting: labels.stateSubmittingRemote,
    waiting_for_solver: labels.stateWaitingRemote,
    solving: labels.stateRemoteRunning,
    fetching_results: labels.stateFetchingResults,
    unsolved: labels.stateUnsolved,
    failed: labels.stateFailed,
    dead_letter: labels.stateDeadLetter,
    expired: labels.stateExpired,
    deleted: labels.stateDeleted,
  };
  return mappedLabels[value];
}

function sameSolutionIdentity(
  left: IdentificationSolutionResponse,
  right: IdentificationSolutionResponse,
): boolean {
  return (
    left.submission_id === right.submission_id &&
    left.solver_type === right.solver_type &&
    left.remote_processing === right.remote_processing &&
    left.solver_name === right.solver_name &&
    left.solver_version === right.solver_version &&
    left.calibration.center_ra_deg === right.calibration.center_ra_deg &&
    left.calibration.center_dec_deg === right.calibration.center_dec_deg &&
    left.calibration.orientation_deg === right.calibration.orientation_deg &&
    left.calibration.parity === right.calibration.parity &&
    left.calibration.pixel_scale_arcsec_per_pixel ===
      right.calibration.pixel_scale_arcsec_per_pixel &&
    left.calibration.radius_deg === right.calibration.radius_deg &&
    left.wcs.coordinate_frame === right.wcs.coordinate_frame &&
    left.wcs.header === right.wcs.header &&
    left.wcs.source_sha256 === right.wcs.source_sha256 &&
    left.wcs.image_width === right.wcs.image_width &&
    left.wcs.image_height === right.wcs.image_height
  );
}

function formatBytes(value: number, locale: PublishedLocale): string {
  if (value >= 1024 * 1024)
    return `${formatLocaleNumber(value / (1024 * 1024), locale, {
      maximumFractionDigits: 1,
    })} MiB`;
  return `${formatLocaleNumber(Math.ceil(value / 1024), locale)} KiB`;
}
