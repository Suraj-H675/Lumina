import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 3B — Scale Explorer", () => {
  test("publishes the root canonical URL for valid representations and noindexes invalid state", async ({
    page,
  }) => {
    const encodedSun = encodeURIComponent(
      JSON.stringify({ model_version: "scale-explorer-v1", node_id: "sun", version: 1 }),
    );
    for (const path of [
      "/lab/scale-explorer",
      "/lab/scale-explorer/sun",
      `/lab/scale-explorer?state=${encodedSun}`,
    ]) {
      await page.goto(path);
      const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonicalHref).not.toBeNull();
      const canonical = new URL(canonicalHref!, page.url());
      expect(canonical.pathname).toBe("/lab/scale-explorer");
      expect(canonical.search).toBe("");
      expect(canonical.hash).toBe("");
    }

    await page.goto("/lab/scale-explorer/invalid-state");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  });

  test("supports keyboard exploration, a useful data alternative, reduced motion, and narrow widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/lab/scale-explorer");

    await expect(page.getByRole("heading", { level: 1, name: "Scale Explorer" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Text and data alternative" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText(/Display coordinate: 0–100%/i)).toBeVisible();
    await expect(page.getByText("Selected node marker")).toBeVisible();
    await expect(page.getByText("Other curated node marker")).toBeVisible();

    const slider = page.getByRole("slider", { name: "Curated scale position" });
    await slider.focus();
    await expect(slider).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { level: 2, name: "Neptune" })).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuetext", /Neptune/);

    const resetButton = page.getByRole("button", { name: "Reset to Earth" });
    expect((await resetButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);

    const cdp = await page.context().newCDPSession(page);
    const accessibilityTree = await cdp.send("Accessibility.getFullAXTree");
    const accessibleNames = accessibilityTree.nodes
      .map((node) => node.name?.value)
      .filter((name): name is string => typeof name === "string");
    expect(accessibleNames).toContain("Earth");
    expect(accessibleNames).toContain("Text and data alternative");
  });

  test("loads an encoded reproducible state and exposes the cited numeric result", async ({
    page,
  }) => {
    const encodedState = encodeURIComponent(
      JSON.stringify({ model_version: "scale-explorer-v1", node_id: "sun", version: 1 }),
    );
    await page.goto(`/lab/scale-explorer?state=${encodedState}`);

    await expect(page.getByRole("heading", { level: 2, name: "Sun" })).toBeVisible();
    await expect(page.getByText("about 1.4 million km characteristic diameter")).toBeVisible();
    await expect(page.getByText(/track is a diagram, not a physical arrangement/i)).toBeVisible();
    await expect(page.getByText("nasa-solar-system-sizes").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Comparison evidence" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "NASA Sun facts" })).toHaveAttribute(
      "href",
      "https://science.nasa.gov/sun/facts/",
    );

    await page.getByRole("button", { name: "Copy share link" }).click();
    await expect(page.getByLabel("Share link")).toHaveValue(/state=/);
    await expect(page.getByText(/share link copied|share link ready below/i)).toBeVisible();
  });

  test("rejects malformed incoming state and recovers through reset", async ({ page }) => {
    await page.goto("/lab/scale-explorer?state=not-json");

    const invalidStateAlert = page.getByRole("alert", {
      name: /the shared scale state was not valid/i,
    });
    await expect(invalidStateAlert).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();
    await page.getByRole("button", { name: "Reset to Earth" }).click();
    await expect(invalidStateAlert).toHaveCount(0);
    await expect(page).toHaveURL("/lab/scale-explorer");
    await expect(page.getByText(/scale explorer reset to earth/i)).toBeVisible();
  });

  test("canonicalizes state copied from a direct static node route", async ({ browser }) => {
    const context = await browser.newContext();
    const interactivePage = await context.newPage();
    const encodedEarth = encodeURIComponent(
      JSON.stringify({ model_version: "scale-explorer-v1", node_id: "earth", version: 1 }),
    );
    await interactivePage.goto(`/lab/scale-explorer/sun?state=${encodedEarth}`);
    await expect(interactivePage.getByRole("heading", { level: 2, name: "Sun" })).toBeVisible();

    await interactivePage.getByRole("button", { name: "Reset to Earth" }).click();
    await interactivePage.getByRole("button", { name: "Copy share link" }).click();
    const sharedUrl = await interactivePage.getByLabel("Share link").inputValue();
    expect(new URL(sharedUrl).pathname).toBe("/lab/scale-explorer");

    const noScriptContext = await browser.newContext({ javaScriptEnabled: false });
    const noScriptPage = await noScriptContext.newPage();
    await noScriptPage.goto(sharedUrl);
    await expect(noScriptPage.getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();

    await noScriptContext.close();
    await context.close();
  });

  test("keeps the core result, data alternative, model, and sources readable without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const noScriptPage = await context.newPage();

    const encodedSunState = encodeURIComponent(
      JSON.stringify({ model_version: "scale-explorer-v1", node_id: "sun", version: 1 }),
    );
    const noScriptRoutes = [
      { path: "/lab/scale-explorer", selected: "Earth", malformed: false },
      {
        path: `/lab/scale-explorer?state=${encodedSunState}`,
        selected: "Sun",
        malformed: false,
      },
      { path: "/lab/scale-explorer/sun", selected: "Sun", malformed: false },
      { path: "/lab/scale-explorer/invalid-state", selected: "Earth", malformed: true },
    ] as const;

    for (let repetition = 0; repetition < 3; repetition += 1) {
      for (const route of noScriptRoutes) {
        await noScriptPage.goto(route.path);

        await expect(
          noScriptPage.getByRole("heading", { level: 1, name: "Scale Explorer" }),
        ).toHaveCount(1);
        await expect(
          noScriptPage.getByRole("heading", { level: 2, name: route.selected }),
        ).toHaveCount(1);
        await expect(
          noScriptPage.getByRole("heading", { level: 2, name: "Text and data alternative" }),
        ).toHaveCount(1);
        await expect(noScriptPage.getByRole("article")).toHaveCount(1);
        await expect(noScriptPage.getByRole("table")).toHaveCount(1);
        await expect(noScriptPage.getByRole("table").locator("tbody tr")).toHaveCount(12);
        await expect(noScriptPage.getByRole("alert")).toHaveCount(route.malformed ? 1 : 0);
        await expect(noScriptPage.getByRole("status")).toHaveCount(0);
        await expect(noScriptPage.getByText("Loading interactive controls…")).toHaveCount(0);
      }
    }

    await expect(noScriptPage.getByText(/input unit: curated node identifier/i)).toBeVisible();
    await expect(noScriptPage.getByRole("heading", { level: 3, name: "References" })).toBeVisible();
    await expect(noScriptPage.getByRole("columnheader", { name: "Source status" })).toBeVisible();
    await expect(noScriptPage.getByRole("columnheader", { name: "Evidence" })).toBeVisible();

    const noScriptTable = noScriptPage.getByRole("table");
    const noScriptRows = noScriptTable.locator("tbody tr");
    await expect(noScriptRows).toHaveCount(12);
    for (const row of await noScriptRows.all()) {
      await expect(row).toContainText(
        /characteristic (diameter|width)|observable-universe extent/i,
      );
      await expect(row).toContainText(/source (radius|diameter|width|extent)/i);
      await expect(row).toContainText(/normalized logarithmic display position: \d+\.\d+%/i);
    }

    const encodedSun = encodeURIComponent(
      JSON.stringify({ model_version: "scale-explorer-v1", node_id: "sun", version: 1 }),
    );
    await noScriptPage.goto(`/lab/scale-explorer?state=${encodedSun}`);
    await expect(noScriptPage.getByRole("heading", { level: 2, name: "Sun" })).toBeVisible();
    await expect(
      noScriptPage.getByText("about 1.4 million km characteristic diameter", { exact: true }),
    ).toBeVisible();

    await noScriptPage.goto("/lab/scale-explorer?state=not-json");
    await expect(
      noScriptPage.getByRole("alert", { name: /the shared scale state was not valid/i }),
    ).toBeVisible();
    await expect(noScriptPage.getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();
    await expect(
      noScriptPage.getByRole("heading", { level: 2, name: "Text and data alternative" }),
    ).toBeVisible();
    await expect(noScriptPage.getByRole("table")).toBeVisible();
    await expect(
      noScriptPage.getByRole("heading", { level: 2, name: "Model and assumptions" }),
    ).toBeVisible();
    await expect(noScriptPage.getByRole("heading", { level: 3, name: "References" })).toBeVisible();

    const encodedEarth = encodeURIComponent(
      JSON.stringify({ model_version: "scale-explorer-v1", node_id: "earth", version: 1 }),
    );
    await noScriptPage.goto(`/lab/scale-explorer/sun?state=${encodedEarth}`);
    await expect(noScriptPage.getByRole("heading", { level: 2, name: "Sun" })).toBeVisible();

    await context.close();
  });

  test("keeps the model usable with forced colors, 200% zoom, and touch input", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      // A 640 CSS-pixel viewport represents a 1280-pixel viewport at 200% browser zoom.
      viewport: { width: 640, height: 844 },
    });
    const touchPage = await context.newPage();
    await touchPage.emulateMedia({ forcedColors: "active" });
    await touchPage.goto("/lab/scale-explorer");

    await expect(
      touchPage.getByRole("heading", { level: 1, name: "Scale Explorer" }),
    ).toBeVisible();
    await expect(touchPage.getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();
    await expect(touchPage.getByRole("table")).toBeVisible();
    expect(
      await touchPage.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await touchPage.getByRole("button", { name: "Next node" }).tap();
    await expect(touchPage.getByRole("heading", { level: 2, name: "Neptune" })).toBeVisible();

    const forcedColorsAxeResults = await new AxeBuilder({ page: touchPage }).analyze();
    expect(forcedColorsAxeResults.violations).toEqual([]);

    await context.close();
  });
});
