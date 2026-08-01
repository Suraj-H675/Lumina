import { expect, test } from "@playwright/test";

import {
  assertStatusStubClean,
  clearStatusStubViolations,
  generateUnexpectedStatusStubTraffic,
  setStatusStubMode,
} from "./support/status-stub-control";

test.describe("honest API foundation status", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({}, testInfo) => {
    await setStatusStubMode(testInfo, "disconnect");
  });

  test.afterEach(async ({}, testInfo) => {
    await assertStatusStubClean(testInfo);
    await setStatusStubMode(testInfo, "disconnect");
  });

  test("records unexpected traffic and makes the final clean assertion fail", async ({}, testInfo) => {
    await generateUnexpectedStatusStubTraffic(testInfo);

    await expect(assertStatusStubClean(testInfo)).rejects.toThrow(
      "Status stub recorded process-owned request violations.",
    );

    await clearStatusStubViolations(testInfo);
    await assertStatusStubClean(testInfo);
  });

  test("renders deterministic immediate transport failure without an API process", async ({
    page,
  }) => {
    await page.goto("/status");

    await expect(page.getByRole("heading", { level: 2, name: "API unavailable" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Return to the Lumina foundation home page" }),
    ).toHaveAttribute("href", "/");
  });

  test("switches the same reserved stub into a controlled ready state", async ({
    page,
  }, testInfo) => {
    await setStatusStubMode(testInfo, "ready");

    await page.goto("/status");

    await expect(
      page.getByRole("heading", { level: 2, name: "API available and ready" }),
    ).toBeVisible();
    await expect(page.getByText("e2e-fixture")).toBeVisible();
    await expect(page.getByText("v1", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/catalog is operational|provider status/i);
  });
});
