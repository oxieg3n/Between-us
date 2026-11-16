import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

type Credentials = {email:string;password:string};
type Fixture = {parent:Credentials;child:Credentials & {name:string}};
function readFixture():Fixture {
  try {
    const value = JSON.parse(readFileSync(resolve(__dirname,'../../../services/backend/.local/mobile-fixture.json'),'utf8'));
    if (![value.parent,value.child].every(account => typeof account?.email === 'string' && /^[^@\s]+@[^@\s]+\.test$/i.test(account.email)
      && typeof account?.password === 'string' && account.password.length >= 12) || typeof value.child.name !== 'string' || !value.child.name) throw new Error();
    return value;
  } catch { throw new Error('The ignored local fictional settings fixture is unavailable or invalid; credential values are suppressed.'); }
}
const fixture = readFixture();
test.use({trace:'off',video:'off',screenshot:'off'});
const button = (page:Page,name:string) => page.getByRole('button',{name,exact:true});
const heading = (page:Page,name:string) => page.getByRole('heading',{name,exact:true});
const field = (page:Page,name:string) => page.getByRole('textbox',{name,exact:true});
async function enterCredential(target:Locator,value:string) {
  try { await target.fill(value); }
  catch { throw new Error('Could not enter the fictional credential; its value is suppressed.'); }
}
async function signIn(page:Page,account:Credentials) {
  await page.goto('/accounts');
  await expect(heading(page,'A place to start, together.')).toBeVisible();
  await button(page,'Sign in').click();
  await expect(heading(page,'Welcome back')).toBeVisible();
  await enterCredential(field(page,'Email or child account identifier'),account.email);
  await enterCredential(page.getByLabel('Password',{exact:true}),account.password);
  await button(page,'Sign in').click();
  await expect(button(page,'Write privately')).toBeVisible();
}
async function openNotifications(page:Page) {
  await button(page,'Settings').click(); await button(page,'Notification preferences').click();
  await expect(heading(page,'Room for quiet.')).toBeVisible();
  await expect(button(page,'Save notification preferences')).toBeEnabled();
}
const timezone = 'Notification time zone (IANA name)',quietStart = 'Quiet hours start (0–23)',quietEnd = 'Quiet hours end (0–23)';
type Preferences = {enabled:boolean;timezone:string;start:string;end:string};
async function savePreferences(page:Page,value:Preferences) {
  const allow = button(page,'Allow neutral notifications');
  if (await allow.getAttribute('aria-pressed') !== String(value.enabled)) await allow.click();
  await field(page,timezone).fill(value.timezone); await field(page,quietStart).fill(value.start); await field(page,quietEnd).fill(value.end);
  await button(page,'Save notification preferences').click();
  await expect(page.getByText('Preferences saved by the server. Actual device delivery is not confirmed.',{exact:true})).toBeVisible();
}

test('notification quiet hours validate, persist through reopening, and remain unchanged when notifications turn off',async({page})=>{
  await signIn(page,fixture.parent); await openNotifications(page);
  const original:Preferences = {enabled:await button(page,'Allow neutral notifications').getAttribute('aria-pressed') === 'true',
    timezone:await field(page,timezone).inputValue(),start:await field(page,quietStart).inputValue(),end:await field(page,quietEnd).inputValue()};
  try {
    await expect(page.getByText('Push delivery is not operational in this development environment. Saving a preference does not enable delivery.',{exact:true})).toBeVisible();
    await expect(button(page,'Register this device for neutral notifications')).toBeDisabled();
    await expect(page.getByText('Browser review does not register push tokens.',{exact:true})).toBeVisible();
    await field(page,quietStart).fill('24'); await button(page,'Save notification preferences').click();
    await expect(page.getByText('Use whole hours from 0 to 23.',{exact:true})).toBeVisible();
    await savePreferences(page,{enabled:true,timezone:'America/New_York',start:'21',end:'7'});
    await button(page,'Back').click(); await openNotifications(page);
    await expect(button(page,'Allow neutral notifications')).toHaveAttribute('aria-pressed','true');
    await expect(field(page,timezone)).toHaveValue('America/New_York');
    await expect(field(page,quietStart)).toHaveValue('21'); await expect(field(page,quietEnd)).toHaveValue('7');
    await button(page,'Turn notifications off now').click();
    await expect(page.getByText('Notifications disabled. Pending deliveries are checked against this preference again.',{exact:true})).toBeVisible();
    await button(page,'Back').click(); await openNotifications(page);
    await expect(button(page,'Allow neutral notifications')).toHaveAttribute('aria-pressed','false');
    await expect(field(page,quietStart)).toHaveValue('21'); await expect(field(page,quietEnd)).toHaveValue('7');
  } finally {
    // Restore the fictional account's settings through the UI, including after a failed assertion.
    await openNotifications(page); await savePreferences(page,original);
  }
});

test('guardian roster refreshes approved members and cancellation preserves child membership',async({page})=>{
  await signIn(page,fixture.parent); await button(page,'Family & guardian access').click();
  await expect(heading(page,'Family members')).toBeVisible();
  await expect(button(page,'Refresh family access')).toBeEnabled();
  await expect(heading(page,fixture.child.name)).toBeVisible();
  await expect(page.getByRole('heading',{name:/ \(you\)$/})).toBeVisible();
  await expect(page.getByText('Child / teen',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Active guardians manage membership. This never opens another person\'s account, journal, drafts or privacy cases.',{exact:true})).toBeVisible();
  await button(page,'Refresh family access').click();
  await expect(button(page,`Remove ${fixture.child.name} from this family`)).toBeEnabled();
  await button(page,`Remove ${fixture.child.name} from this family`).click();
  await expect(heading(page,`Remove ${fixture.child.name}?`)).toBeVisible();
  await expect(button(page,'Confirm family membership removal')).toBeVisible();
  await button(page,'Keep membership').click();
  await expect(button(page,'Confirm family membership removal')).toHaveCount(0);
  await button(page,'Refresh family access').click();
  await expect(heading(page,fixture.child.name)).toBeVisible();
  await expect(button(page,'Guardian invitation workflows')).toBeEnabled();
});

test('child can open only their notification preferences and has no guardian roster entry point',async({page})=>{
  await signIn(page,fixture.child);
  await expect(button(page,'Family & guardian access')).toHaveCount(0);
  await expect(button(page,'Invite a guardian')).toHaveCount(0);
  await openNotifications(page);
  await expect(heading(page,'Your preferences')).toBeVisible();
  await expect(button(page,'Save notification preferences')).toBeEnabled();
  await expect(button(page,'Register this device for neutral notifications')).toBeDisabled();
  await expect(button(page,'Refresh family access')).toHaveCount(0);
});
