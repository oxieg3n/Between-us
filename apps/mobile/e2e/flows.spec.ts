import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90000);

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });
async function explore(page: Page) {
  await page.goto("/");
  await button(page, "Explore as Sam").click();
}
async function account(page: Page, role: "parent" | "child") {
  await button(page, "Profile & settings").click();
  await button(page, `Switch to ${role} demo`).click();
}

test("journal draft protection, author isolation and separate reviewed conversations", async ({
  page,
}) => {
  await explore(page);
  await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
  await tab(page, "Journal").click();
  await button(page, "New entry").click();
  await page
    .getByRole("textbox", { name: "Entry title", exact: true })
    .fill("Fictional private title");
  await page
    .getByRole("textbox", { name: "Your private demo words", exact: true })
    .fill("School project secret marker");
  await tab(page, "Home").click();
  await tab(page, "Journal").click();
  await button(page, "New entry").click();
  await expect(
    page.getByText("Replace your unsaved writing?", { exact: true }),
  ).toBeVisible();
  await button(page, "Cancel").click();
  await button(page, "Continue unsaved writing").click();
  await expect(
    page.getByRole("textbox", { name: "Your private demo words", exact: true }),
  ).toHaveValue("School project secret marker");
  await button(page, "Save entry").click();
  await expect(button(page, "Saved in this session")).toBeDisabled();
  await button(page, "Help me find someone to talk to").click();
  await button(page, "Prepare separate words").click();
  const message = page.getByRole("textbox", {
    name: "Your message",
    exact: true,
  });
  await expect(message).not.toHaveValue(/School project secret marker/);
  await expect(button(page, "Review my words")).toBeDisabled();
  await page.getByRole("radio", { name: "Alex", exact: true }).click();
  await message.fill("Can we talk after dinner?");
  await button(page, "Review my words").click();
  await expect(
    page.getByText("School project secret marker", { exact: true }),
  ).toHaveCount(0);
  await button(page, "Edit my words").click();
  await message.fill("Can we talk after dinner about my project?");
  await button(page, "Review my words").click();
  await button(page, "Simulate send").click();
  await expect(
    page.getByText("Can we talk after dinner about my project?", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Simulated message only. Nothing was delivered.", {
      exact: true,
    }),
  ).toBeVisible();
  await account(page, "parent");
  await tab(page, "Journal").click();
  await expect(
    page.getByText("Fictional private title", { exact: true }),
  ).toHaveCount(0);
  await button(page, "New entry").click();
  await page
    .getByRole("textbox", { name: "Entry title", exact: true })
    .fill("Parent private title");
  await page
    .getByRole("textbox", { name: "Your private demo words", exact: true })
    .fill("Fictional parent thoughts");
  await button(page, "Save entry").click();
  await tab(page, "Chats").click();
  await page
    .getByRole("button", { name: /^Open conversation with Sam\./ })
    .click();
  await button(page, "Writing helpers").click();
  await button(page, "Help Me Reply").click();
  await expect(message).toHaveValue(
    "Thank you for telling me. Would you like me to listen, or find a time to talk?",
  );
  await button(page, "Review my words").click();
  await button(page, "Simulate send").click();
  await account(page, "child");
  await tab(page, "Journal").click();
  await expect(
    page.getByText("Parent private title", { exact: true }),
  ).toHaveCount(0);
  await button(page, "Revisit Fictional private title").click();
  await page
    .getByRole("textbox", { name: "Your private demo words", exact: true })
    .fill("Edited fictional entry");
  await button(page, "Save entry").click();
  await tab(page, "Journal").click();
  await button(page, "Revisit Fictional private title").click();
  await expect(
    page.getByRole("textbox", { name: "Your private demo words", exact: true }),
  ).toHaveValue("Edited fictional entry");
  await button(page, "Delete Fictional private title").click();
  await button(page, "Confirm").click();
  await expect(button(page, "Revisit Fictional private title")).toHaveCount(0);
  await button(page, "Privacy & safety").click();
  await button(page, "Prepare words for another trusted adult").click();
  await button(page, "Review my words").click();
  await button(page, "Keep words for practice").click();
  await expect(
    page.getByText("Your words are ready to practice. Nothing was sent.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("switching accounts warns before discarding unsent writing", async ({
  page,
}) => {
  await explore(page);
  await button(page, "Talk to someone").click();
  await page
    .getByRole("textbox", { name: "Your message", exact: true })
    .fill("Unsent fictional words");
  await button(page, "Profile & settings").click();
  await button(page, "Switch to parent demo").click();
  await expect(
    page.getByText("Switch demo account?", { exact: true }),
  ).toBeVisible();
  await button(page, "Cancel").click();
  await button(page, "Back").click();
  await expect(
    page.getByRole("textbox", { name: "Your message", exact: true }),
  ).toHaveValue("Unsent fictional words");
  await button(page, "Profile & settings").click();
  await button(page, "Switch to parent demo").click();
  await button(page, "Confirm").click();
  await button(page, "Talk to someone").click();
  await expect(
    page.getByRole("textbox", { name: "Your message", exact: true }),
  ).toHaveValue("");
});

test("circle permissions, optional check-ins and schedule management remain functional", async ({
  page,
}) => {
  await explore(page);
  await tab(page, "Circle").click();
  await button(page, "Request trusted person").click();
  await page
    .getByRole("textbox", { name: "Fictional contact name", exact: true })
    .fill("Mentor Fiction");
  await button(page, "Submit contact request").click();
  await page.getByRole("button", { name: /^Open Mentor Fiction,/ }).click();
  await expect(button(page, "Approve Mentor Fiction")).toHaveCount(0);
  await expect(button(page, "Talk to Mentor Fiction")).toHaveCount(0);
  await account(page, "parent");
  await tab(page, "Circle").click();
  await page.getByRole("button", { name: /^Open Mentor Fiction,/ }).click();
  await button(page, "Approve Mentor Fiction").click();
  await expect(button(page, "Talk to Mentor Fiction")).toHaveCount(0);
  await tab(page, "Circle").click();
  await button(page, "Add trusted person").click();
  await page
    .getByRole("textbox", { name: "Fictional contact name", exact: true })
    .fill("Coach Fiction");
  await button(page, "Add person to circle").click();
  await page.getByRole("button", { name: /^Open Coach Fiction,/ }).click();
  await expect(button(page, "Talk to Coach Fiction")).toHaveCount(0);
  await button(page, "Remove Coach Fiction").click();
  await expect(
    page.getByText("Remove this trusted person?", { exact: true }),
  ).toBeVisible();
  await button(page, "Confirm").click();
  await expect(page.getByText("Removed", { exact: true })).toBeVisible();
  await tab(page, "Home").click();
  await button(page, "Schedule a check-in").click();
  await page
    .getByRole("textbox", { name: "Check-in question", exact: true })
    .fill("What should we cook together?");
  await page
    .getByRole("textbox", { name: "Time (24-hour HH:MM)", exact: true })
    .fill("25:00");
  await expect(button(page, "Save example schedule")).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Time (24-hour HH:MM)", exact: true })
    .fill("18:30");
  await button(page, "Mon").click();
  await button(page, "Save example schedule").click();
  await expect(
    page.getByText("Example schedule saved. Notifications are simulated.", {
      exact: true,
    }),
  ).toBeVisible();
  await account(page, "child");
  await button(page, "Open check-in").click();
  await button(page, "Skip this check-in").first().click();
  await expect(
    page.getByText("Skipped. You do not owe an answer.", { exact: true }),
  ).toBeVisible();
  await button(page, "Answer later").click();
  await expect(
    page.getByText("Set aside. No reminder will be sent.", { exact: true }),
  ).toBeVisible();
  await button(page, "Show invitations I set aside").click();
  await expect(
    page.getByText("What should we cook together?", { exact: true }),
  ).toBeVisible();
  await button(page, "Can we talk?").click();
  await button(page, "Review my words").click();
  await button(page, "Simulate send").click();
  await account(page, "parent");
  await tab(page, "Home").click();
  await button(page, "View check-ins").click();
  await button(page, "Edit schedule").last().click();
  await page
    .getByRole("textbox", { name: "Check-in question", exact: true })
    .fill("Would you like to cook pizza?");
  await button(page, "Save example schedule").click();
  await button(page, "Back").click();
  await expect(
    page.getByText("Would you like to cook pizza?", { exact: true }),
  ).toBeVisible();
  await button(page, "Remove schedule").last().click();
  await button(page, "Confirm").click();
  await expect(
    page.getByText("Would you like to cook pizza?", { exact: true }),
  ).toHaveCount(0);
  await account(page, "child");
  await tab(page, "Circle").click();
  await page.getByRole("button", { name: /^Open Alex - parent,/ }).click();
  await button(page, "Report Alex - parent").click();
  await expect(
    page.getByText(/Demo report noted only on this screen/),
  ).toBeVisible();
  await button(page, "Block Alex - parent").click();
  await button(page, "Confirm").click();
  await expect(button(page, "Talk to Alex")).toHaveCount(0);
  await button(page, "Prepare words to say in person").click();
  await page
    .getByRole("textbox", { name: "Your message", exact: true })
    .fill("Fictional practice words");
  await button(page, "Review my words").click();
  await button(page, "Keep words for practice").click();
  await expect(
    page.getByText("Your words are ready to practice. Nothing was sent.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("phone and tablet layouts keep navigation and keyboard-accessible writing controls reachable", async ({
  page,
}) => {
  await explore(page);
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 430, height: 932 },
    { width: 960, height: 1280 },
  ]) {
    await page.setViewportSize(viewport);
    for (const name of ["Home", "Journal", "Chats", "Circle"]) {
      await expect(tab(page, name)).toBeInViewport();
    }
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await tab(page, "Journal").click();
    await button(page, "New entry").click();
    const title = page.getByRole("textbox", {
      name: "Entry title",
      exact: true,
    });
    const body = page.getByRole("textbox", {
      name: "Your private demo words",
      exact: true,
    });
    await title.focus();
    await expect(title).toBeFocused();
    await title.fill(`Fictional ${viewport.width} page`);
    await page.keyboard.press("Tab");
    await expect(body).toBeFocused();
    await body.fill(`Fictional writing at viewport ${viewport.width}.`);
    await page.keyboard.press("Tab");
    await expect(button(page, "Save entry")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(button(page, "Saved in this session")).toBeDisabled();
    await tab(page, "Home").click();
    await expect(tab(page, "Home")).toHaveAttribute("aria-selected", "true");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
});
