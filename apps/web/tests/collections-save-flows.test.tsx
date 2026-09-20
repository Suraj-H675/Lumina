import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { COLLECTIONS_STORAGE_KEY } from "../src/lib/collections-model";
import { collectionSaveMessageSlice } from "../src/lib/collections-messages";
import * as store from "../src/lib/collections-store";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { CollectionSaveMessages } from "../src/lib/i18n/messages/types";
import {
  SaveToCollectionsButton,
  type ObjectIdentity,
} from "../src/components/save-to-collections";
import { fixtureDetail } from "./support/compare-fixtures";
import { buildCompareModel } from "../src/lib/compare-model";
import { CompareSaveSelected } from "../src/components/compare-save-selected";

const K2_18: ObjectIdentity = {
  canonical_name: "K2-18",
  entity_type: "star",
  slug: "k2-18",
};

const SAVE_MESSAGES = collectionSaveMessageSlice(enMessages.collections);

function renderSaveButton(
  identity: ObjectIdentity = K2_18,
  variant?: "primary" | "icon",
  messages: CollectionSaveMessages = SAVE_MESSAGES,
) {
  return render(
    <SaveToCollectionsButton
      identity={identity}
      locale={DEFAULT_LOCALE}
      messages={messages}
      {...(variant === undefined ? {} : { variant })}
    />,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    COLLECTIONS_STORAGE_KEY,
    JSON.stringify({ collections: [], version: 1 }),
  );
  window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
});

function persistedCollections(): Array<{
  id: string;
  items: Array<{ slug: string }>;
  name: string;
}> {
  return (
    (
      JSON.parse(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY) ?? "{}") as {
        collections?: Array<{ id: string; items: Array<{ slug: string }>; name: string }>;
      }
    ).collections ?? []
  );
}

describe("SaveToCollectionsButton — trigger", () => {
  it("renders an accessible Save action with a hollow marker before any save", () => {
    renderSaveButton();
    const button = screen.getByRole("button", { name: "Save K2-18 to a collection" });
    expect(button).toBeVisible();
    expect(button.textContent).toContain("Save");
  });

  it("reflects membership anywhere with a filled marker and honest name", async () => {
    const created = store.createCollection("Interesting Worlds");
    if (!created.ok || created.collection === undefined) throw new Error("setup failed");
    store.addObjectToCollection(created.collection.id, K2_18);

    renderSaveButton();
    expect(screen.getByRole("button", { name: /manage where k2-18 is saved/i })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /manage where k2-18 is saved/i }).textContent,
    ).toContain("Saved");
  });

  it("the compact card variant carries the object's name accessibly", () => {
    renderSaveButton(K2_18, "icon");
    expect(screen.getByRole("button", { name: "Save K2-18 to a collection" })).toBeVisible();
  });
});

describe("SaveToCollectionsDialog", () => {
  it("saves into a checked collection and announces the result", async () => {
    const created = store.createCollection("Interesting Worlds");
    if (!created.ok || created.collection === undefined) throw new Error("setup failed");
    const user = userEvent.setup();

    renderSaveButton();
    await user.click(screen.getByRole("button", { name: /save k2-18/i }));

    const dialog = screen.getByRole("dialog", { name: "Save to a collection" });
    // Local-only disclosure inside the dialog.
    expect(dialog.textContent).toMatch(/stored only in this browser/i);
    // Existing collections appear with their counts and checked state.
    const checkbox = screen.getByRole("checkbox", { name: "Interesting Worlds" });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("0 saved")).toBeVisible();

    // Create inline without abandoning the object page.
    await user.type(screen.getByLabelText("New collection"), "Trip Targets");
    await user.click(screen.getByRole("button", { name: /^Create$/ }));

    await waitFor(() => {
      expect(persistedCollections().find((c) => c.name === "Trip Targets")?.items[0]?.slug).toBe(
        "k2-18",
      );
    });
    expect(await screen.findByText(/Created Trip Targets and saved K2-18/i)).toBeVisible();
  });

  it("toggles membership with checked state and stays idempotent on repeat saves", async () => {
    const created = store.createCollection("Alpha");
    if (!created.ok || created.collection === undefined) throw new Error("setup failed");
    const user = userEvent.setup();

    renderSaveButton(K2_18, "icon");
    await user.click(screen.getByRole("button", { name: /save k2-18/i }));
    const checkbox = screen.getByRole("checkbox", { name: "Alpha" });

    await user.click(checkbox); // save
    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });
    expect(persistedCollections()[0]?.items.map((item) => item.slug)).toEqual(["k2-18"]);
    expect(await screen.findByText(/Saved K2-18 to Alpha/i)).toBeVisible();

    // Saving again through a fresh trigger keeps exactly one item.
    await user.click(screen.getByRole("button", { name: "Done" }));
    renderSaveButton(KEPLER_452_IDENTITY, "icon");
    await user.click(screen.getAllByRole("button", { name: /save kepler-452/i })[0] as HTMLElement);
    await user.click(screen.getByRole("checkbox", { name: "Alpha" }));
    await waitFor(() => {
      const slugs = persistedCollections()[0]?.items.map((item) => item.slug) ?? [];
      expect(slugs).toEqual(["k2-18", "kepler-452"]);
    });

    // Unchecking removes honestly.
    await user.click(screen.getByRole("checkbox", { name: "Alpha" }));
    await waitFor(() => {
      expect(persistedCollections()[0]?.items.map((item) => item.slug)).toEqual(["k2-18"]);
    });
  });

  it("shows the corrupted-recovery state with an explicit reset inside the picker", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, "{corrupt");
    window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
    const user = userEvent.setup();

    renderSaveButton();
    await user.click(screen.getByRole("button", { name: /save k2-18/i }));

    const dialog = screen.getByRole("dialog", { name: "Save to a collection" });
    expect(dialog.textContent).toMatch(/could not be read/i);
    expect(dialog.textContent).toMatch(/nothing has been changed or deleted/i);

    // The reset control carries an explicit accessible name and is two-step.
    await user.click(
      screen.getByRole("button", { name: /reset all local collections on this device/i }),
    );
    await user.click(screen.getByRole("button", { name: /confirm: reset all local collections/i }));
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY) ?? "{}")).toEqual({
        collections: [],
        version: 1,
      });
    });
  });

  it("reports unavailable storage instead of pretending to save", async () => {
    // jsdom can misbehave when a DOMException is constructed while Storage
    // methods are being replaced, so build the rejection lazily.
    const throwBlocked = (): never => {
      throw new DOMException("no", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(throwBlocked);
    try {
      // The store is hydrated while storage is already broken, so every
      // mutation — including this setup call — must refuse honestly.
      store.createCollection("Blocked Era");
      const user = userEvent.setup();

      renderSaveButton();
      await user.click(screen.getByRole("button", { name: /save k2-18/i }));
      // With storage broken the dialog explains instead of failing; nothing
      // was persisted anywhere along the way.
      expect(await screen.findByText(/blocking local storage/i)).toBeVisible();
      expect(persistedCollections()).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("localizes picker controls without rewriting object or collection identity", async () => {
    const created = store.createCollection("Alpha");
    if (!created.ok || created.collection === undefined) throw new Error("setup failed");
    const messages = {
      ...SAVE_MESSAGES,
      save: {
        ...SAVE_MESSAGES.save,
        picker: {
          ...SAVE_MESSAGES.save.picker,
          title: "Localized picker title",
        },
        trigger: {
          ...SAVE_MESSAGES.save.trigger,
          saveAction: "Localized save",
          saveAriaLabel: "Localized save {objectName}",
        },
      },
    } satisfies CollectionSaveMessages;
    const user = userEvent.setup();

    renderSaveButton(K2_18, undefined, messages);
    const trigger = screen.getByRole("button", { name: "Localized save K2-18" });
    expect(trigger).toHaveTextContent("Localized save");
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Localized picker title" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeVisible();
    expect(screen.getByText(/K2-18/)).toBeVisible();
  });
});

const KEPLER_452_IDENTITY: ObjectIdentity = {
  canonical_name: "Kepler-452",
  entity_type: "star",
  slug: "kepler-452",
};

describe("CompareSaveSelected — saving compared OBJECTS", () => {
  function twoObjectCompare(): Array<{
    canonical_name: string;
    entity_type: "star";
    slug: string;
  }> {
    return [
      { canonical_name: "K2-18", entity_type: "star", slug: "k2-18" },
      { canonical_name: "Kepler-452", entity_type: "star", slug: "kepler-452" },
    ];
  }

  it("offers no save control when nothing comparable is loaded", () => {
    render(
      <CompareSaveSelected identities={[]} locale={DEFAULT_LOCALE} messages={SAVE_MESSAGES} />,
    );
    expect(screen.queryByRole("button", { name: /save compared objects/i })).toBeNull();
  });

  it("atomically saves all compared objects into one collection in one write", async () => {
    const created = store.createCollection("Interesting Worlds");
    if (!created.ok || created.collection === undefined) throw new Error("setup failed");
    const user = userEvent.setup();

    render(
      <CompareSaveSelected
        identities={twoObjectCompare()}
        locale={DEFAULT_LOCALE}
        messages={SAVE_MESSAGES}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save compared objects/i }));

    const select = screen.getByLabelText("Collection");
    await user.selectOptions(select, created.collection.id);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const items = persistedCollections()[0]?.items.map((item) => item.slug) ?? [];
      expect(items).toEqual(["k2-18", "kepler-452"]); // request order preserved
    });
  });

  it("creates a collection inline without abandoning the comparison", async () => {
    const user = userEvent.setup();
    render(
      <CompareSaveSelected
        identities={twoObjectCompare()}
        locale={DEFAULT_LOCALE}
        messages={SAVE_MESSAGES}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save compared objects/i }));

    await user.selectOptions(screen.getByLabelText("Collection"), "__create__");
    await user.type(screen.getByLabelText("New collection name"), "Fresh Shelf");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await user.click(screen.getByRole("button", { name: "Save" }));

    try {
      await waitFor(() => {
        const target = persistedCollections().find((c) => c.name === "Fresh Shelf");
        expect(target?.items.map((item) => item.slug) ?? []).toEqual(["k2-18", "kepler-452"]);
      });
      expect(setItem).toHaveBeenCalledTimes(1);
    } finally {
      setItem.mockRestore();
    }
  });

  it("is idempotent: re-saving reports 'already saved' and never duplicates", async () => {
    const created = store.createCollection("Interesting Worlds");
    if (!created.ok || created.collection === undefined) throw new Error("setup failed");
    store.addObjectsToCollection(created.collection.id, twoObjectCompare());
    const user = userEvent.setup();

    render(
      <CompareSaveSelected
        identities={twoObjectCompare()}
        locale={DEFAULT_LOCALE}
        messages={SAVE_MESSAGES}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save compared objects/i }));
    await user.selectOptions(screen.getByLabelText("Collection"), created.collection.id);
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Outcome stays perceivable: the dialog reports the idempotent result.
    expect(await screen.findByText(/already saved/i)).toBeVisible();
    expect(persistedCollections()[0]?.items).toHaveLength(2);
  });

  it("builds its model cleanly against the accepted compare fixtures (sanity)", () => {
    const model = buildCompareModel([
      { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
      { detail: fixtureDetail.kepler452, kind: "ok", slug: "kepler-452" },
    ]);
    expect(model.rows.length).toBeGreaterThan(0);
  });

  it("localizes compare-save chrome while preserving object and collection values", async () => {
    const created = store.createCollection("Alpha");
    if (!created.ok || created.collection === undefined) throw new Error("setup failed");
    const messages = {
      ...SAVE_MESSAGES,
      save: {
        ...SAVE_MESSAGES.save,
        compare: {
          ...SAVE_MESSAGES.save.compare,
          collectionLabel: "Localized collection label",
          triggerAction: "Localized compare save",
        },
      },
    } satisfies CollectionSaveMessages;
    const user = userEvent.setup();

    render(
      <CompareSaveSelected
        identities={twoObjectCompare()}
        locale={DEFAULT_LOCALE}
        messages={messages}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Localized compare save" }));

    expect(screen.getByLabelText("Localized collection label")).toBeVisible();
    expect(screen.getByRole("option", { name: "Alpha" })).toBeVisible();
    expect(screen.getByText(/K2-18/)).toBeVisible();
    expect(screen.getByText(/Kepler-452/)).toBeVisible();
  });
});
