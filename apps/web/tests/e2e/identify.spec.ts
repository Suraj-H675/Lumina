import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { setIdentificationStubMode } from "./support/status-stub-control";

const jobId = "72000000-0000-4000-8000-000000000001";

const image = {
  buffer: Buffer.from("phase-6a-private-fixture", "utf8"),
  mimeType: "image/png",
  name: "night-field.png",
};

test.describe("Phase 6 — private identification", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({}, testInfo) => {
    await setIdentificationStubMode(testInfo, "fake");
  });
  test("keeps the authoritative privacy and retention policy useful without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/identify");

    await expect(
      page.getByRole("heading", { level: 1, name: "Identify an astronomical image" }),
    ).toBeVisible();
    await expect(page.getByText(/No remote plate-solving service is contacted/i)).toBeVisible();
    await expect(page.getByText(/configured retention period is 24 hours/i)).toBeVisible();
    await expect(
      page.getByText(
        /JavaScript is required to upload, poll this temporary job, and request deletion/i,
      ),
    ).toBeVisible();

    await context.close();
  });

  test("runs the fake private job to synthetic success and deletes it explicitly", async ({
    page,
  }) => {
    const remoteRequests: string[] = [];
    const statusRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (!["127.0.0.1", "localhost"].includes(url.hostname)) remoteRequests.push(request.url());
      if (
        request.method() === "GET" &&
        /\/api\/v1\/identification\/submissions\/[0-9a-f-]{36}$/u.test(url.pathname)
      ) {
        statusRequests.push(request.url());
      }
    });

    await page.goto("/identify");
    await page.getByLabel("JPEG or PNG image").setInputFiles(image);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start private infrastructure check" }).click();

    await expect(page.getByText(new RegExp(jobId))).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Fake solver completed" })).toBeVisible(
      {
        timeout: 4_000,
      },
    );
    await expect(page.getByText(/This is not an astrometric solution/i)).toBeVisible();
    await expect(
      page.getByText(/No RA\/Dec, WCS, orientation, scale, or detected objects/i),
    ).toBeVisible();
    expect(statusRequests.length).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: "Delete temporary upload" }).click();
    await expect(page.getByRole("button", { name: "Confirm delete" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByRole("status", { name: "Temporary submission deleted" })).toBeVisible();

    expect(remoteRequests).toEqual([]);
  });

  test("requires explicit Nova consent and keeps provider identifiers private", async ({
    page,
  }, testInfo) => {
    await setIdentificationStubMode(testInfo, "nova");
    const novaBrowserRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).hostname === "nova.astrometry.net") {
        novaBrowserRequests.push(request.url());
      }
    });

    await page.goto("/identify");
    await expect(page.getByText(/Remote processing requires your consent/i)).toBeVisible();
    await expect(page.getByText(/third-party Astrometry.net Nova service/i)).toBeVisible();
    const start = page.getByRole("button", { name: "Start remote plate solve" });
    await expect(start).toBeDisabled();

    await page.getByLabel("JPEG or PNG image").setInputFiles(image);
    await page.getByRole("checkbox").check();
    await start.click();

    await expect(page.getByText(/provider identifiers are kept private/i)).toBeVisible();
    await expect(page.getByText(new RegExp(jobId))).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Remote solver completed" }),
    ).toBeVisible({
      timeout: 4_000,
    });
    await expect(page.getByText("Astrometric solution available.", { exact: true })).toBeVisible();
    await expect(page.getByText(/provider-side retention or deletion limitations/i)).toBeVisible();
    expect(novaBrowserRequests).toEqual([]);
  });

  test("rejects an unsupported selected media type before upload", async ({ page }) => {
    const uploadRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/v1/identification/submissions")
      ) {
        uploadRequests.push(request.url());
      }
    });

    await page.goto("/identify");
    await page.getByLabel("JPEG or PNG image").setInputFiles({
      buffer: Buffer.from("not-an-image", "utf8"),
      mimeType: "text/plain",
      name: "private.txt",
    });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start private infrastructure check" }).click();

    await expect(page.getByRole("alert", { name: "Upload not started" })).toContainText(
      "Choose a JPEG or PNG image.",
    );
    expect(uploadRequests).toEqual([]);
  });

  test("is accessible at 320px with reduced motion and forced colors", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.goto("/identify");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const submit = page.getByRole("button", { name: "Start private infrastructure check" });
    expect((await submit.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
