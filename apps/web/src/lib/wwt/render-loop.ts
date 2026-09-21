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
  setVisualVisible: (visible: boolean) => void;
  start: () => void;
  stop: () => void;
}>;

export function createAtlasRenderLoop(
  renderOneFrame: () => void,
  scheduler: AtlasFrameScheduler = browserScheduler(),
  onRenderError: (error: unknown) => void = () => undefined,
): AtlasRenderLoop {
  let disposed = false;
  let requested = false;
  let visualVisible = true;
  let frameId: number | null = null;

  const shouldRender = () => !scheduler.hidden() && visualVisible;

  const stop = () => {
    requested = false;
    if (frameId !== null) scheduler.cancelFrame(frameId);
    frameId = null;
  };

  const tick: FrameRequestCallback = () => {
    frameId = null;
    if (disposed || !requested || !shouldRender()) return;
    try {
      renderOneFrame();
    } catch (error) {
      requested = false;
      onRenderError(error);
      return;
    }
    frameId = scheduler.requestFrame(tick);
  };

  const start = () => {
    if (disposed || requested) return;
    requested = true;
    if (shouldRender()) frameId = scheduler.requestFrame(tick);
  };

  const removeVisibilityListener = scheduler.onVisibilityChange(() => {
    if (disposed || !requested) return;
    if (!shouldRender()) {
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
    setVisualVisible: (visible) => {
      if (disposed || visualVisible === visible) return;
      visualVisible = visible;
      if (!requested) return;
      if (!shouldRender()) {
        if (frameId !== null) scheduler.cancelFrame(frameId);
        frameId = null;
        return;
      }
      if (frameId === null) frameId = scheduler.requestFrame(tick);
    },
    start,
    stop,
  };
}
