import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  setIdentificationStubCondition,
  setIdentificationStubMode,
} from "./support/status-stub-control";

const jobId = "72000000-0000-4000-8000-000000000001";
const WWT_HOSTS = new Set([
  "web.wwtassets.org",
  "cdn.worldwidetelescope.org",
  "www.worldwidetelescope.org",
]);
const DSS_ROOT_TILE = "https://cdn.worldwidetelescope.org/wwtweb/dss.aspx?q=0,0,0";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXkAAAAASUVORK5CYII=",
  "base64",
);

const image = {
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGPgEZKjKWIYtWDUglELRi0YtWDUglELRi0YtWDUglELhooFABlh8AHn1xdIAAAAAElFTkSuQmCC",
    "base64",
  ),
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

  test("shows truthful Nova capacity and outage states without browser-direct provider traffic", async ({
    page,
  }, testInfo) => {
    await setIdentificationStubMode(testInfo, "nova");
    await setIdentificationStubCondition(testInfo, "busy");
    const novaBrowserRequests: string[] = [];
    const solutionRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname === "nova.astrometry.net") novaBrowserRequests.push(request.url());
      if (/\/api\/v1\/identification\/submissions\/[0-9a-f-]{36}\/solution$/u.test(url.pathname)) {
        solutionRequests.push(request.url());
      }
    });

    await page.goto("/identify");
    await page.getByLabel("JPEG or PNG image").setInputFiles(image);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start remote plate solve" }).click();

    await expect(page.getByText(/Astrometry.net is currently at capacity/i)).toBeVisible({
      timeout: 4_000,
    });
    await setIdentificationStubCondition(testInfo, "unavailable");
    await expect(page.getByText(/Astrometry.net is temporarily unavailable/i)).toBeVisible({
      timeout: 4_000,
    });
    expect(solutionRequests).toEqual([]);
    expect(novaBrowserRequests).toEqual([]);
  });

  test("requires explicit Nova consent and keeps provider identifiers private", async ({
    page,
  }, testInfo) => {
    await setIdentificationStubMode(testInfo, "nova");
    const novaBrowserRequests: string[] = [];
    const solutionRequests: string[] = [];
    const identificationRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname === "nova.astrometry.net") novaBrowserRequests.push(request.url());
      if (url.pathname.startsWith("/api/v1/identification/")) {
        identificationRequests.push(request.url());
      }
      if (/\/api\/v1\/identification\/submissions\/[0-9a-f-]{36}\/solution$/u.test(url.pathname)) {
        solutionRequests.push(request.url());
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
    await expect(
      page.getByRole("heading", { name: "Solved field and WCS-backed annotations" }),
    ).toBeVisible();
    await expect(page.getByText("82.500000°")).toBeVisible();
    await expect(page.getByText("ICRS", { exact: true })).toBeVisible();

    const solvedImage = page.getByRole("img", { name: "Solved astronomical image", exact: true });
    await expect(solvedImage).toHaveAttribute("viewBox", "0 0 32 32");
    await expect(solvedImage.getByText("Rigel")).toBeVisible();
    expect(solutionRequests).toHaveLength(1);

    await page.getByRole("button", { name: "Load more annotations" }).click();
    await expect(page.getByText(/M42/)).toBeVisible();
    await expect(page.getByText(/All available annotation pages are loaded/i)).toBeVisible();
    expect(solutionRequests).toHaveLength(2);

    await page.getByRole("checkbox", { name: "Star" }).uncheck();
    await expect(solvedImage.getByText("Rigel")).toHaveCount(0);
    await expect(solvedImage.getByText("Orion Nebula")).toBeVisible();
    await page.getByRole("radio", { name: "Original" }).check();
    await expect(solvedImage.getByText("Orion Nebula")).toHaveCount(0);
    await page.getByLabel(/Zoom:/i).fill("2");
    await expect(page.getByText("Zoom: 2.0×")).toBeVisible();

    const requestsBeforeCaptureChecks = identificationRequests.length;
    await page.getByRole("button", { name: "Run local capture checks" }).click();
    await expect(page.getByText("32 × 32 pixels")).toBeVisible();
    await expect(page.getByRole("list", { name: "Display-RGB luma histogram" })).toBeVisible();
    expect(identificationRequests).toHaveLength(requestsBeforeCaptureChecks);

    await page.getByLabel("Journal title").fill("Orion solved field");
    await page.getByRole("button", { name: "Save to local journal" }).click();
    await expect(page.getByText(/Saved to this browser's local journal/i)).toBeVisible();
    await page.getByRole("link", { name: "Open Journal" }).click();
    await expect(page).toHaveURL(/\/journal$/u);
    await expect(page.getByRole("heading", { name: "Orion solved field" })).toBeVisible();
    await expect(page.getByText(/only in this browser's local IndexedDB/i)).toBeVisible();
    await expect(page.getByText(/82\.500000° RA, -6\.200000° Dec/i)).toBeVisible();
    await expect(page.getByText("Rigel")).toBeVisible();
    await expect(page.getByText("M42")).toBeVisible();
    await page.getByRole("button", { name: "Delete local journal entry" }).click();
    await page.getByRole("button", { name: "Confirm local delete" }).click();
    await expect(page.getByRole("heading", { name: "No journal entries yet" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    expect(novaBrowserRequests).toEqual([]);
  });

  test("opens reviewed survey context only after explicit activation", async ({
    page,
  }, testInfo) => {
    await setIdentificationStubMode(testInfo, "nova");
    const wwtRequests: Array<{ body: string | null; url: string }> = [];
    await page.route("https://cdn.worldwidetelescope.org/**", async (route) => {
      if (route.request().url() === DSS_ROOT_TILE) {
        await route.fulfill({ body: ONE_PIXEL_PNG, contentType: "image/png", status: 200 });
      } else {
        await route.abort("failed");
      }
    });
    await page.route("https://www.worldwidetelescope.org/**", (route) => route.abort("failed"));
    await page.route("https://web.wwtassets.org/**", (route) => route.abort("failed"));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (WWT_HOSTS.has(url.hostname)) {
        wwtRequests.push({ body: request.postData(), url: request.url() });
      }
    });

    await page.goto("/identify");
    await page.getByLabel("JPEG or PNG image").setInputFiles(image);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start remote plate solve" }).click();
    await expect(page.getByRole("heading", { name: "Compare with survey context" })).toBeVisible();
    await expect(page.getByRole("img", { name: /survey comparison/i })).toHaveAttribute(
      "src",
      /^blob:/u,
    );
    expect(wwtRequests).toEqual([]);

    await page.getByRole("button", { name: "Open survey comparison" }).click();
    await expect(page.getByText("Survey comparison ready.")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("region", { name: "WorldWide Telescope survey comparison" }).locator("canvas"),
    ).toBeVisible();
    expect(wwtRequests.length).toBeGreaterThan(0);
    expect(wwtRequests.every((request) => request.body === null)).toBe(true);
    expect(wwtRequests.map((request) => request.url).join("\n")).not.toContain(image.name);
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
