import { LUMINA_PWA_CACHE_PREFIX } from "./pwa-policy";

export type ApproximateBrowserStorage =
  | Readonly<{ kind: "available"; quotaBytes: number; usageBytes: number }>
  | Readonly<{ kind: "unsupported" | "unavailable" }>;

export type PwaStorageFailureReason = "cache-unavailable" | "cache-clear-failed";

export class PwaStorageError extends Error {
  readonly reason: PwaStorageFailureReason;

  constructor(reason: PwaStorageFailureReason) {
    super("Lumina offline-copy storage is unavailable or could not be cleared.");
    this.name = "PwaStorageError";
    this.reason = reason;
  }
}

export async function clearLuminaOfflineCopies(): Promise<Readonly<{ deleted: number }>> {
  if (typeof caches === "undefined") throw new PwaStorageError("cache-unavailable");

  let names: string[];
  try {
    names = await caches.keys();
  } catch {
    throw new PwaStorageError("cache-unavailable");
  }

  const luminaNames = names.filter((name) => name.startsWith(LUMINA_PWA_CACHE_PREFIX));
  try {
    const outcomes = await Promise.all(luminaNames.map((name) => caches.delete(name)));
    if (outcomes.some((deleted) => !deleted)) throw new PwaStorageError("cache-clear-failed");
    return { deleted: luminaNames.length };
  } catch (error) {
    if (error instanceof PwaStorageError) throw error;
    throw new PwaStorageError("cache-clear-failed");
  }
}

export async function readApproximateBrowserStorage(): Promise<ApproximateBrowserStorage> {
  if (
    typeof navigator === "undefined" ||
    navigator.storage === undefined ||
    typeof navigator.storage.estimate !== "function"
  ) {
    return { kind: "unsupported" };
  }

  try {
    const estimate = await navigator.storage.estimate();
    if (
      typeof estimate.usage !== "number" ||
      !Number.isFinite(estimate.usage) ||
      estimate.usage < 0 ||
      typeof estimate.quota !== "number" ||
      !Number.isFinite(estimate.quota) ||
      estimate.quota <= 0
    ) {
      return { kind: "unavailable" };
    }
    return {
      kind: "available",
      quotaBytes: estimate.quota,
      usageBytes: estimate.usage,
    };
  } catch {
    return { kind: "unavailable" };
  }
}
