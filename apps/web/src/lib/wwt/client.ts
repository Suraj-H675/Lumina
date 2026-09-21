import type { WWTInstance } from "@wwtelescope/engine-helpers";

import {
  ATLAS_DEFAULT_FIELD_OF_VIEW_DEG,
  WWT_FREESTANDING_ASSET_BASE,
  WWT_LAYER_COLLECTION_PATH,
  atlasLayerById,
  degreesToRadians,
  validateAtlasObserver,
  validateFieldOfViewDeg,
  type AtlasLayerId,
  type AtlasObserver,
} from "./atlas";
import { createAtlasRenderLoop, type AtlasRenderLoop } from "./render-loop";

const ATLAS_ELEMENT_ID = "lumina-wwt-atlas";
const INITIALIZATION_TIMEOUT_MS = 10_000;
const CAMERA_MOVE_TIMEOUT_MS = 5_000;
const SURVEY_PROBE_TIMEOUT_MS = 5_000;
const ATLAS_MAX_BACKING_STORE_RATIO = 1;

export type WwtAtlasStatusCallbacks = Readonly<{
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onRenderFailed?: () => void;
}>;

export type WwtAtlasFocus = Readonly<{
  declinationDegrees: number;
  fieldOfViewDegrees?: number;
  reducedMotion: boolean;
  rightAscensionDegrees: number;
}>;

export type WwtAtlasSession = Readonly<{
  detach: () => void;
  focus: (target: WwtAtlasFocus) => Promise<void>;
  pan: (horizontalPixels: number, verticalPixels: number) => void;
  setLayer: (layerId: AtlasLayerId) => void;
  setLocalHorizon: (enabled: boolean) => void;
  setObserver: (observer: AtlasObserver) => void;
  setTime: (instant: Date) => void;
  syncTimeNow: () => void;
  zoom: (factor: number) => void;
}>;

type WwtRuntime = Readonly<{
  canvas: HTMLCanvasElement;
  instance: WWTInstance;
}>;

let runtimePromise: Promise<WwtRuntime> | null = null;
let runtimeFailed = false;
let sessionActive = false;

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("WWT operation timed out")),
      milliseconds,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("WWT operation failed"));
      },
    );
  });
}

export async function probeAtlasLayerAvailability(layerId: AtlasLayerId): Promise<boolean> {
  const layer = atlasLayerById(layerId);
  if (layer === null) throw new RangeError("Atlas layer is invalid");

  const probeUrl = new URL(layer.availabilityProbeUrl);
  if (probeUrl.protocol !== "https:" || !layer.runtimeHosts.includes(probeUrl.hostname)) {
    throw new Error("Atlas survey probe host is not approved");
  }

  return await new Promise<boolean>((resolve) => {
    const image = new Image();
    let settled = false;
    const settle = (available: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      resolve(available);
    };
    const onLoad = () => settle(true);
    const onError = () => settle(false);
    const timer = window.setTimeout(() => settle(false), SURVEY_PROBE_TIMEOUT_MS);

    image.crossOrigin = "anonymous";
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
    image.src = layer.availabilityProbeUrl;
  });
}

export function supportsWebGL(
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): boolean {
  try {
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function requireContainer(container: HTMLElement): void {
  if (container.id !== ATLAS_ELEMENT_ID) {
    throw new Error("WWT atlas container identity is invalid");
  }
}

function enforcePinnedFreestandingControl(control: unknown): void {
  if (
    typeof control !== "object" ||
    control === null ||
    !("freestandingMode" in control) ||
    typeof control.freestandingMode !== "boolean"
  ) {
    throw new Error("Pinned WWT freestanding compatibility boundary is unavailable");
  }
  control.freestandingMode = true;
}

function capCanvasBackingStore(canvas: HTMLCanvasElement, container: HTMLElement): void {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width <= 0 || height <= 0) return;
  const maximumWidth = Math.floor(width * ATLAS_MAX_BACKING_STORE_RATIO);
  const maximumHeight = Math.floor(height * ATLAS_MAX_BACKING_STORE_RATIO);
  if (canvas.width > maximumWidth) canvas.width = maximumWidth;
  if (canvas.height > maximumHeight) canvas.height = maximumHeight;
}

function visualIntersectsViewport(container: HTMLElement): boolean {
  const rect = container.getBoundingClientRect();
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

function observeAtlasVisibility(container: HTMLElement, loop: AtlasRenderLoop): () => void {
  loop.setVisualVisible(false);
  if (typeof IntersectionObserver !== "function") {
    const update = () => loop.setVisualVisible(visualIntersectsViewport(container));
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }

  const observer = new IntersectionObserver((entries) => {
    const entry = entries.find((candidate) => candidate.target === container);
    if (entry === undefined) return;
    loop.setVisualVisible(entry.isIntersecting && entry.intersectionRatio > 0);
  });
  observer.observe(container);
  return () => observer.disconnect();
}

async function createRuntime(container: HTMLElement): Promise<WwtRuntime> {
  const [{ WWTControl }, { WWTInstance }] = await Promise.all([
    import("@wwtelescope/engine"),
    import("@wwtelescope/engine-helpers"),
  ]);
  // WWT 7.40.0's builder sets the module-global freestanding flag, while setup()
  // still consults this singleton field before deciding whether to load its core
  // ImageSets6 catalogue. Keep both gates aligned before construction; fail closed
  // if the pinned runtime shape changes rather than silently enabling core APIs.
  enforcePinnedFreestandingControl(WWTControl.singleton);
  const instance = new WWTInstance({
    elId: ATLAS_ELEMENT_ID,
    freestandingAssetBaseurl: WWT_FREESTANDING_ASSET_BASE,
    startInternalRenderLoop: false,
  });
  await withTimeout(instance.waitForReady(), INITIALIZATION_TIMEOUT_MS);
  const canvas = container.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("WWT did not create a canvas");
  capCanvasBackingStore(canvas, container);
  const collectionUrl = new URL(WWT_LAYER_COLLECTION_PATH, window.location.origin).href;
  await withTimeout(instance.loadImageCollection(collectionUrl, false), INITIALIZATION_TIMEOUT_MS);
  return { canvas, instance };
}

async function runtimeFor(container: HTMLElement): Promise<WwtRuntime> {
  if (runtimeFailed) throw new Error("WWT initialization previously failed");
  if (runtimePromise === null) {
    runtimePromise = createRuntime(container).catch((error: unknown) => {
      runtimeFailed = true;
      throw error;
    });
  }
  const runtime = await runtimePromise;
  if (runtime.canvas.parentElement !== container) container.append(runtime.canvas);
  capCanvasBackingStore(runtime.canvas, container);
  return runtime;
}

function applyObserver(instance: WWTInstance, observer: AtlasObserver): void {
  const valid = validateAtlasObserver(observer);
  if (valid === null) throw new RangeError("Observer location is invalid");
  instance.applySetting(["locationLat", valid.latitude]);
  instance.applySetting(["locationLng", valid.longitude]);
  instance.applySetting(["locationAltitude", valid.elevationM]);
}

export async function attachWwtAtlas(
  container: HTMLElement,
  callbacks: WwtAtlasStatusCallbacks = {},
): Promise<WwtAtlasSession> {
  requireContainer(container);
  if (!supportsWebGL()) throw new Error("WebGL is unavailable");
  if (sessionActive) throw new Error("A WWT atlas session is already active");
  sessionActive = true;

  let runtime: WwtRuntime;
  try {
    runtime = await runtimeFor(container);
  } catch (error) {
    sessionActive = false;
    throw error;
  }

  let contextLost = false;
  let detached = false;
  let loop: AtlasRenderLoop | null = null;
  let stopObservingVisibility: () => void = () => undefined;

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    loop?.stop();
    callbacks.onContextLost?.();
  };
  const onContextRestored = () => {
    if (detached) return;
    contextLost = false;
    callbacks.onContextRestored?.();
    loop?.start();
  };
  const detach = () => {
    if (detached) return;
    detached = true;
    loop?.dispose();
    stopObservingVisibility();
    runtime.canvas.removeEventListener("webglcontextlost", onContextLost);
    runtime.canvas.removeEventListener("webglcontextrestored", onContextRestored);
    runtime.canvas.remove();
    sessionActive = false;
  };

  loop = createAtlasRenderLoop(
    () => runtime.instance.ctl.renderOneFrame(),
    undefined,
    () => {
      callbacks.onRenderFailed?.();
      detach();
    },
  );
  stopObservingVisibility = observeAtlasVisibility(container, loop);
  runtime.canvas.addEventListener("webglcontextlost", onContextLost);
  runtime.canvas.addEventListener("webglcontextrestored", onContextRestored);
  loop.start();

  return {
    detach,
    focus: async (target) => {
      if (detached || contextLost) throw new Error("WWT atlas is not active");
      const fieldOfView = validateFieldOfViewDeg(
        target.fieldOfViewDegrees ?? ATLAS_DEFAULT_FIELD_OF_VIEW_DEG,
      );
      if (
        fieldOfView === null ||
        !Number.isFinite(target.rightAscensionDegrees) ||
        target.rightAscensionDegrees < 0 ||
        target.rightAscensionDegrees >= 360 ||
        !Number.isFinite(target.declinationDegrees) ||
        target.declinationDegrees < -90 ||
        target.declinationDegrees > 90
      ) {
        throw new RangeError("Atlas focus target is invalid");
      }
      runtime.instance.applySetting(["smoothPan", !target.reducedMotion]);
      await withTimeout(
        runtime.instance.gotoRADecZoom(
          degreesToRadians(target.rightAscensionDegrees),
          degreesToRadians(target.declinationDegrees),
          fieldOfView,
          target.reducedMotion,
          undefined,
          target.reducedMotion ? undefined : 0.8,
        ),
        CAMERA_MOVE_TIMEOUT_MS,
      );
    },
    pan: (horizontalPixels, verticalPixels) => {
      if (detached || contextLost) throw new Error("WWT atlas is not active");
      if (
        !Number.isFinite(horizontalPixels) ||
        !Number.isFinite(verticalPixels) ||
        Math.abs(horizontalPixels) > 200 ||
        Math.abs(verticalPixels) > 200
      ) {
        throw new RangeError("Atlas pan step is invalid");
      }
      runtime.instance.ctl.move(horizontalPixels, verticalPixels);
    },
    setLayer: (layerId) => {
      if (detached || contextLost) throw new Error("WWT atlas is not active");
      const layer = atlasLayerById(layerId);
      if (layer === null) throw new RangeError("Atlas layer is invalid");
      runtime.instance.setBackgroundImageByName(layer.imageSetName);
    },
    setLocalHorizon: (enabled) => {
      if (detached || contextLost) throw new Error("WWT atlas is not active");
      runtime.instance.applySetting(["localHorizonMode", enabled]);
      runtime.instance.applySetting(["showHorizon", enabled]);
      runtime.instance.applySetting(["showAltAzGrid", enabled]);
      runtime.instance.applySetting(["showAltAzGridText", enabled]);
    },
    setObserver: (observer) => {
      if (detached || contextLost) throw new Error("WWT atlas is not active");
      applyObserver(runtime.instance, observer);
    },
    setTime: (instant) => {
      if (detached || contextLost || !Number.isFinite(instant.getTime())) {
        throw new RangeError("Atlas time is invalid");
      }
      runtime.instance.stc.set_now(new Date(instant.getTime()));
      runtime.instance.stc.set_syncToClock(false);
    },
    syncTimeNow: () => {
      if (detached || contextLost) throw new Error("WWT atlas is not active");
      runtime.instance.stc.syncTime();
    },
    zoom: (factor) => {
      if (detached || contextLost) throw new Error("WWT atlas is not active");
      if (!Number.isFinite(factor) || factor < 0.5 || factor > 2) {
        throw new RangeError("Atlas zoom step is invalid");
      }
      runtime.instance.ctl.zoom(factor);
    },
  };
}
