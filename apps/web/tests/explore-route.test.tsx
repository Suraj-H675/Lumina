import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server/api-origin", () => ({
  resolvePublicWebApiOrigin: () => ({ valid: false }),
  resolveWebApiOrigin: () => ({ valid: false }),
}));

vi.mock("../src/lib/server/catalog", () => ({
  loadExploreCatalogue: vi.fn(),
  searchCatalogue: vi.fn(),
}));

import { createExploreMetadata } from "../src/app/explore/route-page";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { ExploreMessages } from "../src/lib/i18n/messages/types";

describe("Explore route localization boundary", () => {
  it("creates metadata from the injected Explore message group", () => {
    const messages: ExploreMessages = {
      ...enMessages.explore,
      metadataDescription: "Fixture Explore metadata description",
      metadataTitle: "Fixture Explore metadata title",
    };

    expect(createExploreMetadata(messages)).toMatchObject({
      description: "Fixture Explore metadata description",
      title: "Fixture Explore metadata title",
    });
  });
});
