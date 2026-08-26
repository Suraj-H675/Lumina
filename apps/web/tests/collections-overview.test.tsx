import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { COLLECTIONS_STORAGE_KEY } from "../src/lib/collections-model";
import * as store from "../src/lib/collections-store";
import { CollectionsOverview } from "../src/components/collections-overview";

/**
 * Component tests drive the REAL store against jsdom localStorage. State is
 * (re)seeded through the store's own cross-tab path — writing the bytes and
 * firing the storage event — exactly what another tab would do.
 */
function reseedStorage(value: unknown): void {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (raw === "") window.localStorage.removeItem(COLLECTIONS_STORAGE_KEY);
  else window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, raw);
  window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
}

beforeEach(() => {
  reseedStorage({ collections: [], version: 1 });
});

afterEach(() => {
  pushMock.mockReset();
});

describe("CollectionsOverview", () => {
  it("shows the local-storage explanation and leads the empty state to Explore", async () => {
    render(<CollectionsOverview />);

    expect(await screen.findByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
    expect(screen.getByText(/saved in this browser on this device/i)).toBeVisible();
    expect(screen.getByText(/clearing this site's browser data will remove them/i)).toBeVisible();

    // Empty state offers both natural next steps.
    expect(screen.getByRole("button", { name: "Create your first collection" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Browse objects" })).toHaveAttribute(
      "href",
      "/explore",
    );
  });

  it("creates a collection through the dialog and navigates into it", async () => {
    const user = userEvent.setup();
    render(<CollectionsOverview />);

    await user.click(await screen.findByRole("button", { name: "+ Create a collection" }));
    const dialog = screen.getByRole("dialog", { name: "Create a collection" });
    expect(dialog).toBeVisible();

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, "Interesting Worlds");
    await user.click(screen.getByRole("button", { name: "Create collection" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledTimes(1);
    });
    expect(String(pushMock.mock.calls[0]?.[0])).toMatch(/^\/collections\/[0-9a-f-]{36}$/u);
    const persisted = JSON.parse(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY) ?? "{}") as {
      collections: Array<{ name: string }>;
    };
    expect(persisted.collections[0]?.name).toBe("Interesting Worlds");
  });

  it("communicates blank and duplicate names accessibly without crashing", async () => {
    store.createCollection("Deep Sky");
    reseedStorage(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY) ?? "");

    const user = userEvent.setup();
    render(<CollectionsOverview />);
    await user.click(await screen.findByRole("button", { name: "+ Create a collection" }));

    const nameInput = screen.getByLabelText("Name");

    // Blank name: the live hint explains, the control is disabled.
    expect(screen.getByText("Give the collection a name.")).toBeVisible();
    const createControl = screen.getByRole("button", { name: "Create collection" });
    expect(createControl).toBeDisabled();

    // Typing a duplicate (case-insensitive) flips the hint honestly.
    await user.type(nameInput, "deep sky");
    expect(screen.getByText("You already have a collection with this name.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create collection" })).toBeDisabled();
    expect(nameInput).toBeInvalid();

    // A unique name re-enables submission; nothing navigated so far.
    await user.clear(nameInput);
    await user.type(nameInput, "Deep Sky — Nearby");
    expect(screen.getByRole("button", { name: "Create collection" })).toBeEnabled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("Escape closes the create dialog without saving", async () => {
    const user = userEvent.setup();
    render(<CollectionsOverview />);
    await user.click(await screen.findByRole("button", { name: "+ Create a collection" }));
    await user.type(screen.getByLabelText("Name"), "Ephemeral");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY)).not.toContain("Ephemeral");
  });

  it("lists saved collections with honest object counts", async () => {
    const created = store.createCollection("Alpha");
    if (!created.ok || created.collection === undefined) throw new Error("setup failed");
    store.addObjectToCollection(created.collection.id, {
      canonical_name: "K2-18",
      entity_type: "star",
      slug: "k2-18",
    });
    store.createCollection("Beta");
    reseedStorage(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY) ?? "");

    render(<CollectionsOverview />);
    const list = await screen.findByRole("list", { name: "Your collections" });
    const alphaLink = screen.getByRole("link", { name: /Alpha/ });
    expect(alphaLink).toHaveAttribute("href", `/collections/${created.collection.id}`);
    expect(alphaLink.textContent).toContain("1 object");
    expect(list.textContent).toContain("0 objects");
  });

  it("offers the two-step reset in the corrupted-recovery state and keeps data until confirmed", async () => {
    reseedStorage("{definitely not json");
    const user = userEvent.setup();
    render(<CollectionsOverview />);

    expect(
      await screen.findByRole("heading", { name: /your saved collections could not be read/i }),
    ).toBeVisible();
    expect(screen.getByText(/nothing has been changed or deleted/i)).toBeVisible();

    const reset = screen.getByRole("button", { name: /reset local collections/i });
    await user.click(reset); // arm only
    expect(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY)).toBe("{definitely not json");

    await user.click(screen.getByRole("button", { name: /confirm reset/i }));
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY) ?? "{}")).toEqual({
        collections: [],
        version: 1,
      });
    });
  });

  it("explains unavailable storage instead of failing", async () => {
    reseedStorage("");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("no", "SecurityError");
    });
    try {
      const user = userEvent.setup();
      render(<CollectionsOverview />);
      await user.click(await screen.findByRole("button", { name: "+ Create a collection" }));
      const nameInput = screen.getByLabelText("Name");
      await user.type(nameInput, "Doomed");
      // The store refuses the write and the dialog announces it honestly.
      await user.click(screen.getByRole("button", { name: "Create collection" }));
      expect(await screen.findByText(/blocking local storage/i)).toBeVisible();
      expect(nameInput).toBeInvalid();
      expect(pushMock).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });
});
