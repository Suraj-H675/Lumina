import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EntityDetailResponse } from "@lumina/api-client";

const { loadObjectMock } = vi.hoisted(() => ({
  loadObjectMock: vi.fn(),
}));

vi.mock("../src/lib/server/catalog", () => ({
  loadObjectBySlugPerRequest: loadObjectMock,
}));

import ObjectPage, { createObjectMetadata } from "../src/app/objects/[slug]/route-page";
import { collectionSaveMessageSlice } from "../src/lib/collections-messages";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";

const DETAIL: EntityDetailResponse = {
  canonical_name: "51 Pegasi",
  entity_type: "star",
  id: "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
  quantities: [],
};
const SAVE_MESSAGES = collectionSaveMessageSlice(enMessages.collections);

beforeEach(() => {
  loadObjectMock.mockReset();
});

describe("Object route localization boundary", () => {
  it("creates localized metadata without rewriting canonical object identity", async () => {
    loadObjectMock.mockResolvedValue({ detail: DETAIL, kind: "ok" });
    const metadataMessages = {
      ...enMessages.object.metadata,
      description: "Fixture {name} / {entityType}.",
    };
    const entityTypes = {
      ...enMessages.entityTypes,
      star: "Fixture star",
    };

    await expect(
      createObjectMetadata(
        { params: Promise.resolve({ slug: "51-pegasi" }) },
        metadataMessages,
        entityTypes,
      ),
    ).resolves.toMatchObject({
      description: "Fixture 51 Pegasi / Fixture star.",
      title: "51 Pegasi",
    });
  });

  it("uses injected metadata titles for not-found and unavailable outcomes", async () => {
    const metadataMessages = {
      ...enMessages.object.metadata,
      notFoundTitle: "Fixture not found",
      unavailableTitle: "Fixture unavailable",
    };

    loadObjectMock.mockResolvedValueOnce({ kind: "object-not-found" });
    await expect(
      createObjectMetadata(
        { params: Promise.resolve({ slug: "missing" }) },
        metadataMessages,
        enMessages.entityTypes,
      ),
    ).resolves.toEqual({ title: "Fixture not found" });

    loadObjectMock.mockResolvedValueOnce({ kind: "unavailable" });
    await expect(
      createObjectMetadata(
        { params: Promise.resolve({ slug: "temporary" }) },
        metadataMessages,
        enMessages.entityTypes,
      ),
    ).resolves.toEqual({ title: "Fixture unavailable" });
  });

  it("renders injected server failure states without exposing raw catalogue errors", async () => {
    const messages = {
      ...enMessages.object,
      notFound: {
        ...enMessages.object.notFound,
        browseCatalogue: "Fixture browse missing",
        title: "Fixture object missing",
      },
      unavailable: {
        ...enMessages.object.unavailable,
        browseCatalogue: "Fixture browse unavailable",
        description: "Fixture temporary catalogue failure.",
        title: "Fixture object unavailable",
      },
    };

    loadObjectMock.mockResolvedValueOnce({ kind: "object-not-found" });
    const missingView = await ObjectPage({
      collectionSaveMessages: SAVE_MESSAGES,
      entityTypeMessages: enMessages.entityTypes,
      journalEntryMessages: enMessages.journal.entry,
      locale: DEFAULT_LOCALE,
      messages,
      params: Promise.resolve({ slug: "missing-object" }),
    });
    const rendered = render(missingView);
    expect(screen.getByRole("heading", { name: "Fixture object missing" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Fixture browse missing" })).toHaveAttribute(
      "href",
      "/explore",
    );

    rendered.unmount();
    loadObjectMock.mockResolvedValueOnce({ kind: "unavailable" });
    const unavailableView = await ObjectPage({
      collectionSaveMessages: SAVE_MESSAGES,
      entityTypeMessages: enMessages.entityTypes,
      journalEntryMessages: enMessages.journal.entry,
      locale: DEFAULT_LOCALE,
      messages,
      params: Promise.resolve({ slug: "temporary-object" }),
    });
    render(unavailableView);
    expect(screen.getByRole("heading", { name: "Fixture object unavailable" })).toBeVisible();
    expect(screen.getByText("Fixture temporary catalogue failure.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Fixture browse unavailable" })).toHaveAttribute(
      "href",
      "/explore",
    );
  });
});
