import { expect, test, type Page } from "@playwright/test";
import AccessibilityScanner from "@axe-core/playwright";

test.setTimeout(120000);
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const text = (page: Page, value: string) => page.getByText(value, { exact: true });
const chores = ["Take out the recycling", "Tidy my room", "Water the plants"];

async function explore(page: Page) {
  await page.goto("/");
  await button(page, "Explore as Sam").click();
}
async function account(page: Page, role: "parent" | "child") {
  await button(page, "Profile & settings").click();
  await button(page, `Switch to ${role} demo`).click();
}
async function finance(page: Page, destination?: string) {
  await page.getByRole("tab", { name: "Home", exact: true }).click();
  await button(page, "Chores & Goals").click();
  if (destination) await button(page, destination).click();
}
async function approve(page: Page, name: string) {
  await button(page, `Approve: ${name}`).click();
  await button(page, "Confirm").click();
}
async function earn(page: Page, names: string[]) {
  await finance(page, "My chores");
  for (const name of names) await button(page, `Mark done: ${name}`).click();
  await account(page, "parent");
  await finance(page, "Assign & review chores");
  for (const name of names) await approve(page, name);
  await account(page, "child");
}
async function allocate(page: Page, goal: string, amount: string) {
  await finance(page, "Savings goals");
  await button(page, `Open goal: ${goal}`).click();
  await field(page, "Amount (USD)").fill(amount);
  await button(page, "Allocate to this goal").click();
}
async function matching(page: Page) { await finance(page, "Savings matching"); }
async function scan(page: Page) {
  const result = await new AccessibilityScanner({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations).toEqual([]);
}

test("completion needs parent review and a retry produces exactly one earning", async ({ page }) => {
  await explore(page);
  await finance(page, "My chores");
  await expect(button(page, "Assign a chore")).toHaveCount(0);
  await field(page, "Completion note (optional)").fill("Fictional completion note");
  await button(page, `Mark done: ${chores[0]}`).click();
  await expect(text(page, "submitted by child")).toBeVisible();
  await finance(page);
  await expect(text(page, "Approved earnings: $0.00")).toBeVisible();
  await account(page, "parent");
  await finance(page, "Assign & review chores");
  await field(page, "Review note (optional)").fill("Please empty the remaining bin too.");
  await button(page, `Request another attempt: ${chores[0]}`).click();
  await expect(text(page, "needs retry")).toBeVisible();
  await account(page, "child");
  await finance(page, "My chores");
  await expect(text(page, "Note: Please empty the remaining bin too.")).toBeVisible();
  await button(page, `Mark done: ${chores[0]}`).click();
  await account(page, "parent");
  await finance(page, "Assign & review chores");
  await approve(page, chores[0]);
  await expect(button(page, `Approve: ${chores[0]}`)).toHaveCount(0);
  await finance(page);
  await expect(text(page, "Approved earnings: $8.00")).toBeVisible();
  await account(page, "child");
  await finance(page, "My chores");
  await expect(button(page, `Mark done: ${chores[0]}`)).toHaveCount(0);
  await finance(page, "My earnings & cash-out");
  await expect(text(page, "Approved earned: $8.00")).toBeVisible();
});

test("surprise matching shares the cap and separates reveal from parent-reported funding", async ({ page }) => {
  await explore(page);
  await earn(page, chores.slice(0, 2));
  await account(page, "parent");
  await matching(page);
  await expect(button(page, "Enable savings matching")).toHaveAttribute("aria-pressed", "false");
  await expect(field(page, "Match percentage")).toHaveValue("100");
  await expect(field(page, "Monthly cap per child (USD)")).toHaveValue("20.00");
  await expect(button(page, "Surprise until manual reveal")).toHaveAttribute("aria-pressed", "true");
  await button(page, "Enable savings matching").click();
  await button(page, "Review matching settings").click();
  await button(page, "Confirm").click();
  await account(page, "child");
  await allocate(page, "A new video game", "8.00");
  await expect(text(page, "I saved: $8.00")).toBeVisible();
  await expect(text(page, "$8.00 of $70.00 · 11%")).toBeVisible();
  await expect(page.getByText(/Parent plans to contribute/)).toHaveCount(0);
  await allocate(page, "A bicycle", "15.00");
  await expect(text(page, "I saved: $15.00")).toBeVisible();
  await expect(page.getByText(/Parent plans to contribute/)).toHaveCount(0);
  await expect(button(page, "Savings matching")).toHaveCount(0);
  await expect(page.getByText(/Hidden from Sam|Active parent pledge|Monthly cap remaining/)).toHaveCount(0);
  await account(page, "parent");
  await matching(page);
  await expect(text(page, "Reserved this month: $20.00")).toBeVisible();
  await expect(text(page, "Monthly cap remaining: $0.00")).toBeVisible();
  await expect(text(page, "Active parent pledge: $8.00")).toBeVisible();
  await expect(text(page, "Active parent pledge: $12.00")).toBeVisible();
  await button(page, "Reveal contribution 1").click();
  await button(page, "Confirm").click();
  await account(page, "child");
  await finance(page, "Savings goals");
  await button(page, "Open goal: A new video game").click();
  await expect(text(page, "Parent plans to contribute $8.00. This unpaid pledge is excluded from progress.")).toBeVisible();
  await expect(text(page, "$8.00 of $70.00 · 11%")).toBeVisible();
  await expect(text(page, "Parent reports contributing: $0.00")).toBeVisible();
  await account(page, "parent");
  await matching(page);
  await button(page, "Record funding for contribution 1").click();
  await button(page, "Confirm").click();
  await account(page, "child");
  await finance(page, "Savings goals");
  await button(page, "Open goal: A new video game").click();
  await expect(text(page, "I saved: $8.00")).toBeVisible();
  await expect(text(page, "Parent reports contributing: $8.00")).toBeVisible();
  await expect(text(page, "$16.00 of $70.00 · 22%")).toBeVisible();
  await button(page, "All savings goals").click();
  await button(page, "Open goal: A bicycle").click();
  await expect(text(page, "$15.00 of $250.00 · 6%")).toBeVisible();
  await expect(page.getByText(/Parent plans to contribute/)).toHaveCount(0);
});

test("payout holds exclude savings and support partial payment, acknowledgment and parent cancellation", async ({ page }) => {
  await explore(page);
  await earn(page, chores);
  await allocate(page, "A new video game", "8.00");
  await finance(page, "My earnings & cash-out");
  await expect(text(page, "Available, unallocated: $20.00")).toBeVisible();
  await field(page, "Payout amount (USD)").fill("5.00");
  await button(page, "Request cash-out").click();
  await expect(text(page, "Available, unallocated: $15.00")).toBeVisible();
  await expect(text(page, "Reserved for payouts: $5.00")).toBeVisible();
  await field(page, "Payout amount (USD)").fill("16.00");
  await button(page, "Request cash-out").click();
  await expect(text(page, "Not enough available, unpaid earnings.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payout 2", exact: true })).toHaveCount(0);
  await expect(button(page, "Record payment for payout 1")).toHaveCount(0);
  await account(page, "parent");
  await finance(page, "Payout workspace");
  await field(page, "Payout amount (USD)").fill("2.00");
  // A past date avoids assuming the current UTC hour when a date-only form records noon.
  await field(page, "Payment date (YYYY-MM-DD UTC)").fill("2026-01-01");
  await field(page, "Payment note (optional)").fill("Fictional cash handoff");
  await button(page, "Record payment for payout 1").click();
  await button(page, "Confirm").click();
  await expect(text(page, "Remaining reserved: $3.00")).toBeVisible();
  await account(page, "child");
  await finance(page, "My earnings & cash-out");
  await button(page, "Confirm receipt 1.1").click();
  await button(page, "Confirm").click();
  await expect(page.getByText(/child confirmed received; not provider verified/)).toBeVisible();
  await account(page, "parent");
  await finance(page, "Payout workspace");
  await button(page, "Cancel payout 1").click();
  await button(page, "Confirm").click();
  await expect(text(page, "Available, unallocated: $18.00")).toBeVisible();
  await expect(text(page, "Reserved for payouts: $0.00")).toBeVisible();
  await expect(text(page, "Parent-reported paid: $2.00").first()).toBeVisible();
  await expect(text(page, "Goal earmarks: $8.00")).toBeVisible();
  await expect(page.getByText(/Fictional cash handoff/)).toBeVisible();
  await field(page, "Fictional child age for provider guidance").fill("12");
  await expect(button(page, "Open official Venmo Teen guide")).toBeDisabled();
  await expect(button(page, "Open official Cash App Families guide")).toBeEnabled();
  await field(page, "Fictional child age for provider guidance").fill("5");
  await expect(button(page, "Open official Cash App Families guide")).toBeDisabled();
});

test("percentage allocations and future rules work while parent routes stay guarded", async ({ page }) => {
  await explore(page);
  await earn(page, [chores[0]]);
  await finance(page, "Savings goals");
  await button(page, "Open goal: A new video game").click();
  await button(page, "percent").click();
  await field(page, "Percent of available earnings").fill("50");
  await button(page, "Allocate to this goal").click();
  await expect(text(page, "I saved: $4.00")).toBeVisible();
  await button(page, "Use this rule for future earnings").click();
  await button(page, "Confirm").click();
  await expect(text(page, "Future earning rule: 50%")).toBeVisible();
  await earn(page, [chores[2]]);
  await finance(page, "Savings goals");
  await button(page, "Open goal: A new video game").click();
  await expect(text(page, "I saved: $6.50")).toBeVisible();
  await expect(text(page, "Available approved earnings: $6.50")).toBeVisible();
  await button(page, "Stop this savings rule").click();
  await expect(text(page, "Future earning rule: 50%")).toHaveCount(0);
  await page.goto("/?screen=Matching");
  await expect(page.getByText(/Only the parent demo can manage these settings/)).toBeVisible();
  await expect(button(page, "Enable savings matching")).toHaveCount(0);
  await page.goto("/?screen=Budget");
  await expect(page.getByText(/Only the parent demo can manage these settings/)).toBeVisible();
  await expect(button(page, "Review allowance settings")).toHaveCount(0);
});

test("finance screens remain accessible in both themes with four phone destinations", async ({ page }) => {
  await explore(page);
  for (const theme of ["Light mode", "Dark mode"]) {
    await button(page, "Profile & settings").click();
    await button(page, theme).click();
    await finance(page);
    await scan(page);
    for (const name of ["Home", "Journal", "Chats", "Circle"]) {
      await expect(page.getByRole("tab", { name, exact: true })).toBeInViewport();
    }
    await button(page, "My chores").click();
    await scan(page);
    await finance(page, "Savings goals");
    await scan(page);
    await account(page, "parent");
    await matching(page);
    await scan(page);
    await finance(page, "Payout workspace");
    await scan(page);
    await account(page, "child");
  }
});
