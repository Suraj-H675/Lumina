import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/server/api-origin", () => ({
  resolveWebApiOrigin: () => ({ valid: false }),
}));

import TonightPage, { createTonightMetadata } from "../src/app/tonight/route-page";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { TonightMessages } from "../src/lib/i18n/messages/types";

describe("Tonight route localization boundary", () => {
  it("creates metadata from the injected Tonight message group", () => {
    const messages: TonightMessages = {
      ...enMessages.tonight,
      metadataDescription: "Fixture Tonight metadata description",
      metadataTitle: "Fixture Tonight metadata title",
    };

    expect(createTonightMetadata(messages)).toMatchObject({
      description: "Fixture Tonight metadata description",
      title: "Fixture Tonight metadata title",
    });
  });

  it("forwards the explicit locale/message slices and only accepts a valid first date value", async () => {
    const page = await TonightPage({
      collectionStateMessages: {
        failures: enMessages.collections.failures,
        shared: enMessages.collections.shared,
      },
      coordinateDisclosureMessages: enMessages.coordinateDisclosure,
      entityTypeMessages: enMessages.entityTypes,
      locale: DEFAULT_LOCALE,
      messages: enMessages.tonight,
      searchParams: Promise.resolve({ date: ["2026-08-27", "2099-01-01"] }),
    });

    expect(page.props).toMatchObject({
      coordinateDisclosureMessages: enMessages.coordinateDisclosure,
      entityTypeMessages: enMessages.entityTypes,
      initialDate: "2026-08-27",
      locale: DEFAULT_LOCALE,
      messages: enMessages.tonight,
    });

    const invalidDatePage = await TonightPage({
      collectionStateMessages: {
        failures: enMessages.collections.failures,
        shared: enMessages.collections.shared,
      },
      coordinateDisclosureMessages: enMessages.coordinateDisclosure,
      entityTypeMessages: enMessages.entityTypes,
      locale: DEFAULT_LOCALE,
      messages: enMessages.tonight,
      searchParams: Promise.resolve({ date: "not-a-night" }),
    });

    expect(invalidDatePage.props.initialDate).toBeUndefined();
  });
});
