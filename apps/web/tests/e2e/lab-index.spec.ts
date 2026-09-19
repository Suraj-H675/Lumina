import { expect, test } from "@playwright/test";

test.use({ javaScriptEnabled: false });

test("keeps the reviewed Lab index and authored destinations usable without JavaScript", async ({
  page,
}) => {
  await page.goto("/lab");

  await expect(page.getByRole("heading", { level: 1, name: "Lab" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Implemented laboratories" })).toBeVisible();

  const hrDiagram = page.locator('a[href="/lab/hr-diagram-explorer"]');
  await expect(hrDiagram).toContainText("H-R Diagram Explorer");
  await expect(hrDiagram).toContainText(
    "Explore a curated Gaia DR3 stellar sample across physical H-R and Gaia colour–magnitude views.",
  );
  await expect(hrDiagram).toContainText("Open lab →");
});
