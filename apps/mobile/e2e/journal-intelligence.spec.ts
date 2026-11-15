import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90000);
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });
const writing = (page: Page) =>
  page.getByRole("textbox", { name: "Your private demo words", exact: true });

async function newPage(page: Page) {
  await page.goto("/");
  await button(page, "Explore as Sam").click();
  await tab(page, "Journal").click();
  await button(page, "New entry").click();
}

test("manual starters work before saving and require recipient, editing and review", async ({ page }) => {
  await newPage(page);
  const entry = "Someone bullied me at school today. Fictional private purple notebook detail.";
  await writing(page).fill(entry);
  await expect(button(page, "Conversation Ideas While I Write")).toHaveAttribute("aria-pressed", "false");
  await expect(button(page, "Prepare separate words")).toHaveCount(0);
  await button(page, "Find words to share").click();
  await expect(page.getByText("Local conversation templates · no AI model", { exact: true })).toBeVisible();
  await expect(page.getByText("Can we talk about being picked on? I'd like you to listen first.", { exact: true })).toBeVisible();
  await expect(button(page, "Save entry")).toBeEnabled();
  await button(page, "Adjust the wording").click();
  await button(page, "Shorter").click();
  await expect(page.getByText("Can we talk about being picked on?", { exact: true }).first()).toBeVisible();
  await button(page, "Prepare separate words").click();
  const message = page.getByRole("textbox", { name: "Your message", exact: true });
  await expect(message).not.toHaveValue(entry);
  await expect(message).not.toHaveValue(/purple notebook/);
  await expect(button(page, "Review my words")).toBeDisabled();
  await page.getByRole("radio", { name: "Alex", exact: true }).click();
  await message.fill("Can we talk after dinner about school? Please listen first.");
  await button(page, "Review my words").click();
  await expect(page.getByText(entry, { exact: true })).toHaveCount(0);
  await button(page, "Edit my words").click();
  await expect(message).toHaveValue("Can we talk after dinner about school? Please listen first.");
  await button(page, "Review my words").click();
  await button(page, "Simulate send").click();
  await expect(page.getByText("Simulated message only. Nothing was delivered.", { exact: true })).toBeVisible();
  await tab(page, "Journal").click();
  await button(page, "Continue unsaved writing").click();
  await expect(writing(page)).toHaveValue(entry);
});

test("unsafe parent is excluded while another-adult practice and safety stay available", async ({ page }) => {
  await newPage(page);
  await writing(page).fill("My dad Alex hurt me today. This is fictional private writing.");
  await button(page, "Find words to share").click();
  await expect(button(page, "Privacy & safety information")).toBeVisible();
  await expect(page.getByText("Another trusted adult", { exact: true })).toBeVisible();
  await button(page, "Prepare separate words").click();
  await expect(page.getByRole("radio", { name: "Alex", exact: true })).toHaveCount(0);
  await expect(button(page, "Review my words")).toBeDisabled();
  await button(page, "Prepare for an in-person talk").click();
  await button(page, "Review my words").click();
  await button(page, "Keep words for practice").click();
  await expect(page.getByText("Your words are ready to practice. Nothing was sent.", { exact: true })).toBeVisible();
  await tab(page, "Journal").click();
  await button(page, "Continue unsaved writing").click();
  await button(page, "Find words to share").click();
  await button(page, "Privacy & safety information").click();
  await expect(button(page, "Prepare words for another trusted adult")).toBeVisible();
});

test("pause generation cancels stale writing, opt-out and navigation; opt-in stays role-local", async ({ page }) => {
  await newPage(page);
  await writing(page).fill("Someone bullied me at school today.");
  await button(page, "Conversation Ideas While I Write").click();
  await expect(button(page, "Conversation Ideas While I Write")).toHaveAttribute("aria-pressed", "true");
  await writing(page).fill("Our family is moving to a different house.");
  await expect(page.getByText("Can we talk about moving? I'd like you to listen first.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Can we talk about being picked on/)).toHaveCount(0);
  await button(page, "Conversation Ideas While I Write").click();
  await expect(button(page, "Prepare separate words")).toHaveCount(0);
  await writing(page).fill("I won a fictional school award today.");
  await page.waitForTimeout(1400);
  await expect(button(page, "Prepare separate words")).toHaveCount(0);
  await button(page, "Conversation Ideas While I Write").click();
  await tab(page, "Home").click();
  await page.waitForTimeout(1400);
  await expect(page.getByText("You choose the person.", { exact: true })).toHaveCount(0);
  await button(page, "Profile & settings").click();
  await button(page, "Switch to parent demo").click();
  await button(page, "Confirm").click();
  await tab(page, "Journal").click();
  await button(page, "New entry").click();
  await expect(button(page, "Conversation Ideas While I Write")).toHaveAttribute("aria-pressed", "false");
  await expect(writing(page)).toHaveValue("");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.every((key) => key === "between-us.appearance")).toBe(true);
});
