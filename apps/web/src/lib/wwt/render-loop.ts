export type AtlasFrameScheduler = Readonly<{
  cancelFrame: (id: number) => void;
  hidden: () => boolean;
  onVisibilityChange: (listener: () => void) => () => void;
  requestFrame: (callback: FrameRequestCallback) => number;
}>;

function browserScheduler(): AtlasFrameScheduler {
  return {
    cancelFrame: (id) => window.cancelAnimationFrame(id),
    hidden: () => document.hidden,
    onVisibilityChange: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
    requestFrame: (callback) => window.requestAnimationFrame(callback),
  };
}

export type AtlasRenderLoop = Readonly<{
  dispose: () => void;
  start: () => void;
  stop: () => void;
}>;

export function createAtlasRenderLoop(
  renderOneFrame: () => void,
  scheduler: AtlasFrameScheduler = browserScheduler(),
): AtlasRenderLoop {
  let disposed = false;
  let requested = false;
  let frameId: number | null = null;

  const stop = () => {
    requested = false;
    if (frameId !== null) scheduler.cancelFrame(frameId);
    frameId = null;
  };

  const tick: FrameRequestCallback = () => {
    frameId = null;
    if (disposed || !requested || scheduler.hidden()) return;
    renderOneFrame();
    frameId = scheduler.requestFrame(tick);
  };

  const start = () => {
    if (disposed || requested) return;
    requested = true;
    if (!scheduler.hidden()) frameId = scheduler.requestFrame(tick);
  };

  const removeVisibilityListener = scheduler.onVisibilityChange(() => {
    if (disposed || !requested) return;
    if (scheduler.hidden()) {
      if (frameId !== null) scheduler.cancelFrame(frameId);
      frameId = null;
      return;
    }
    if (frameId === null) frameId = scheduler.requestFrame(tick);
  });

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stop();
      removeVisibilityListener();
    },
    start,
    stop,
  };
}
