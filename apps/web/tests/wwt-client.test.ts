import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  applySetting: vi.fn(),
  constructorFreestandingStates: [] as Array<boolean>,
  constructorOptions: [] as Array<Record<string, unknown>>,
  freestandingControl: { freestandingMode: false },
  gotoRADecZoom: vi.fn(() => Promise.resolve()),
  loadImageCollection: vi.fn(() => Promise.resolve({})),
  move: vi.fn(),
  renderOneFrame: vi.fn(),
  setBackgroundImageByName: vi.fn(),
  setNow: vi.fn(),
  setSyncToClock: vi.fn(),
  syncTime: vi.fn(),
  waitForReady: vi.fn(() => Promise.resolve()),
  zoom: vi.fn(),
}));

vi.mock("@wwtelescope/engine", () => ({
  WWTControl: { singleton: fake.freestandingControl },
}));

vi.mock("@wwtelescope/engine-helpers", () => ({
  WWTInstance: class {
    ctl = { move: fake.move, renderOneFrame: fake.renderOneFrame, zoom: fake.zoom };
    stc = {
      set_now: fake.setNow,
      set_syncToClock: fake.setSyncToClock,
      syncTime: fake.syncTime,
    };

    constructor(options: Record<string, unknown>) {
      fake.constructorFreestandingStates.push(fake.freestandingControl.freestandingMode);
      fake.constructorOptions.push(options);
      const id = String(options.elId ?? "");
      const container = document.getElementById(id);
      if (container === null) throw new Error("missing fake WWT container");
      container.append(document.createElement("canvas"));
    }

    applySetting = fake.applySetting;
    gotoRADecZoom = fake.gotoRADecZoom;
    loadImageCollection = fake.loadImageCollection;
    setBackgroundImageByName = fake.setBackgroundImageByName;
    waitForReady = fake.waitForReady;
  },
}));

function resetFake(): void {
  for (const spy of [
    fake.applySetting,
    fake.gotoRADecZoom,
    fake.loadImageCollection,
    fake.move,
    fake.renderOneFrame,
    fake.setBackgroundImageByName,
    fake.setNow,
    fake.setSyncToClock,
    fake.syncTime,
    fake.waitForReady,
    fake.zoom,
  ]) {
    spy.mockClear();
  }
  fake.constructorFreestandingStates.length = 0;
  fake.constructorOptions.length = 0;
  fake.freestandingControl.freestandingMode = false;
}

function container(): HTMLDivElement {
  const element = document.createElement("div");
  element.id = "lumina-wwt-atlas";
  document.body.append(element);
  return element;
}

beforeEach(() => {
  vi.resetModules();
  resetFake();
  document.body.replaceChildren();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 17),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("lazy WWT client adapter", () => {
  it("probes only the fixed reviewed survey URL and reports image load failure explicitly", async () => {
    const requested: string[] = [];
    class SuccessfulImage extends EventTarget {
      crossOrigin = "";
      set src(value: string) {
        requested.push(value);
        queueMicrotask(() => this.dispatchEvent(new Event("load")));
      }
    }
    vi.stubGlobal("Image", SuccessfulImage);
    const { probeAtlasLayerAvailability } = await import("../src/lib/wwt/client");
    await expect(probeAtlasLayerAvailability("infrared-wise")).resolves.toBe(true);
    expect(requested).toEqual([
      "https://www.worldwidetelescope.org/wwtweb/tiles.aspx?q=0,0,0,wise",
    ]);

    class FailingImage extends EventTarget {
      crossOrigin = "";
      set src(_value: string) {
        queueMicrotask(() => this.dispatchEvent(new Event("error")));
      }
    }
    vi.stubGlobal("Image", FailingImage);
    await expect(probeAtlasLayerAvailability("ultraviolet-galex")).resolves.toBe(false);
  });

  it("fails before constructing WWT when WebGL is unavailable", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { attachWwtAtlas } = await import("../src/lib/wwt/client");

    await expect(attachWwtAtlas(container())).rejects.toThrow("WebGL is unavailable");
    expect(fake.constructorOptions).toEqual([]);
  });

  it("uses the fixed freestanding initialization and same-origin reviewed WTML", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as WebGLRenderingContext,
    );
    const { attachWwtAtlas } = await import("../src/lib/wwt/client");
    const host = container();
    const session = await attachWwtAtlas(host);

    expect(fake.constructorFreestandingStates).toEqual([true]);
    expect(fake.freestandingControl.freestandingMode).toBe(true);
    expect(fake.constructorOptions).toEqual([
      {
        elId: "lumina-wwt-atlas",
        freestandingAssetBaseurl: "https://web.wwtassets.org/engine/assets",
        startInternalRenderLoop: false,
      },
    ]);
    expect(fake.loadImageCollection).toHaveBeenCalledWith(
      "http://localhost:3000/wwt/lumina-sky-layers.wtml",
      false,
    );
    expect(host.querySelector("canvas")).not.toBeNull();
    session.detach();
  });

  it("converts focus degrees to radians and applies only reviewed layer/location/time settings", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as WebGLRenderingContext,
    );
    const { attachWwtAtlas } = await import("../src/lib/wwt/client");
    const session = await attachWwtAtlas(container());

    session.setLayer("infrared-wise");
    expect(fake.setBackgroundImageByName).toHaveBeenCalledWith("WISE All Sky (Infrared)");

    await session.focus({
      declinationDegrees: 41.26875,
      fieldOfViewDegrees: 5,
      reducedMotion: true,
      rightAscensionDegrees: 10.684708333333334,
    });
    expect(fake.gotoRADecZoom).toHaveBeenCalledWith(
      (10.684708333333334 * Math.PI) / 180,
      (41.26875 * Math.PI) / 180,
      5,
      true,
      undefined,
      undefined,
    );

    session.setObserver({ elevationM: 1600, latitude: 35.1234, longitude: -105.5678 });
    session.setLocalHorizon(true);
    session.pan(40, -40);
    session.zoom(0.8);
    expect(fake.move).toHaveBeenCalledWith(40, -40);
    expect(fake.zoom).toHaveBeenCalledWith(0.8);
    expect(fake.applySetting).toHaveBeenCalledWith(["locationLat", 35.1234]);
    expect(fake.applySetting).toHaveBeenCalledWith(["locationLng", -105.5678]);
    expect(fake.applySetting).toHaveBeenCalledWith(["locationAltitude", 1600]);
    expect(fake.applySetting).toHaveBeenCalledWith(["localHorizonMode", true]);

    const instant = new Date("2026-09-15T06:30:00Z");
    session.setTime(instant);
    expect(fake.setNow).toHaveBeenCalledWith(instant);
    expect(fake.setSyncToClock).toHaveBeenCalledWith(false);
    session.syncTimeNow();
    expect(fake.syncTime).toHaveBeenCalledTimes(1);
    session.detach();
  });

  it("allows one active session, then reuses the singleton canvas after detach", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as WebGLRenderingContext,
    );
    const { attachWwtAtlas } = await import("../src/lib/wwt/client");
    const firstHost = container();
    const first = await attachWwtAtlas(firstHost);
    await expect(attachWwtAtlas(firstHost)).rejects.toThrow("already active");
    expect(fake.constructorOptions).toHaveLength(1);

    const canvas = firstHost.querySelector("canvas");
    first.detach();
    expect(canvas?.isConnected).toBe(false);

    firstHost.remove();
    const secondHost = container();
    const second = await attachWwtAtlas(secondHost);
    expect(fake.constructorOptions).toHaveLength(1);
    expect(secondHost.querySelector("canvas")).toBe(canvas);
    second.detach();
  });
});
