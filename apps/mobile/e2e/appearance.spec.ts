import { expect, test, type Page } from "@playwright/test";

import AccessibilityScanner from "@axe-core/playwright";

test.setTimeout(90000);
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
async function scan(page: Page) {
  const results = await new AccessibilityScanner({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}
test("appearance persists alone and representative screens remain accessible in both themes", async ({
  page,
}) => {
  await page.goto("/");
  await button(page, "Explore as Sam").click();
  await button(page, "Profile & settings").click();
  await button(page, "Dark mode").click();
  await expect(button(page, "Dark mode")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("between-us.appearance")),
    )
    .toBe("dark");
  await scan(page);
  await page.reload();
  await expect(button(page, "Dark mode")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("tab", { name: "Home", exact: true }).click();
  await scan(page);
  await page.getByRole("tab", { name: "Journal", exact: true }).click();
  await scan(page);
  await button(page, "Profile & settings").click();
  await button(page, "Light mode").click();
  await scan(page);
  await page.getByRole("tab", { name: "Home", exact: true }).click();
  await scan(page);
  await page.getByRole("tab", { name: "Journal", exact: true }).click();
  await scan(page);
  await button(page, "New entry").click();
  await page
    .getByRole("textbox", { name: "Your private demo words", exact: true })
    .fill("Fictional reload marker");
  await button(page, "Save entry").click();
  await page.reload();
  await page.getByRole("tab", { name: "Journal", exact: true }).click();
  await expect(
    page.getByText("Fictional reload marker", { exact: true }),
  ).toHaveCount(0);
  await button(page, "Profile & settings").click();
  await expect(button(page, "Light mode")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toEqual(["between-us.appearance"]);
});
