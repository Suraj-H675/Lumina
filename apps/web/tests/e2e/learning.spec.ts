import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Phase 3A — Your First Night Sky", () => {
  test("renders the complete path and remains usable at a narrow mobile width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/learn/your-first-night-sky");

    await expect(
      page.getByRole("heading", { level: 1, name: "Your First Night Sky" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Sources and review" })).toBeVisible();
    await expect(page.getByRole("link", { name: /start with the sky/i })).toBeVisible();
    await expect(page.getByText(/complete first: start-with-the-sky/i).first()).toBeVisible();

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });

  test("completes a lesson quiz, unlocks its prerequisite, and keeps mastery after reload", async ({
    page,
  }) => {
    await page.goto("/learn/your-first-night-sky/start-with-the-sky");
    await expect(
      page.getByRole("heading", { level: 1, name: "Start with the sky you have" }),
    ).toBeVisible();

    await page.getByLabel("Presentation mode").selectOption("student");
    await expect(page.getByText(/NASA notes that you need no special equipment/i)).toBeVisible();
    await page
      .locator('input[type="radio"][value="a"]')
      .all()
      .then(async (inputs) => {
        for (const input of inputs) await input.check();
      });
    await page.getByRole("button", { name: "Check answers" }).click();
    await expect(page.getByText(/3 of 3 correct/i)).toBeVisible();
    await expect(page.getByText(/mastery saved locally/i)).toBeVisible();

    await page.getByRole("link", { name: "Next lesson" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Find patterns and directions" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Find patterns and directions" }),
    ).toBeVisible();
    await expect(page.getByText(/knowledge check/i)).toBeVisible();
  });

  test("supports keyboard quiz navigation and stays within a narrow lesson viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/learn/your-first-night-sky/start-with-the-sky");
    await expect(
      page.getByRole("heading", { level: 1, name: "Start with the sky you have" }),
    ).toBeVisible();

    const mode = page.getByLabel("Presentation mode");
    const firstChoice = page.locator('input[type="radio"]').first();
    await mode.focus();
    await expect(mode).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(firstChoice).toBeFocused();
    await page.keyboard.press("Space");
    await expect(firstChoice).toBeChecked();
    await expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test("exports, resets, previews, and imports progress through the browser UI", async ({
    page,
  }) => {
    await page.goto("/learn/your-first-night-sky/start-with-the-sky");
    await page
      .locator('input[type="radio"][value="a"]')
      .all()
      .then(async (inputs) => {
        for (const input of inputs) await input.check();
      });
    await page.getByRole("button", { name: "Check answers" }).click();
    await expect(page.getByText(/mastery saved locally/i)).toBeVisible();

    await page.goto("/learn");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export learning progress" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    if (downloadPath === null) throw new Error("browser did not provide exported file path");

    await page.getByRole("button", { name: "Reset local progress" }).click();
    await page.getByRole("button", { name: /confirm reset/i }).click();
    await expect(page.getByText(/stored locally: 0 learning paths/i)).toBeVisible();

    await page.getByLabel("Import learning progress").setInputFiles(downloadPath);
    await expect(page.getByRole("heading", { name: "Review this import" })).toBeVisible();
    await expect(page.getByText(/current progress is kept/i)).toBeVisible();
    await expect(page.getByText(/stored locally: 0 learning paths/i)).toBeVisible();
    await page.getByRole("button", { name: "Import progress" }).click();
    await expect(page.getByText(/imported 1 learning path and 1 new attempt/i)).toBeVisible();
    await expect(page.getByText(/stored locally: 1 learning path/i)).toBeVisible();
  });
});
