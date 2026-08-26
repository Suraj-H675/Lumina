import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { COLLECTIONS_STORAGE_KEY } from "../src/lib/collections-model";
import * as store from "../src/lib/collections-store";
import { CollectionsOverview } from "../src/components/collections-overview";
import { CollectionDetailView } from "../src/components/collection-detail-view";
import {
  SaveToCollectionsButton,
  type ObjectIdentity,
} from "../src/components/save-to-collections";
import { CompareSaveSelected } from "../src/components/compare-save-selected";

const K2_18: ObjectIdentity = {
  canonical_name: "K2-18",
  entity_type: "star",
  slug: "k2-18",
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    COLLECTIONS_STORAGE_KEY,
    JSON.stringify({ collections: [], version: 1 }),
  );
  window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
});

describe("collections accessibility (axe)", () => {
  it("empty overview passes", async () => {
    const { container } = render(<CollectionsOverview />);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("populated overview passes", async () => {
    store.createCollection("Alpha");
    store.createCollection("Beta");
    const { container } = render(<CollectionsOverview />);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("collection detail with saved objects and compare selection passes", async () => {
    const created = store.createCollection("Interesting Worlds");
    if (!created.ok || created.collection === undefined) throw new Error("setup failed");
    store.addObjectsToCollection(created.collection.id, [
      K2_18,
      { canonical_name: "Kepler-186", entity_type: "star", slug: "kepler-186" },
      { canonical_name: "Kepler-452", entity_type: "star", slug: "kepler-452" },
    ]);
    const { container } = render(<CollectionDetailView collectionId={created.collection.id} />);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("save picker dialog passes while open", async () => {
    store.createCollection("Alpha");
    const user = userEvent.setup();
    const { container } = render(<SaveToCollectionsButton identity={K2_18} />);
    await user.click(screen.getByRole("button", { name: /save k2-18/i }));
    expect((await axe(container)).violations).toEqual([]);
  });

  it("compare save-selected dialog passes while open", async () => {
    store.createCollection("Alpha");
    const user = userEvent.setup();
    const { container } = render(
      <CompareSaveSelected
        identities={[
          K2_18,
          { canonical_name: "Kepler-452", entity_type: "star", slug: "kepler-452" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save compared objects/i }));
    expect((await axe(container)).violations).toEqual([]);
  });

  it("corrupted-recovery panel passes", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, "{corrupt");
    window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
    const { container } = render(<CollectionsOverview />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
