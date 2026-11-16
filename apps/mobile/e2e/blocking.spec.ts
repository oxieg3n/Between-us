import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90000);

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

for (const scenario of [
  { owner: "child", start: "Sam", blocked: "Alex - parent", otherRole: "parent", peer: "Sam", peerFull: "Sam - teen" },
  { owner: "parent", start: "Alex", blocked: "Sam - teen", otherRole: "child", peer: "Alex", peerFull: "Alex - parent" },
] as const) {
  test(`${scenario.owner}'s block stops incoming simulation after switching demo accounts without blocking safety or practice`, async ({ page }) => {
    await page.goto("/");
    await button(page, `Explore as ${scenario.start}`).click();
    await tab(page, "Circle").click();
    await page.getByRole("button", { name: new RegExp(`^Open ${scenario.blocked},`) }).click();
    await button(page, `Block ${scenario.blocked}`).click();
    await expect(page.getByText("Block this connection?", { exact: true })).toBeVisible();
    await button(page, "Confirm").click();
    await expect(page.getByText("Blocked", { exact: true })).toBeVisible();

    await button(page, "Profile & settings").click();
    await button(page, `Switch to ${scenario.otherRole} demo`).click();
    await tab(page, "Circle").click();
    await page.getByRole("button", { name: new RegExp(`^Open ${scenario.peerFull},`) }).click();
    await expect(button(page, `Talk to ${scenario.peer}`)).toHaveCount(0);
    // The recipient's private block must not become an explicit blocker attribution.
    await expect(page.getByText(/blocked by/i)).toHaveCount(0);

    await tab(page, "Chats").click();
    await page.getByRole("button", { name: new RegExp(`^Open conversation with ${scenario.peer}\\.`) }).click();
    await expect(page.getByRole("textbox", { name: "Message draft", exact: true })).not.toBeEditable();
    await expect(button(page, "Review")).toBeDisabled();

    await tab(page, "Home").click();
    await button(page, "Talk to someone").click();
    const message = page.getByRole("textbox", { name: "Your message", exact: true });
    const draft = `Fictional ${scenario.otherRole} words after a block`;
    await message.fill(draft);
    await expect(page.getByRole("radio", { name: scenario.peer, exact: true })).toHaveCount(0);
    await expect(button(page, "Review my words")).toBeDisabled();
    await expect(button(page, "Simulate send")).toHaveCount(0);
    await message.fill("");

    await button(page, "Profile & settings").click();
    await button(page, "Privacy & safety").click();
    await expect(button(page, "Prepare words for another trusted adult")).toBeEnabled();
    await button(page, "Prepare words for another trusted adult").click();
    await button(page, "Review my words").click();
    await expect(button(page, "Keep words for practice")).toBeEnabled();
    await button(page, "Keep words for practice").click();
    await expect(page.getByText("Your words are ready to practice. Nothing was sent.", { exact: true })).toBeVisible();
    await button(page, "Edit my words").click();
    await message.fill("");
    await tab(page, "Chats").click();
    await page.getByRole("button", { name: new RegExp(`^Open conversation with ${scenario.peer}\\.`) }).click();
    await expect(page.getByText(draft, { exact: true })).toHaveCount(0);
  });
}
