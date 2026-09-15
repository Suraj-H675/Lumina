import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("reviewed discoveries render as static source-labelled content", async ({ page }) => {
  await page.goto("/discoveries");

  await expect(page.getByRole("heading", { level: 1, name: "Reviewed discoveries" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 3,
      name: "Hubble and Webb probe unusually small trans-Neptunian objects",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Underlying result published in peer-reviewed literature", { exact: true })
      .first(),
  ).toBeVisible();
  const source = page.getByRole("link", {
    name: /NASA’s Hubble, Webb Find Far-out Solar System Objects/i,
  });
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(source).toHaveAttribute("rel", "noopener noreferrer");

  const axeResults = await new AxeBuilder({ page }).analyze();
  expect(axeResults.violations).toEqual([]);
});
