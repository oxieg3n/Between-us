import { readFileSync } from "node:fs";
import { localUiFixturePath } from './fixture-path';
import { expect, test, type Locator, type Page } from "@playwright/test";
import AccessibilityScanner from "@axe-core/playwright";

type Credentials = { email: string; password: string };
type MobileFixture = {
  parent: Credentials;
  child: Credentials & { name: string };
  conversation: { id: string };
  financeArchiveQa?: { occurrenceId: string };
};
function readFixture(): MobileFixture {
  try { return JSON.parse(readFileSync(localUiFixturePath(process.env.BETWEENUS_PRODUCTION_UI_FIXTURE), "utf8")); }
  catch { throw new Error("The ignored fictional mobile fixture is unavailable; credential values are suppressed."); }
}
const fixture = readFixture();
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
async function enterCredential(field: Locator, value: string) {
  // Suppress native Playwright fill errors that could repeat a supplied credential in the call log.
  try { await field.fill(value); }
  catch { throw new Error("Could not enter the fictional credential; its value is suppressed."); }
}
async function scan(page: Page) {
  const result = await new AccessibilityScanner({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations).toEqual([]);
}
async function start(page: Page) {
  await page.goto("/accounts");
  // A cold Expo development bundle is setup; interaction assertions retain their shorter default.
  await expect(heading(page, "A place to start, together.")).toBeVisible({ timeout: 60_000 });
}
async function signIn(page: Page, account: Credentials) {
  await button(page, "Sign in").click();
  await expect(heading(page, "Welcome back")).toBeVisible();
  await enterCredential(page.getByRole("textbox", { name: "Email or child account identifier", exact: true }), account.email);
  await enterCredential(page.getByLabel("Password", { exact: true }), account.password);
  await button(page, "Sign in").click();
  await expect(button(page, "Write privately")).toBeVisible();
  await expect(button(page, "Talk to someone")).toBeEnabled();
}
async function signOut(page: Page) {
  await button(page, "Settings").click();
  await button(page, "Sign out on this device").click();
  await expect(heading(page, "A place to start, together.")).toBeVisible();
  await expect(button(page, "Sign in")).toBeEnabled();
}
async function openConversation(page: Page) {
  await button(page, "Chats").click();
  await page.getByRole("button",{name:/^Open conversation with /}).first().click();
  await expect(heading(page, "Your conversation")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your words", exact: true })).toBeVisible();
}
async function openFinance(page: Page) {
  await button(page, "Chores & savings").click();
  const scope = button(page, `Financial records: ${fixture.child.name}`);
  if (await scope.count()) await scope.click();
  await expect(heading(page, `${fixture.child.name}'s financial plans`)).toBeVisible();
  await expect(button(page, "Refresh from server")).toBeEnabled();
  await expect(page.getByText(/^Approved earnings:/)).toBeVisible();
}
async function confirmFinance(page: Page) {
  await button(page, "Confirm financial action").click();
  await expect(page.getByText("Saved by the server. No money was transferred.", { exact: true })).toBeVisible();
  await expect(button(page, "Refresh from server")).toBeEnabled();
}
function cents(text: string) {
  const value = /\$([\d,]+)\.(\d{2})/.exec(text);
  if (!value) throw new Error("Expected a displayed fictional USD balance.");
  return Number(value[1].replaceAll(",", "")) * 100 + Number(value[2]);
}

test("public welcome requires joint guardian setup at every age and keeps help public", async ({ page }) => {
  await start(page);
  await expect(page.getByText("Parents and guardians set up Between Us together with their child or teen, at every age. Each person has their own account.", { exact: true })).toBeVisible();
  await expect(button(page, "Create a parent account")).toBeVisible();
  await scan(page);
  await button(page, "Join with my guardian").click();
  await expect(heading(page, "Join with your guardian")).toBeVisible();
  await expect(page.getByText(/whether you are a child or a teen/)).toBeVisible();
  await expect(page.getByRole("button", { name: /create.*child.*account|teen.*self.*sign/i })).toHaveCount(0);
  await button(page, "Help").click();
  await expect(heading(page, "A safe person can help.")).toBeVisible();
  await expect(page.getByText(/You do not need permission to seek help/)).toBeVisible();
  await button(page, "Close help").click();
  await expect(heading(page, "Join with your guardian")).toBeVisible();
});

test("guardian can create a pending child but cannot self-verify consent or activate it", async ({ page }) => {
  await start(page); await signIn(page, fixture.parent);
  await button(page, "Set up with my child or teen").click();
  const name = `Fictional UI Pending ${Date.now()}`;
  await page.getByRole("textbox", { name: "Child or teen's name (fictional only)", exact: true }).fill(name);
  await button(page, "Create pending child profile").click();
  await expect(page.getByText("Pending profile and consent request saved. Independent verification is required before enrollment.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /verify.*consent|approve.*consent|self.verify/i })).toHaveCount(0);
  await enterCredential(page.getByLabel("Password", { exact: true }), fixture.child.password);
  await button(page, `Set up ${name}'s separate account`).click();
  await expect(page.getByText("Joint guardian onboarding or consent is incomplete.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Child account identifier and one-time invitation")).toBeEmpty();
});

test("independent child sign-in exposes child functions and no guardian administration", async ({ page }) => {
  await start(page); await signIn(page, fixture.child);
  await expect(button(page, "Set up with my child or teen")).toHaveCount(0);
  await expect(button(page, "Invite a guardian")).toHaveCount(0);
  await scan(page);
  await openFinance(page);
  await expect(button(page, "My chores")).toBeVisible();
  await expect(button(page, "Parent matching")).toHaveCount(0);
  await expect(button(page, "Allowance budget and reminders")).toHaveCount(0);
});

test("report and message drafts stay separate and sign-out clears them before child access", async ({ page }) => {
  await start(page); await signIn(page, fixture.parent); await openConversation(page);
  const draft = `Fictional parent unsent ${Date.now()}`, report = `Fictional confidential report ${Date.now()}`;
  await page.getByRole("textbox", { name: "Your words", exact: true }).fill(draft);
  await button(page, "Review message").click();
  await expect(heading(page, "Review your words")).toBeVisible();
  await expect(page.getByText(draft, { exact: true })).toBeVisible();
  await expect(page.getByText(/^To: .+/)).toBeVisible();
  await expect(page.getByText("Response: listen", { exact: true })).toBeVisible();
  await button(page, "Help & safety").click();
  await page.getByRole("textbox", { name: "Report description (sent only when you submit)", exact: true }).fill(report);
  await openConversation(page);
  await expect(page.getByRole("textbox", { name: "Your words", exact: true })).toHaveValue(draft);
  await expect(page.getByText(report, { exact: true })).toHaveCount(0);
  await signOut(page); await signIn(page, fixture.child); await openConversation(page);
  await expect(page.getByRole("textbox", { name: "Your words", exact: true })).toHaveValue("");
  await expect(page.getByText(draft, { exact: true })).toHaveCount(0);
  await button(page, "Help & safety").click();
  await expect(page.getByRole("textbox", { name: "Report description (sent only when you submit)", exact: true })).toHaveValue("");
  await expect(page.getByText(report, { exact: true })).toHaveCount(0);
});

test("both appearance choices persist through real reload and remain accessible", async ({ page }) => {
  await start(page);
  for (const choice of [{ label: "Night Harbor · Dark", value: "dark" }, { label: "Safe Harbor · Light", value: "light" }]) {
    await button(page, "Settings").click();
    await button(page, choice.label).click();
    await expect(button(page, choice.label)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("between-us.appearance"))).toBe(choice.value);
    await scan(page); await page.reload();
    await expect(heading(page, "A place to start, together.")).toBeVisible();
    await button(page, "Settings").click();
    await expect(button(page, choice.label)).toHaveAttribute("aria-pressed", "true");
    await scan(page);
    await button(page, "Back").click();
  }
});

test("browser journal stays unavailable with no plaintext input or account-token persistence", async ({ page }) => {
  await start(page); await signIn(page, fixture.child);
  await button(page, "Write privately").click();
  await expect(heading(page, "Device journal unavailable")).toBeVisible();
  await expect(page.getByText(/no browser journal storage is created/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Private journal writing", exact: true })).toHaveCount(0);
  await expect(button(page, "Create and unlock my device journal")).toHaveCount(0);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.filter(key => key !== "between-us.appearance")).toEqual([]);
  await button(page, "Help").click();
  await expect(heading(page, "A safe person can help.")).toBeVisible();
  await button(page, "Close help").click();
  await expect(heading(page, "Device journal unavailable")).toBeVisible();
  await scan(page);
});

test("leaving recovery cannot reuse its proposed password on the sign-in form", async ({ page }) => {
  await start(page); await button(page, "Sign in").click();
  await button(page, "Recover my account").click();
  await expect(heading(page, "Recover your own account")).toBeVisible();
  await enterCredential(page.getByLabel("Password", { exact: true }), "Fictional form-only proposal 2026");
  await button(page, "Back").click(); await button(page, "Sign in").click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});

test("real server chore workflow requires child submission and parent approval, with public help during review", async ({ page }) => {
  test.setTimeout(180_000);
  await start(page); await signIn(page, fixture.parent); await openFinance(page);
  const baseline = cents(await page.getByText(/^Approved earnings:/).innerText());
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const day = `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}-${parts.find(p=>p.type==='day')!.value}`;
  await button(page, "Allowance budget and reminders").click();
  await page.getByRole("textbox", { name: "Allowance pool (USD)", exact: true }).fill("30.00");
  await page.getByRole("textbox", { name: "Period starts (YYYY-MM-DD)", exact: true }).fill(day);
  await button(page, "Review allowance settings").click(); await confirmFinance(page);
  await button(page, "All financial sections").click(); await button(page, "Assign and review chores").click();
  await button(page, "Assign a chore").click();
  const chore = `Fictional UI chore ${Date.now()}`;
  await page.getByRole("textbox", { name: "Chore title", exact: true }).fill(chore);
  await page.getByRole("textbox", { name: "Reward per occurrence (USD)", exact: true }).fill("3.00");
  await page.getByRole("textbox", { name: "First date (YYYY-MM-DD)", exact: true }).fill(day);
  await button(page, "Review chore assignment").click();
  await expect(heading(page, "Assign this chore?")).toBeVisible();
  await button(page, "Help").click(); await expect(heading(page, "A safe person can help.")).toBeVisible();
  await button(page, "Close help").click(); await expect(heading(page, "Assign this chore?")).toBeVisible();
  await confirmFinance(page);
  await button(page, "Back to account").click(); await signOut(page);
  await signIn(page, fixture.child); await openFinance(page); await button(page, "My chores").click();
  await page.getByRole("textbox", { name: "Completion note", exact: true }).fill("Fictional completion for the UI workflow.");
  await button(page, `Review completion: ${chore}`).click(); await confirmFinance(page);
  await expect(button(page, `Review completion: ${chore}`)).toHaveCount(0);
  await button(page, "Back to account").click(); await signOut(page);
  await signIn(page, fixture.parent); await openFinance(page); await button(page, "Assign and review chores").click();
  await button(page, `Approve: ${chore}`).click(); await confirmFinance(page);
  await button(page, "All financial sections").click();
  await expect.poll(async () => cents(await page.getByText(/^Approved earnings:/).innerText())).toBe(baseline + 300);
  await expect(page.getByText("Saved by the server. No money was transferred.", { exact: true })).toHaveCount(0);
  await scan(page);
});

test('own account controls require fresh authentication and record an export without claiming completion', async ({page})=>{
  await start(page);await signIn(page,fixture.parent);
  await button(page,'Settings').click();await button(page,'Account, devices & data privacy').click();
  await expect(heading(page,'Signed-in sessions')).toBeVisible();
  await expect(button(page,'Refresh own account information')).toBeEnabled();
  await expect(button(page,'Request my own export')).toBeDisabled();
  await enterCredential(page.getByLabel('Current account password',{exact:true}),fixture.parent.password);
  await button(page,'Confirm my account for this action').click();
  await expect(page.getByText('Account check confirmed for a short time. Choose the separate action below.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Current account password',{exact:true})).toBeEmpty();
  await button(page,'Request my own export').click();
  await expect(heading(page,'Own export job')).toBeVisible();
  await expect(page.getByText('Request recorded. Independent review and execution are separate; no completion is promised.',{exact:true})).toBeVisible();
  await expect(page.getByText('Status: requested',{exact:true})).toBeVisible();
  await scan(page);
});

test('account sign-out works while an unrelated chat request is still pending',async({page})=>{
  await start(page);await signIn(page,fixture.parent);
  let release!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/rest/v1/rpc/list_conversations_page',async route=>{await held;await route.continue().catch(()=>{});});
  try {
    await button(page,'Chats').click();
    await button(page,'Settings').click();await button(page,'Account, devices & data privacy').click();
    await expect(button(page,'Refresh own account information')).toBeEnabled();
    await button(page,'Sign out').click();
    await expect(heading(page,'A place to start, together.')).toBeVisible();
  } finally {release();}
  await expect(heading(page,'A place to start, together.')).toBeVisible();
});

test('another authorized device receives server updates without losing its unsent draft',async({page,browser})=>{
  await start(page);await signIn(page,fixture.parent);await openConversation(page);
  // Separate browser profiles model separate devices; same-origin tabs share Auth broadcasts.
  const otherDevice=await browser.newContext({baseURL:'http://127.0.0.1:8081',viewport:{width:390,height:844}});
  const child=await otherDevice.newPage();
  try {
    await start(child);await signIn(child,fixture.child);await openConversation(child);
    const draft=`Fictional private child draft ${Date.now()}`;
    await child.getByRole('textbox',{name:'Your words',exact:true}).fill(draft);
    const words=`Fictional live conversation ${Date.now()}`;
    await page.getByRole('textbox',{name:'Your words',exact:true}).fill(words);
    await button(page,'Review message').click();await button(page,'Send reviewed message').click();
    await expect(child.getByText(words,{exact:true})).toBeVisible({timeout:30_000});
    await expect(child.getByRole('textbox',{name:'Your words',exact:true})).toHaveValue(draft);
  } finally {await otherDevice.close();}
});

test('late previous-author send failure cannot replace the next author review',async({page})=>{
  await start(page);await signIn(page,fixture.parent);await openConversation(page);
  await page.getByRole('textbox',{name:'Your words',exact:true}).fill('Fictional previous parent words.');
  await button(page,'Review message').click();
  let release!:()=>void,started!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{started=resolve;});
  await page.route('**/rest/v1/rpc/send_message',async route=>{started();await held;await route.abort('connectionfailed').catch(()=>{});});
  try{
    await button(page,'Send reviewed message').click();await requested;
    await signOut(page);await signIn(page,fixture.child);await openConversation(page);
    const childWords='Fictional current child words stay in this review.';
    await page.getByRole('textbox',{name:'Your words',exact:true}).fill(childWords);await button(page,'Review message').click();
    release();
    await expect(heading(page,'Review your words')).toBeVisible();
    await expect(page.getByText(childWords,{exact:true})).toBeVisible();
    await expect(button(page,'Send reviewed message')).toBeEnabled();
    await expect(page.getByText('Fictional previous parent words.',{exact:true})).toHaveCount(0);
  }finally{release();}
});


test('late previous-author verification denial cannot cover the next signed-in account',async({page})=>{
  await page.clock.install({time:new Date()});
  await start(page);await signIn(page,fixture.parent);
  let release!:()=>void,started!:()=>void,held=false;
  let heldRequest:import('@playwright/test').Request|undefined;
  const gate=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{started=resolve;});
  await page.route('**/rest/v1/rpc/get_context',async route=>{
    if(held){await route.continue();return;}
    held=true;heldRequest=route.request();started();await gate;
    await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501'})}).catch(()=>{});
  });
  try{
    await page.clock.fastForward(61_000);await requested;
    await signOut(page);await signIn(page,fixture.child);
    const response=page.waitForResponse(value=>value.request()===heldRequest);
    release();await (await response).finished();await page.clock.runFor(250);
    await expect(page.getByText('Hi, Alex.',{exact:true})).toBeVisible();
    await expect(button(page,'Talk to someone')).toBeEnabled();
    await expect(button(page,'Write privately')).toBeEnabled();
  }finally{release();}
});


test('financial history keeps bounded older records and private parent matching behind the current account', async ({page}) => {
  test.setTimeout(180_000);
  const openOlder = async () => {
    await button(page, 'Financial history').click();
    await button(page, 'Older settled financial records').click();
    await button(page, 'Load older settled records').click();
    await expect(button(page, 'Refresh older records')).toBeEnabled();
  };
  const chooseGarden = async () => {
    const garden = button(page, 'Open settled record: Fictional garden watering · ' + fixture.financeArchiveQa!.occurrenceId.slice(-10));
    for (let pageNumber = 0; pageNumber < 6 && await garden.count() === 0; pageNumber++) {
      await button(page, 'Next page of settled records').click();
      await expect(button(page, 'Refresh older records')).toBeEnabled();
    }
    await garden.click();
    await expect(heading(page, 'Fictional garden watering')).toBeVisible();
  };
  await start(page); await signIn(page, fixture.child); await openFinance(page);
  await expect(button(page, 'Parent matching')).toHaveCount(0);
  await openOlder();
  if (fixture.financeArchiveQa) {
    await chooseGarden();
    await button(page, 'Review historical receipt acknowledgment').click();
    await expect(heading(page, 'Did you receive this amount?')).toBeVisible();
    await expect(button(page, 'Confirm financial action')).toBeEnabled();
    await button(page, 'Return to editing').click();
  } else await expect(page.getByText('No older settled records are available in this page.', {exact: true})).toBeVisible();
  await scan(page);
  await button(page, 'Back to account').click(); await signOut(page);
  await signIn(page, fixture.parent); await openFinance(page); await openOlder();
  if (fixture.financeArchiveQa) {
    await chooseGarden();
    await page.getByRole('textbox', {name: 'Reason for a historical correction', exact: true}).fill('Fictional review only; original sources stay intact.');
    await button(page, 'Review historical earning correction: Fictional garden watering').click();
    await expect(heading(page, 'Correct this historical earning?')).toBeVisible();
    await button(page, 'Return to editing').click();
  }
  await button(page, 'All financial sections').click(); await button(page, 'Parent matching').click();
  await button(page, 'Open and older matching records').click();
  await button(page, 'Load open matching records').click();
  await expect(button(page, 'Refresh open matching records')).toBeEnabled();
  await button(page, 'Load older parent matching records').click();
  await expect(button(page, 'Refresh parent matching history')).toBeEnabled();
  if (fixture.financeArchiveQa) await expect(button(page, 'Review revealing this retained contribution')).toBeEnabled();
  await scan(page);
});
