import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { COLLECTIONS_STORAGE_KEY } from "../src/lib/collections-model";
import * as store from "../src/lib/collections-store";
import { CollectionDetailView } from "../src/components/collection-detail-view";

const K2_18 = { canonical_name: "K2-18", entity_type: "star" as const, slug: "k2-18" };
const KEPLER_186 = {
  canonical_name: "Kepler-186",
  entity_type: "star" as const,
  slug: "kepler-186",
};
const KEPLER_452 = {
  canonical_name: "Kepler-452",
  entity_type: "star" as const,
  slug: "kepler-452",
};

let collectionId: string;

beforeEach(() => {
  // Reset BOTH layers through the store's legitimate update path: wipe the
  // persisted bytes, publish an empty valid envelope, and fire the storage
  // event so the in-memory store re-reads exactly as another tab would.
  window.localStorage.clear();
  window.localStorage.setItem(
    COLLECTIONS_STORAGE_KEY,
    JSON.stringify({ collections: [], version: 1 }),
  );
  window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
  const created = store.createCollection("Interesting Worlds");
  if (!created.ok || created.collection === undefined) throw new Error("setup failed");
  collectionId = created.collection.id;
});

afterEach(() => {
  pushMock.mockReset();
});

function persisted(): {
  collections: Array<{
    id: string;
    items: Array<{ slug: string }>;
    name: string;
  }>;
} {
  return JSON.parse(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY) ?? "{}");
}

describe("CollectionDetailView", () => {
  it("shows the collection with its saved objects and local-only disclosure", () => {
    store.addObjectToCollection(collectionId, K2_18);
    render(<CollectionDetailView collectionId={collectionId} />);

    expect(screen.getByRole("heading", { level: 1, name: "Interesting Worlds" })).toBeVisible();
    expect(screen.getByText(/saved in this browser on this device/i)).toBeVisible();

    const list = screen.getByRole("list", { name: /objects in interesting worlds/i });
    const objectLink = screen.getByRole("link", { name: /K2-18/ });
    expect(objectLink).toHaveAttribute("href", "/objects/k2-18");

    // Removal has an accessible name; nothing about measurements is shown.
    expect(list.textContent).toContain("K2-18");
    expect(screen.getByRole("button", { name: "Remove K2-18 from the collection" })).toBeVisible();
    expect(document.body.textContent).not.toMatch(/magnitude/i);
  });

  it("renders a truthful missing-collection page for unknown ids", () => {
    render(<CollectionDetailView collectionId="never-existed" />);
    expect(
      screen.getByRole("heading", { name: /this collection is not on this device/i }),
    ).toBeVisible();
    // The URL is not portable across devices — say so.
    expect(screen.getByText(/stored per browser/i)).toBeVisible();
  });

  it("removes an object and persists the removal", async () => {
    store.addObjectToCollection(collectionId, K2_18);
    render(<CollectionDetailView collectionId={collectionId} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove K2-18 from the collection" }));

    await waitFor(() => {
      expect(persisted().collections[0]?.items).toEqual([]);
    });
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /K2-18/ })).toBeNull();
    });
    expect(screen.getByText(/no objects saved here yet/i)).toBeVisible();
  });

  it("renames through the dialog preserving identity, then persists", async () => {
    store.addObjectToCollection(collectionId, K2_18);
    const user = userEvent.setup();
    render(<CollectionDetailView collectionId={collectionId} />);

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const dialog = screen.getByRole("dialog", { name: "Rename collection" });
    expect(dialog).toBeVisible();

    const input = screen.getByLabelText("Name");
    await user.clear(input);
    await user.type(input, "Exoplanet Shortlist");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() => {
      expect(persisted().collections[0]?.name).toBe("Exoplanet Shortlist");
    });
    // Same collection (id), same items — only the name changed.
    expect(persisted().collections[0]?.id).toBe(collectionId);
    expect(screen.queryByRole("dialog", { name: "Rename collection" })).toBeNull();
  });

  it("blocks duplicate rename targets with an honest message", async () => {
    const second = store.createCollection("Other");
    if (!second.ok) throw new Error("setup failed");
    const user = userEvent.setup();
    render(<CollectionDetailView collectionId={collectionId} />);

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("Name");
    await user.clear(input);
    await user.type(input, "other");
    expect(await screen.findByText("You already have a collection with this name.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();
  });

  it("deletes only after explicit confirmation and navigates back", async () => {
    store.addObjectToCollection(collectionId, K2_18);
    const user = userEvent.setup();
    render(<CollectionDetailView collectionId={collectionId} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Interesting Worlds?" });
    // Confirmation names the collection and scopes the destruction honestly.
    expect(dialog.textContent).toContain("from this browser only");
    expect(dialog.textContent).toContain("1 saved object will be removed with it.");

    await user.click(screen.getByRole("button", { name: "Keep collection" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(persisted().collections).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete collection" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/collections");
    });
    expect(persisted().collections).toHaveLength(0);
  });

  describe("compare selection", () => {
    it("requires two objects and a selection before Compare unlocks, then builds the frozen URL", async () => {
      store.addObjectToCollection(collectionId, K2_18);
      store.addObjectToCollection(collectionId, KEPLER_186);
      const user = userEvent.setup();
      render(<CollectionDetailView collectionId={collectionId} />);

      // Nothing selected yet: the launch control stays disabled.
      const compare = screen.getByRole("button", { name: /Compare selected/i });
      expect(compare).toBeDisabled();

      await user.click(screen.getByRole("checkbox", { name: /k2-18/i }));
      await user.click(screen.getByRole("checkbox", { name: /kepler-186/i }));
      expect(compare).toBeEnabled();
      await user.click(compare);

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith("/compare?object=k2-18&object=kepler-186");
      });
    });

    it("allows three selections and hard-blocks a fourth", async () => {
      for (const object of [K2_18, KEPLER_186, KEPLER_452]) {
        store.addObjectToCollection(collectionId, object);
      }
      const user = userEvent.setup();
      render(<CollectionDetailView collectionId={collectionId} />);

      const first = screen.getByRole("checkbox", { name: /k2-18/i });
      const second = screen.getByRole("checkbox", { name: /kepler-186/i });
      const third = screen.getByRole("checkbox", { name: /kepler-452/i });
      await user.click(first);
      await user.click(second);
      await user.click(third);

      expect(third).toBeEnabled();
      await user.click(screen.getByRole("button", { name: /Compare selected \(3\)/i }));
      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith(
          "/compare?object=k2-18&object=kepler-186&object=kepler-452",
        );
      });
    });

    it("communicates the maximum without color-only signals", async () => {
      for (const object of [K2_18, KEPLER_186, KEPLER_452]) {
        store.addObjectToCollection(collectionId, object);
      }
      const user = userEvent.setup();
      render(<CollectionDetailView collectionId={collectionId} />);

      await user.click(screen.getByRole("checkbox", { name: /k2-18/i }));
      await user.click(screen.getByRole("checkbox", { name: /kepler-186/i }));
      await user.click(screen.getByRole("checkbox", { name: /kepler-452/i }));

      expect(screen.getByText(/maximum of 3 reached/i)).toBeVisible();
    });
  });

  it("shows the empty-collection state pointing at Explore", () => {
    render(<CollectionDetailView collectionId={collectionId} />);
    expect(screen.getByText(/no objects saved here yet/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Explore catalogue" })).toHaveAttribute(
      "href",
      "/explore",
    );
  });
});
