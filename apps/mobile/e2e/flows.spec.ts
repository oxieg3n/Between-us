import { test, expect } from "@playwright/test";
import AccessibilityScanner from "@axe-core/playwright";
test("journal ownership, no-copy reflection, review, contacts, check-ins and themes", async ({
  page,
}) => {
  await page.goto("/");
  const click = async (name: string) =>
    page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByText("A small start")).toBeVisible();
  await click("Journal");
  await click("Home");
  await page.getByText("A small start").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/child-home.png",
    animations: "disabled",
  });
  await click("Journal");
  await page
    .getByRole("textbox", { name: "Entry title", exact: true })
    .fill("Fictional private title");
  await page
    .getByRole("textbox", { name: "Your private demo words" })
    .fill("School project secret marker");
  await click("Save entry in memory");
  await click("Help me find someone to talk to");
  await click("Prepare separate words");
  await expect(page.getByRole("textbox", { name: "Your message" })).toHaveValue(
    "Can we talk?",
  );
  await click("Review my words");
  await expect(page.getByText("School project secret marker")).toHaveCount(0);
  await click("Edit my words");
  await page
    .getByRole("textbox", { name: "Your message" })
    .fill("Can we talk after dinner?");
  await click("Review my words");
  await click("Simulate sending this message");
  await expect(
    page.getByText("Can we talk after dinner?", { exact: true }),
  ).toBeVisible();
  await click("Parent");
  await click("Journal");
  await expect(
    page.getByText("Fictional private title", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Entry title", exact: true })
    .fill("Parent private title");
  await page
    .getByRole("textbox", { name: "Your private demo words" })
    .fill("Fictional parent thoughts");
  await click("Save entry in memory");
  await click("Messages");
  await click("Help me reply");
  await click("Review my words");
  await click("Simulate sending this message");
  await click("Circle");
  await page
    .getByRole("textbox", { name: "Fictional contact name" })
    .fill("Coach Fiction");
  await click("Add trusted person");
  await expect(page.getByText("Coach Fiction", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Write to Coach Fiction", exact: true }),
  ).toHaveCount(0);
  await click("Remove Coach Fiction");
  await click("Check-ins");
  await page
    .getByRole("textbox", { name: "Check-in question" })
    .fill("What should we cook together?");
  await click("Create simulated check-in");
  await click("Kid / teen");
  await click("Check-ins");
  await page
    .getByRole("button", { name: "Skip this check-in", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Skipped. You do not owe an answer."),
  ).toBeVisible();
  await click("Circle");
  await page
    .getByRole("textbox", { name: "Fictional contact name" })
    .fill("Mentor Fiction");
  await click("Request trusted person");
  await expect(
    page.getByRole("button", { name: "Approve Mentor Fiction", exact: true }),
  ).toHaveCount(0);
  await click("Parent");
  await click("Circle");
  await click("Approve Mentor Fiction");
  await expect(
    page.getByRole("button", { name: "Write to Mentor Fiction", exact: true }),
  ).toHaveCount(0);
  await click("Kid / teen");
  await click("Journal");
  await expect(
    page.getByText("Parent private title", { exact: true }),
  ).toHaveCount(0);
  await click("Revisit Fictional private title");
  await expect(
    page.getByRole("textbox", { name: "Your private demo words" }),
  ).toHaveValue("School project secret marker");
  await page
    .getByRole("textbox", { name: "Your private demo words" })
    .fill("Edited fictional entry");
  await click("Save entry in memory");
  await click("Delete Fictional private title");
  await click("Confirm delete");
  await expect(
    page.getByText("Fictional private title", { exact: true }),
  ).toHaveCount(0);
  await click("Privacy & safety");
  await click("dark");
  await page.screenshot({
    path: "test-results/safety-dark.png",
    fullPage: true,
  });
  const result = await new AccessibilityScanner({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await click("Prepare words for another trusted adult");
  await click("Review my words");
  await click("Keep words here for practice");
  await expect(
    page.getByText(
      "Ready to practice. Nothing was sent or stored outside this session.",
    ),
  ).toBeVisible();
});
