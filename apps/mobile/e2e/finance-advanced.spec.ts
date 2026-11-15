import { expect, test, type Page } from "@playwright/test";
import AccessibilityScanner from "@axe-core/playwright";

test.setTimeout(180000);
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const text = (page: Page, value: string) => page.getByText(value, { exact: true });
const chores = ["Take out the recycling", "Tidy my room"];
async function explore(page: Page) { await page.goto("/"); await button(page, "Explore as Sam").click(); }
async function account(page: Page, role: "parent" | "child") { await button(page, "Profile & settings").click(); await button(page, `Switch to ${role} demo`).click(); }
async function finance(page: Page, destination: string) { await page.getByRole("tab", { name: "Home", exact: true }).click(); await button(page, "Chores & Goals").click(); await button(page, destination).click(); }
async function earn(page: Page, count: number) {
  await finance(page, "My chores");
  for (const name of chores.slice(0, count)) await button(page, `Mark done: ${name}`).click();
  await account(page, "parent"); await finance(page, "Assign & review chores");
  for (const name of chores.slice(0, count)) { await button(page, `Approve: ${name}`).click(); await button(page, "Confirm").click(); }
}
async function allocate(page: Page, goal: string, amount: string) { await finance(page, "Savings goals"); await button(page, `Open goal: ${goal}`).click(); await field(page, "Amount (USD)").fill(amount); await button(page, "Allocate to this goal").click(); }
async function scan(page: Page) { expect((await new AccessibilityScanner({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]); }
function shift(date: string, days: number) { return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10); }
function nextMonday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const tomorrow = shift(today, 1);
  return shift(tomorrow, (1 - new Date(tomorrow + "T12:00:00Z").getUTCDay() + 7) % 7);
}

test("parents choose multiple weekly weekdays and can return to the first-date default", async ({ page }) => {
  await explore(page); await account(page, "parent"); await finance(page, "Assign & review chores"); await button(page, "Assign a chore").click();
  await field(page, "Chore title").fill("A weekly routine"); await field(page, "Reward per occurrence (USD)").fill("0.01"); await button(page, "weekly").click();
  const first = nextMonday(); await field(page, "First date (YYYY-MM-DD)").fill(first); await field(page, "Last date (YYYY-MM-DD)").fill(shift(first, 6));
  for (const day of ["Monday", "Wednesday", "Friday"]) { await button(page, `Repeat on ${day}`).click(); await expect(button(page, `Repeat on ${day}`)).toHaveAttribute("aria-pressed", "true"); }
  await scan(page); await button(page, "Save chore").click();
  await expect(page.getByRole("heading", { name: "A weekly routine", exact: true })).toHaveCount(3);
  for (const offset of [0, 2, 4]) await expect(text(page, `$0.01 · ${shift(first, offset)}`)).toBeVisible();
  await button(page, "Assign a chore").click(); await field(page, "Chore title").fill("A default weekly routine");
  for (const day of ["Monday", "Wednesday", "Friday"]) await button(page, `Repeat on ${day}`).click();
  await expect(page.getByText(/With no weekdays selected, weekly repeats use the first date/)).toBeVisible(); await button(page, "Save chore").click();
  await expect(page.getByRole("heading", { name: "A default weekly routine", exact: true })).toHaveCount(1);
  await account(page, "child"); await finance(page, "My chores"); await expect(button(page, "Mark done: A weekly routine")).toHaveCount(3); await expect(button(page, "Mark done: A default weekly routine")).toHaveCount(1); await expect(button(page, "Assign a chore")).toHaveCount(0);
});

test("selected future goals persist and partial matching funding stays separate from reveal", async ({ page }) => {
  await explore(page); await earn(page, 2); await button(page, "Profile & settings").click(); await button(page, "Dark mode").click();
  await finance(page, "Savings matching"); await button(page, "Enable savings matching").click(); await button(page, "Match all active goals").click();
  for (const goal of ["A bicycle", "A gift for someone"]) await button(page, `Match goal: ${goal}`).click();
  await button(page, "Review matching settings").click(); await expect(page.getByText(/Selected goals: A new video game/)).toBeVisible(); await button(page, "Confirm").click();
  await finance(page, "Savings matching"); await expect(button(page, "Match all active goals")).toHaveAttribute("aria-pressed", "false"); await expect(button(page, "Match goal: A new video game")).toHaveAttribute("aria-pressed", "true"); await expect(button(page, "Match goal: A bicycle")).toHaveAttribute("aria-pressed", "false");
  await account(page, "child"); await allocate(page, "A new video game", "8.00"); await allocate(page, "A bicycle", "15.00");
  await account(page, "parent"); await finance(page, "Savings matching"); await expect(text(page, "Reserved this month: $8.00")).toBeVisible(); await expect(page.getByRole("heading", { name: "Contribution 2", exact: true })).toHaveCount(0);
  await button(page, "Funding details for contribution 1").click(); await field(page, "Funding amount for contribution 1 (USD, optional)").fill("3.00"); await button(page, "Cash App").click(); await field(page, "Funding date for contribution 1 (YYYY-MM-DD UTC)").fill("2026-01-01"); await field(page, "Funding note for contribution 1 (optional)").fill("Fictional partial matching handoff");
  await scan(page); await button(page, "Record funding for contribution 1").click(); await expect(page.getByText(/Record \$3.00 as contributed outside Between Us using Cash App on 2026-01-01/)).toBeVisible(); await button(page, "Confirm").click();
  await expect(text(page, "Parent-reported funded: $3.00")).toBeVisible(); await expect(text(page, "Active parent pledge: $8.00")).toBeVisible(); await expect(field(page, "Funding amount for contribution 1 (USD, optional)")).toHaveValue("");
  await account(page, "child"); await finance(page, "Savings goals"); await button(page, "Open goal: A new video game").click(); await expect(text(page, "Parent reports contributing: $0.00")).toBeVisible(); await expect(button(page, "Funding details for contribution 1")).toHaveCount(0);
  await account(page, "parent"); await finance(page, "Savings matching"); await button(page, "Reveal contribution 1").click(); await button(page, "Confirm").click(); await account(page, "child"); await finance(page, "Savings goals"); await button(page, "Open goal: A new video game").click();
  await expect(text(page, "I saved: $8.00")).toBeVisible(); await expect(text(page, "Parent reports contributing: $3.00")).toBeVisible(); await expect(text(page, "Parent plans to contribute $5.00. This unpaid pledge is excluded from progress.")).toBeVisible(); await expect(text(page, "$11.00 of $70.00 · 15%")).toBeVisible();
});

test("invalid partial funding and future dates do not record payment or bypass review", async ({ page }) => {
  await explore(page); await earn(page, 1); await finance(page, "Savings matching"); await button(page, "Enable savings matching").click(); await button(page, "Review matching settings").click(); await button(page, "Confirm").click();
  await account(page, "child"); await allocate(page, "A new video game", "8.00"); await account(page, "parent"); await finance(page, "Savings matching"); await button(page, "Funding details for contribution 1").click();
  await field(page, "Funding amount for contribution 1 (USD, optional)").fill("9.00"); await button(page, "Record funding for contribution 1").click(); await expect(text(page, "Enter a contribution amount within the remaining unpaid pledge.")).toBeVisible(); await expect(button(page, "Confirm")).toHaveCount(0);
  await field(page, "Funding amount for contribution 1 (USD, optional)").fill("2.00"); await field(page, "Funding date for contribution 1 (YYYY-MM-DD UTC)").fill(shift(new Date().toISOString().slice(0, 10), 2)); await button(page, "Record funding for contribution 1").click(); await expect(text(page, "A reported payment cannot be in the future.")).toBeVisible(); await expect(button(page, "Confirm")).toHaveCount(0);
  await field(page, "Funding date for contribution 1 (YYYY-MM-DD UTC)").fill("2026-01-01"); await button(page, "Record funding for contribution 1").click(); await button(page, "Cancel").click(); await expect(text(page, "Parent-reported funded: $0.00")).toBeVisible();
});
