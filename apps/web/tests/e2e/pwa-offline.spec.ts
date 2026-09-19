import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  LUMINA_PWA_DOCUMENT_CACHE,
  LUMINA_PWA_METADATA_CACHE,
  luminaPwaConnectivityUrl,
} from "../../src/lib/pwa-policy";

const VISITED_LESSON = "/learn/your-first-night-sky/start-with-the-sky";
const UNVISITED_LESSON = "/learn/your-first-night-sky/read-the-moon";
const OBSERVING_NIGHT = "2026-08-27";

async function waitForWorkerControl(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    return registration.active !== null && navigator.serviceWorker.controller !== null;
  });
}

async function installAndCacheVisitedLesson(page: Page): Promise<void> {
  await page.goto(VISITED_LESSON);
  await expect(
    page.getByRole("heading", { level: 1, name: "Start with the sky you have" }),
  ).toBeVisible();
  await waitForWorkerControl(page);

  // The first navigation installs/claims the worker. Reload once while online
  // so the controlled navigation and its hashed Next assets become visited
  // offline material.
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Start with the sky you have" }),
  ).toBeVisible();
}

test.describe("Phase 8B — PWA/offline foundation", () => {
  test("reloads a visited approved lesson offline and exposes its Lumina cache time", async ({
    context,
    page,
  }) => {
    await installAndCacheVisitedLesson(page);

    expect(
      await page.evaluate(
        async ({ cacheName, path }) => {
          const cache = await caches.open(cacheName);
          return Boolean(
            await cache.match(
              new Request(`${location.origin}${path}`, { headers: { Accept: "text/html" } }),
            ),
          );
        },
        { cacheName: LUMINA_PWA_DOCUMENT_CACHE, path: VISITED_LESSON },
      ),
    ).toBe(true);

    try {
      await context.setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" });

      expect(
        await page.evaluate(
          async ({ cacheName, connectivityUrl }) => {
            const cache = await caches.open(cacheName);
            const response = await cache.match(connectivityUrl);
            return response === undefined ? null : await response.json();
          },
          {
            cacheName: LUMINA_PWA_METADATA_CACHE,
            connectivityUrl: luminaPwaConnectivityUrl("http://127.0.0.1:3000"),
          },
        ),
      ).toMatchObject({ networkAvailable: false });
      await expect(
        page.getByRole("heading", { level: 1, name: "Start with the sky you have" }),
      ).toBeVisible();
      const offlineStatus = page.getByRole("status").filter({ hasText: "You are offline" });
      await expect(offlineStatus).toContainText("This page is an offline copy saved by Lumina");
      await expect(offlineStatus.locator("time")).toHaveAttribute(
        "datetime",
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u,
      );
    } finally {
      await context.setOffline(false);
    }
  });

  test("uses the explicit fallback for an approved page that was never visited", async ({
    context,
    page,
  }) => {
    await installAndCacheVisitedLesson(page);

    try {
      await context.setOffline(true);
      await page.goto(UNVISITED_LESSON, { waitUntil: "domcontentloaded" });

      await expect(
        page.getByRole("heading", { level: 1, name: "Lumina is offline" }),
      ).toBeVisible();
      await expect(
        page.getByText(/pages you visited while online may still be available/i),
      ).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Read the Moon" })).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });

  test("does not replay a visited live Space Now document after connectivity is lost", async ({
    context,
    page,
  }) => {
    await installAndCacheVisitedLesson(page);
    await page.goto("/now");
    await expect(page.getByRole("heading", { level: 1, name: "Space Now" })).toBeVisible();
    await expect(page.getByText("Retrieved at (UTC)")).toBeVisible();

    expect(
      await page.evaluate(async (cacheName) => {
        const cache = await caches.open(cacheName);
        return Boolean(
          await cache.match(
            new Request(`${location.origin}/now`, { headers: { Accept: "text/html" } }),
          ),
        );
      }, LUMINA_PWA_DOCUMENT_CACHE),
    ).toBe(false);

    try {
      await context.setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" });

      await expect(
        page.getByRole("heading", { level: 1, name: "Lumina is offline" }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Space Now" })).toHaveCount(0);
      await expect(page.getByText("Retrieved at (UTC)")).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });

  test("reopens an explicitly saved observation snapshot offline without catalog or provider data", async ({
    context,
    page,
  }) => {
    await page.goto(`/observe?object=k2-18&date=${OBSERVING_NIGHT}`);
    await expect(page.getByRole("heading", { level: 1, name: "K2-18" })).toBeVisible();
    await waitForWorkerControl(page);
    await page.getByLabel("Latitude").fill("12.972");
    await page.getByLabel("Longitude").fill("77.594");
    await page.getByRole("button", { name: /calculate with these coordinates/i }).click();
    await expect(page.getByRole("button", { name: "Save plan" })).toBeVisible();

    await page.getByRole("button", { name: "Save plan" }).click();
    const savedLink = page.getByRole("link", { name: "Open saved plan" });
    await expect(savedLink).toBeVisible();
    const href = await savedLink.getAttribute("href");
    expect(href).toMatch(
      /^\/observe\?saved=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(href).not.toContain("12.972");
    expect(href).not.toContain("77.594");
    expect(href).not.toContain("object=");

    expect(
      await page.evaluate(async (cacheName) => {
        const cache = await caches.open(cacheName);
        return Boolean(
          await cache.match(
            new Request(`${location.origin}/observe`, { headers: { Accept: "text/html" } }),
          ),
        );
      }, LUMINA_PWA_DOCUMENT_CACHE),
    ).toBe(true);

    const unexpectedDataRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/data/") ||
        url.origin !== "http://127.0.0.1:3000"
      ) {
        unexpectedDataRequests.push(request.url());
      }
    });

    try {
      await context.setOffline(true);
      await Promise.all([page.waitForURL(href!), savedLink.click()]);

      await expect(page.getByRole("heading", { level: 1, name: "K2-18" })).toBeVisible();
      await expect(page.getByText(/saved snapshot, not a current recomputation/i)).toBeVisible();
      await expect(page.getByText(/12\.972000°/u)).toBeVisible();
      await expect(page.getByText(/77\.594000°/u)).toBeVisible();
      await expect(page.getByText(/astronomy-engine 2\.1\.19/i)).toBeVisible();
      await expect(page.getByRole("button", { name: "Use my location" })).toHaveCount(0);
      expect(unexpectedDataRequests).toEqual([]);
    } finally {
      await context.setOffline(false);
    }
  });

  test("keeps storage management truthful, accessible, and usable at narrow forced-colour 200% presentation", async ({
    page,
  }) => {
    await page.goto(`/observe?object=k2-18&date=${OBSERVING_NIGHT}`);
    await waitForWorkerControl(page);
    await page.getByLabel("Latitude").fill("12.972");
    await page.getByLabel("Longitude").fill("77.594");
    await page.getByRole("button", { name: /calculate with these coordinates/i }).click();
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(page.getByRole("link", { name: "Open saved plan" })).toBeVisible();

    await page.goto("/offline/storage");
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });

    await expect(
      page.getByRole("heading", { level: 1, name: "Storage and offline copies" }),
    ).toBeVisible();
    await expect(page.getByText(/1 saved observation plan/i)).toBeVisible();
    await expect(page.getByText(/origin-wide estimate/i)).toBeVisible();

    const clearButton = page.getByRole("button", { name: "Clear offline copies" });
    await clearButton.focus();
    await expect(clearButton).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Confirm clear offline copies" }).press("Enter");
    await expect(page.getByRole("status")).toContainText(/Personal browser data was not deleted/i);
    await expect(page.getByText(/1 saved observation plan/i)).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);

    // 200% presentation from a 640 CSS px viewport exercises the same 320 CSS px
    // reflow target without accidentally testing an out-of-scope 160 CSS px layout.
    await page.setViewportSize({ width: 640, height: 720 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("keeps the offline-storage controls usable in a real touch-enabled narrow context", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { height: 720, width: 320 },
    });
    const page = await context.newPage();
    try {
      await page.goto("/offline/storage");
      await expect(
        page.getByRole("heading", { level: 1, name: "Storage and offline copies" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Clear offline copies" }).tap();
      await expect(
        page.getByRole("button", { name: "Confirm clear offline copies" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).tap();
      await expect(page.getByRole("button", { name: "Confirm clear offline copies" })).toHaveCount(
        0,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
      ).toBe(false);
    } finally {
      await context.close();
    }
  });
});
