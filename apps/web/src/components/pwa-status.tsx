"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { formatLocaleDateTime } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { PwaStatusMessages } from "../lib/i18n/messages/types";
import {
  isCacheablePwaDocumentPath,
  LUMINA_PWA_METADATA_CACHE,
  luminaPwaConnectivityUrl,
  luminaPwaMetadataUrl,
} from "../lib/pwa-policy";

function subscribeConnectivity(onStoreChange: () => void): () => void {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function onlineSnapshot(): boolean {
  return navigator.onLine;
}

function serverOnlineSnapshot(): boolean {
  return true;
}

function canonicalCachedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) return null;
  return value;
}

async function readOfflineCopyTime(): Promise<string | null> {
  if (typeof window === "undefined" || !("caches" in window) || window.caches === undefined) {
    return null;
  }

  const url = new URL(window.location.href);
  if (url.search !== "" || !isCacheablePwaDocumentPath(url.pathname)) return null;

  try {
    const cache = await window.caches.open(LUMINA_PWA_METADATA_CACHE);
    const metadata = await cache.match(luminaPwaMetadataUrl(url.origin, url.pathname));
    if (metadata === undefined) return null;
    const payload: unknown = await metadata.json();
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    return canonicalCachedAt((payload as Record<string, unknown>).cachedAt);
  } catch {
    return null;
  }
}

async function readWorkerNetworkAvailability(): Promise<boolean | null> {
  if (typeof window === "undefined" || !("caches" in window) || window.caches === undefined) {
    return null;
  }

  try {
    const cache = await window.caches.open(LUMINA_PWA_METADATA_CACHE);
    const metadata = await cache.match(luminaPwaConnectivityUrl(window.location.origin));
    if (metadata === undefined) return null;
    const payload: unknown = await metadata.json();
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    if (typeof record.networkAvailable !== "boolean") return null;
    if (canonicalCachedAt(record.checkedAt) === null) return null;
    return record.networkAvailable;
  } catch {
    return null;
  }
}

function formatCachedAt(value: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(new Date(value), locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function splitPlaceholder(message: string, placeholder: string): readonly [string, string] {
  const token = `{${placeholder}}`;
  const index = message.indexOf(token);
  if (index < 0 || message.indexOf(token, index + token.length) >= 0) {
    throw new TypeError(`Localization message must contain exactly one ${token} placeholder.`);
  }
  return [message.slice(0, index), message.slice(index + token.length)];
}

type PwaStatusProps = Readonly<{
  locale: PublishedLocale;
  messages: PwaStatusMessages;
}>;

export function PwaStatus({ locale, messages }: PwaStatusProps) {
  const online = useSyncExternalStore(subscribeConnectivity, onlineSnapshot, serverOnlineSnapshot);
  const [offlineCopy, setOfflineCopy] = useState<Readonly<{
    cachedAt: string | null;
    url: string;
  }> | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [workerNetworkAvailable, setWorkerNetworkAvailable] = useState<boolean | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const updateRequested = useRef(false);

  const effectiveOnline = online && workerNetworkAvailable !== false;

  useEffect(() => {
    let cancelled = false;
    if (effectiveOnline) return;

    const requestedUrl = window.location.href;
    void readOfflineCopyTime().then((value) => {
      if (!cancelled) setOfflineCopy({ cachedAt: value, url: requestedUrl });
    });

    return () => {
      cancelled = true;
    };
  }, [effectiveOnline]);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof navigator === "undefined" ||
      navigator.serviceWorker === undefined
    ) {
      return;
    }

    const serviceWorker = navigator.serviceWorker;
    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;
    let observedInstalling: ServiceWorker | null = null;
    let installingStateListener: EventListener | null = null;

    const exposeWaitingWorker = (): void => {
      if (disposed || registration === null || serviceWorker.controller === null) return;
      if (registration.waiting !== null) setWaitingWorker(registration.waiting);
    };

    const watchInstallingWorker = (): void => {
      if (registration === null || registration.installing === null) return;
      if (observedInstalling !== null && installingStateListener !== null) {
        observedInstalling.removeEventListener("statechange", installingStateListener);
      }
      observedInstalling = registration.installing;
      installingStateListener = () => {
        if (observedInstalling?.state === "installed") exposeWaitingWorker();
      };
      observedInstalling.addEventListener("statechange", installingStateListener);
    };

    const handleUpdateFound = (): void => {
      watchInstallingWorker();
    };

    const handleControllerChange = (): void => {
      if (updateRequested.current) window.location.reload();
    };

    const handleWorkerMessage = (event: MessageEvent<unknown>): void => {
      if (typeof event.data !== "object" || event.data === null || Array.isArray(event.data))
        return;
      const data = event.data as Record<string, unknown>;
      if (data.type !== "LUMINA_NETWORK_STATE" || typeof data.networkAvailable !== "boolean") {
        return;
      }
      if (canonicalCachedAt(data.checkedAt) === null) return;
      setWorkerNetworkAvailable(data.networkAvailable);
    };

    serviceWorker.addEventListener("controllerchange", handleControllerChange);
    serviceWorker.addEventListener("message", handleWorkerMessage);
    void readWorkerNetworkAvailability().then((value) => {
      if (!disposed && value !== null) setWorkerNetworkAvailable(value);
    });
    void serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((nextRegistration) => {
        if (disposed) return;
        registration = nextRegistration;
        exposeWaitingWorker();
        registration.addEventListener("updatefound", handleUpdateFound);
        watchInstallingWorker();
      })
      .catch(() => {
        // PWA support is progressive enhancement; the web application remains usable without it.
      });

    return () => {
      disposed = true;
      serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      serviceWorker.removeEventListener("message", handleWorkerMessage);
      registration?.removeEventListener("updatefound", handleUpdateFound);
      if (observedInstalling !== null && installingStateListener !== null) {
        observedInstalling.removeEventListener("statechange", installingStateListener);
      }
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (waitingWorker === null || applyingUpdate) return;
    updateRequested.current = true;
    setApplyingUpdate(true);
    waitingWorker.postMessage({ type: "LUMINA_ACTIVATE_UPDATE" });
  }, [applyingUpdate, waitingWorker]);

  if (effectiveOnline && waitingWorker === null) return null;

  const cachedAt =
    !effectiveOnline && typeof window !== "undefined" && offlineCopy?.url === window.location.href
      ? offlineCopy.cachedAt
      : null;
  const cachedNoticeParts =
    cachedAt === null ? null : splitPlaceholder(messages.offlineCopyNotice, "cachedAt");

  return (
    <div className="border-b border-[var(--border)] bg-[var(--background-raised)]">
      <div className="mx-auto grid w-full max-w-[var(--content-width)] gap-2 px-4 py-3 text-sm sm:px-6">
        {!effectiveOnline ? (
          <div className="leading-6 text-[var(--foreground)]" role="status">
            <p className="font-semibold">{messages.offlineTitle}</p>
            {cachedAt !== null && cachedNoticeParts !== null ? (
              <p className="text-[var(--muted)]">
                {cachedNoticeParts[0]}
                <time dateTime={cachedAt}>{formatCachedAt(cachedAt, locale)}</time>
                {cachedNoticeParts[1]}
              </p>
            ) : (
              <p className="text-[var(--muted)]">{messages.offlineNotice}</p>
            )}
          </div>
        ) : null}

        {waitingWorker !== null ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 leading-6 text-[var(--foreground)]"
            role="status"
          >
            <p>
              <span className="font-semibold">{messages.updateTitle}</span>{" "}
              <span className="text-[var(--muted)]">{messages.updateHelp}</span>
            </p>
            <button
              className="min-h-11 border border-[var(--border-strong)] bg-[var(--surface)] px-4 font-semibold disabled:cursor-wait disabled:opacity-70"
              disabled={applyingUpdate}
              onClick={applyUpdate}
              type="button"
            >
              {applyingUpdate ? messages.applyingUpdate : messages.applyUpdate}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
