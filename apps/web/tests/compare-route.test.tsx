import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadCompareMock } = vi.hoisted(() => ({
  loadCompareMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("../src/lib/server/compare", () => ({
  loadCompareObjectsPerRequest: loadCompareMock,
}));

import { createCompareMetadata } from "../src/app/compare/route-page";
import { enMessages } from "../src/lib/i18n/messages/en";
import { fixtureDetail } from "./support/compare-fixtures";

beforeEach(() => {
  loadCompareMock.mockReset();
});

describe("Compare route localization boundary", () => {
  it("uses injected generic metadata without a committed comparison", async () => {
    const messages = {
      ...enMessages.compare.metadata,
      description: "Fixture compare description",
      genericTitle: "Fixture compare title",
    };

    await expect(
      createCompareMetadata({ searchParams: Promise.resolve({}) }, messages),
    ).resolves.toEqual({
      description: "Fixture compare description",
      title: "Fixture compare title",
    });
    expect(loadCompareMock).not.toHaveBeenCalled();
  });

  it("localizes two- and three-object title grammar without rewriting canonical names", async () => {
    const messages = {
      ...enMessages.compare.metadata,
      threeObjectTitle: "Fixture {first} / {second} / {third}",
      twoObjectTitle: "Fixture {first} / {second}",
    };
    loadCompareMock.mockResolvedValueOnce([
      { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
      { detail: fixtureDetail.kepler452, kind: "ok", slug: "kepler-452" },
    ]);

    await expect(
      createCompareMetadata(
        {
          searchParams: Promise.resolve({
            object: ["k2-18", "kepler-452"],
          }),
        },
        messages,
      ),
    ).resolves.toMatchObject({
      title: "Fixture K2-18 / Kepler-452",
    });

    loadCompareMock.mockResolvedValueOnce([
      { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
      { detail: fixtureDetail.kepler452, kind: "ok", slug: "kepler-452" },
      { detail: fixtureDetail.hd209458, kind: "ok", slug: "hd-209458" },
    ]);
    await expect(
      createCompareMetadata(
        {
          searchParams: Promise.resolve({
            object: ["k2-18", "kepler-452", "hd-209458"],
          }),
        },
        messages,
      ),
    ).resolves.toMatchObject({
      title: "Fixture K2-18 / Kepler-452 / HD 209458",
    });
  });

  it("keeps the generic title when any selected slot does not load", async () => {
    loadCompareMock.mockResolvedValue([
      { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
      { kind: "unknown", slug: "ghost-object" },
    ]);

    await expect(
      createCompareMetadata(
        {
          searchParams: Promise.resolve({
            object: ["k2-18", "ghost-object"],
          }),
        },
        enMessages.compare.metadata,
      ),
    ).resolves.toMatchObject({
      title: "Compare catalogue objects",
    });
  });
});
