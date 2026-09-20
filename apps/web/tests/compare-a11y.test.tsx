import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { buildCompareModel } from "../src/lib/compare-model";
import { collectionSaveMessageSlice } from "../src/lib/collections-messages";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { CompareView } from "../src/components/compare-view";
import { fixtureDetail } from "./support/compare-fixtures";

const SAVE_MESSAGES = collectionSaveMessageSlice(enMessages.collections);
const DEFAULT_COMPARE_PROPS = {
  collectionSaveMessages: SAVE_MESSAGES,
  entityTypeMessages: enMessages.entityTypes,
  locale: DEFAULT_LOCALE,
  messages: enMessages.compare,
} as const;

describe("CompareView accessibility", () => {
  it("passes an axe scan with a loaded two-object comparison", async () => {
    const model = buildCompareModel([
      { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
      { detail: fixtureDetail.kepler452, kind: "ok", slug: "kepler-452" },
    ]);
    const { container } = render(
      <CompareView
        {...DEFAULT_COMPARE_PROPS}
        model={model}
        selectedSlugs={["k2-18", "kepler-452"]}
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it("passes an axe scan in the empty state", async () => {
    const { container } = render(
      <CompareView {...DEFAULT_COMPARE_PROPS} model={buildCompareModel([])} selectedSlugs={[]} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
