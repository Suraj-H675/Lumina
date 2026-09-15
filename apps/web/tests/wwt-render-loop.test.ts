import { describe, expect, it, vi } from "vitest";

import { createAtlasRenderLoop, type AtlasFrameScheduler } from "../src/lib/wwt/render-loop";

function fakeScheduler() {
  let hidden = false;
  let nextId = 1;
  let listener: (() => void) | null = null;
  const frames = new Map<number, FrameRequestCallback>();
  const cancelled: Array<number> = [];
  const scheduler: AtlasFrameScheduler = {
    cancelFrame: (id) => {
      cancelled.push(id);
      frames.delete(id);
    },
    hidden: () => hidden,
    onVisibilityChange: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    requestFrame: (callback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
  };
  return {
    cancelled,
    fireFrame: (id: number) => {
      const callback = frames.get(id);
      if (callback === undefined) return;
      frames.delete(id);
      callback(0);
    },
    frameIds: () => [...frames.keys()],
    scheduler,
    setHidden: (value: boolean) => {
      hidden = value;
      listener?.();
    },
    visibilityListenerAttached: () => listener !== null,
  };
}

describe("WWT render-loop lifecycle", () => {
  it("starts once, renders one frame per callback, and never creates duplicate loops", () => {
    const fake = fakeScheduler();
    const render = vi.fn();
    const loop = createAtlasRenderLoop(render, fake.scheduler);

    loop.start();
    loop.start();
    expect(fake.frameIds()).toHaveLength(1);
    const first = fake.frameIds()[0]!;
    fake.fireFrame(first);
    expect(render).toHaveBeenCalledTimes(1);
    expect(fake.frameIds()).toHaveLength(1);
  });

  it("cancels while hidden and resumes only after visibility returns", () => {
    const fake = fakeScheduler();
    const render = vi.fn();
    const loop = createAtlasRenderLoop(render, fake.scheduler);
    loop.start();
    const first = fake.frameIds()[0]!;

    fake.setHidden(true);
    expect(fake.cancelled).toContain(first);
    expect(fake.frameIds()).toEqual([]);
    fake.setHidden(false);
    expect(fake.frameIds()).toHaveLength(1);
    fake.fireFrame(fake.frameIds()[0]!);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("stop and dispose leave no scheduled frame or visibility listener", () => {
    const fake = fakeScheduler();
    const render = vi.fn();
    const loop = createAtlasRenderLoop(render, fake.scheduler);
    loop.start();
    loop.stop();
    expect(fake.frameIds()).toEqual([]);
    expect(fake.visibilityListenerAttached()).toBe(true);

    loop.start();
    loop.dispose();
    expect(fake.frameIds()).toEqual([]);
    expect(fake.visibilityListenerAttached()).toBe(false);
    loop.start();
    expect(fake.frameIds()).toEqual([]);
  });
});
