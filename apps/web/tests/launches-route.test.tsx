import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadNowLaunchMock } = vi.hoisted(() => ({
  loadNowLaunchMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/server/space-now", () => ({
  loadNowLaunch: loadNowLaunchMock,
  loadNowLaunches: vi.fn(),
}));

import { createLaunchMetadata } from "../src/app/now/launches/[launchId]/route-page";
import { createLaunchesMetadata } from "../src/app/now/launches/route-page";
import { enMessages } from "../src/lib/i18n/messages/en";

beforeEach(() => {
  loadNowLaunchMock.mockReset();
});

describe("Launch Center route localization boundary", () => {
  it("creates list metadata from the injected Launch Center messages", () => {
    const messages = {
      ...enMessages.spaceNow.launches,
      list: {
        ...enMessages.spaceNow.launches.list,
        metadataDescription: "Fixture launch-list description",
        metadataTitle: "Fixture launch-list title",
      },
    };

    expect(createLaunchesMetadata(messages)).toEqual({
      description: "Fixture launch-list description",
      title: "Fixture launch-list title",
    });
  });

  it("localizes detail metadata grammar without rewriting the provider launch name", async () => {
    const messages = {
      ...enMessages.spaceNow.launches,
      detail: {
        ...enMessages.spaceNow.launches.detail,
        metadataDescription: "Fixture metadata for {name}",
      },
    };
    loadNowLaunchMock.mockResolvedValue({
      data: { launch: { name: "Provider Launch Name" } },
      kind: "ok",
    });

    await expect(
      createLaunchMetadata(
        { params: Promise.resolve({ launchId: "provider-launch-id" }) },
        messages,
      ),
    ).resolves.toEqual({
      description: "Fixture metadata for Provider Launch Name",
      title: "Provider Launch Name",
    });
    expect(loadNowLaunchMock).toHaveBeenCalledWith("provider-launch-id");
  });

  it("uses locale-owned titles for not-found and transport-unavailable metadata", async () => {
    const messages = {
      ...enMessages.spaceNow.launches,
      detail: {
        ...enMessages.spaceNow.launches.detail,
        metadataNotFoundTitle: "Fixture missing launch",
        metadataUnavailableTitle: "Fixture unavailable launch",
      },
    };

    loadNowLaunchMock.mockResolvedValueOnce({ kind: "not-found" });
    await expect(
      createLaunchMetadata({ params: Promise.resolve({ launchId: "missing" }) }, messages),
    ).resolves.toEqual({ title: "Fixture missing launch" });

    loadNowLaunchMock.mockResolvedValueOnce({ kind: "unavailable" });
    await expect(
      createLaunchMetadata({ params: Promise.resolve({ launchId: "unavailable" }) }, messages),
    ).resolves.toEqual({ title: "Fixture unavailable launch" });
  });
});
