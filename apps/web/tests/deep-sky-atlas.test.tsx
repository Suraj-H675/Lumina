import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enMessages } from "../src/lib/i18n/messages/en";
import type { DeepSkyAtlasMessages } from "../src/lib/i18n/messages/types";

const fake = vi.hoisted(() => {
  const session = {
    detach: vi.fn(),
    focus: vi.fn(() => Promise.resolve()),
    pan: vi.fn(),
    setLayer: vi.fn(),
    setLocalHorizon: vi.fn(),
    setObserver: vi.fn(),
    setTime: vi.fn(),
    syncTimeNow: vi.fn(),
    zoom: vi.fn(),
  };
  return {
    attach: vi.fn(() => Promise.resolve(session)),
    probe: vi.fn(() => Promise.resolve(true)),
    session,
  };
});

vi.mock("../src/lib/wwt/client", () => ({
  attachWwtAtlas: fake.attach,
  probeAtlasLayerAvailability: fake.probe,
}));

import { DeepSkyAtlas } from "../src/app/explore/deep-sky/deep-sky-atlas";

const target = {
  declinationDegrees: 41.26875,
  name: "Messier 31",
  rightAscensionDegrees: 10.684708333333334,
};

function renderAtlas(
  messages: DeepSkyAtlasMessages = enMessages.deepSky.atlas,
  atlasTarget: typeof target | null = target,
) {
  return render(
    <DeepSkyAtlas initialLayerId="visible-dss2" messages={messages} target={atlasTarget} />,
  );
}

function resetFake(): void {
  fake.attach.mockClear();
  fake.probe.mockReset();
  fake.probe.mockResolvedValue(true);
  for (const method of Object.values(fake.session)) method.mockClear();
  fake.session.focus.mockResolvedValue(undefined);
}

beforeEach(() => {
  resetFake();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Phase 5A deep-sky atlas activation boundary", () => {
  it("renders useful credited content without loading WWT until explicit activation", async () => {
    const { container } = renderAtlas();

    expect(fake.attach).not.toHaveBeenCalled();
    expect(fake.probe).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 2, name: "WorldWide Telescope atlas" }),
    ).toBeVisible();
    expect(
      screen.getByText(/No external WWT or imagery request is made before you activate it/i),
    ).toBeVisible();
    expect(screen.getByText(/Copyright DSS Consortium/i)).toBeVisible();
    expect(screen.getByText(/WorldWide Telescope web engine 7.40.0/i)).toBeVisible();
    expect((await axe(container)).violations).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Open interactive atlas" }));
    await waitFor(() => expect(fake.attach).toHaveBeenCalledOnce());
    expect(fake.probe).toHaveBeenCalledWith("visible-dss2");
    expect(fake.session.setLayer).toHaveBeenCalledWith("visible-dss2");
    expect(fake.session.focus).toHaveBeenCalledWith({
      declinationDegrees: target.declinationDegrees,
      reducedMotion: false,
      rightAscensionDegrees: target.rightAscensionDegrees,
    });
  });

  it("keeps observer location local until the user explicitly applies it", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: { altitude: 920, latitude: 12.971599, longitude: 77.594566 },
      } as GeolocationPosition),
    );
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    renderAtlas();

    expect(getCurrentPosition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Open interactive atlas" }));
    await screen.findByText("Interactive atlas ready.");

    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Latitude °")).toHaveValue(12.971599);
    expect(screen.getByLabelText("Longitude °")).toHaveValue(77.594566);
    expect(screen.getByLabelText("Elevation m")).toHaveValue(920);
    expect(fake.session.setObserver).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Apply observer context" }));
    expect(fake.session.setObserver).toHaveBeenCalledWith({
      elevationM: 920,
      latitude: 12.971599,
      longitude: 77.594566,
    });
    expect(window.location.href).not.toContain("12.971599");
    expect(window.location.href).not.toContain("77.594566");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("applies only closed survey layers and transient UTC/view controls", async () => {
    renderAtlas();
    await userEvent.click(screen.getByRole("button", { name: "Open interactive atlas" }));
    await screen.findByText("Interactive atlas ready.");

    await userEvent.selectOptions(screen.getByLabelText("Wavelength context"), "infrared-wise");
    await waitFor(() => expect(fake.session.setLayer).toHaveBeenLastCalledWith("infrared-wise"));
    expect(fake.probe).toHaveBeenLastCalledWith("infrared-wise");
    expect(screen.getByText(/Infrared survey imagery mapped into display colours/i)).toBeVisible();

    fireEvent.change(screen.getByLabelText("ISO 8601 UTC instant"), {
      target: { value: "2026-09-15T18:30:00Z" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Apply UTC time" }));
    expect(fake.session.setTime).toHaveBeenCalledOnce();
    expect(fake.session.setTime.mock.calls[0]?.[0].toISOString()).toBe("2026-09-15T18:30:00.000Z");

    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await userEvent.click(screen.getByRole("button", { name: "Pan right" }));
    expect(fake.session.zoom).toHaveBeenCalledWith(0.8);
    expect(fake.session.pan).toHaveBeenCalledWith(40, 0);

    await userEvent.click(screen.getByLabelText("Show local-horizon context"));
    expect(fake.session.setLocalHorizon).toHaveBeenCalledWith(true);
  });

  it("refuses unavailable survey imagery before WWT starts and preserves the current layer on switch failure", async () => {
    fake.probe.mockResolvedValueOnce(false);
    renderAtlas();

    await userEvent.click(screen.getByRole("button", { name: "Open interactive atlas" }));
    await screen.findByText(/Visible · DSS2 imagery is unavailable right now/i);
    expect(fake.attach).not.toHaveBeenCalled();
    expect(fake.session.setLayer).not.toHaveBeenCalled();

    fake.probe.mockResolvedValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Open interactive atlas" }));
    await screen.findByText("Interactive atlas ready.");
    expect(fake.session.setLayer).toHaveBeenLastCalledWith("visible-dss2");

    fake.probe.mockResolvedValueOnce(false);
    await userEvent.selectOptions(screen.getByLabelText("Wavelength context"), "infrared-wise");
    await screen.findByText(/Infrared · WISE imagery is unavailable right now/i);
    expect(screen.getByLabelText("Wavelength context")).toHaveValue("visible-dss2");
    expect(fake.session.setLayer).not.toHaveBeenCalledWith("infrared-wise");
  });

  it("detaches the Lumina-owned atlas lifecycle when the component unmounts", async () => {
    const view = renderAtlas();
    await userEvent.click(screen.getByRole("button", { name: "Open interactive atlas" }));
    await screen.findByText("Interactive atlas ready.");

    view.unmount();
    expect(fake.session.detach).toHaveBeenCalledOnce();
  });

  it("localizes interactive chrome and status without rewriting reviewed survey data", async () => {
    const messages: DeepSkyAtlasMessages = {
      ...enMessages.deepSky.atlas,
      activation: {
        ...enMessages.deepSky.atlas.activation,
        open: "Fixture atlas action",
      },
      header: {
        ...enMessages.deepSky.atlas.header,
        title: "Fixture WWT heading",
      },
      status: {
        ...enMessages.deepSky.atlas.status,
        focused: "Fixture focus {objectName}.",
        ready: "Fixture atlas ready.",
      },
      survey: {
        ...enMessages.deepSky.atlas.survey,
        creditLabel: "Fixture credit",
        wavelengthLabel: "Fixture wavelength",
      },
      view: {
        ...enMessages.deepSky.atlas.view,
        focus: "Fixture focus action",
      },
    };

    renderAtlas(messages);

    expect(screen.getByRole("heading", { level: 2, name: "Fixture WWT heading" })).toBeVisible();
    expect(screen.getByLabelText("Fixture wavelength")).toHaveValue("visible-dss2");
    expect(screen.getByText("Visible · DSS2", { exact: true })).toBeVisible();
    expect(
      screen.getByText(
        "A photographic optical survey composite. Display colours are a survey rendering, not a direct naked-eye view.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(screen.getByText(/Fixture credit: Copyright DSS Consortium/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Fixture atlas action" }));
    await screen.findByText("Fixture atlas ready.");
    await userEvent.click(screen.getByRole("button", { name: "Fixture focus action" }));
    expect(screen.getByText("Fixture focus Messier 31.")).toBeVisible();
    expect(fake.session.focus).toHaveBeenCalledWith({
      declinationDegrees: target.declinationDegrees,
      reducedMotion: false,
      rightAscensionDegrees: target.rightAscensionDegrees,
    });
  });
});
