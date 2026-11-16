# Production UI regression plan

Date: 2026-11-16. Status: eight source-defined browser scenarios; not executed by this helper. They exercise the actual rendered production routes and configured local managed Auth/RPC/HTTP services. They do not inject application state, replace API responses, fake browser storage or bypass consent/identity rules. The master is the sole service/browser/native operator.

Source validation completed: full mobile TypeScript checking and focused ESLint for `e2e-production/accounts.spec.ts` and `playwright.production.config.ts` pass. These are source checks, not browser results.

## Fixture and service contract

The master creates the ignored `services/backend/.local/mobile-fixture.json` from fictional real managed Auth users. Never print, attach, commit or publish its passwords, sessions or contents. Required shape:

```ts
{
  publicKey: string;  // local publishable/anon client key, never service_role
  url: string;        // local Supabase URL
  apiUrl: string;     // local custom HTTP API URL
  parent: { email: string; password: string };
  child: { email: string; password: string; name: string };
  conversation: { id: string };
}
```

Both users must be active independent accounts with verified required setup. Emails must be reserved `.test` addresses; credentials are generated locally. The parent must have current guardian authority over the child's family; the child must have current independently verified consent and accepted joint enrollment. `child.name` is the exact visible display name used by the financial scope selector. Seed one accepted, independently verified, unblocked parent/child contact and its existing conversation; both accounts must be authorized to open `conversation.id`. Use a fresh family/financial fixture for the initial run, with no uncertain pending mutations. No operator credentials are needed by the browser tests.

The configuration refuses non-loopback or non-HTTP backend/API fixture endpoints. It reads the fixture from `../../services/backend/.local/mobile-fixture.json` relative to the mobile config directory; the test file resolves the same file from its own directory. Missing/malformed fixture errors suppress contents. Credential entry wraps fill failures with fixed messages. Trace/video/screenshots are disabled, and only the list reporter is configured. Do not run with verbose Playwright API debugging that might log credential-entry arguments.

The master starts the local backend stack and Node API on 8787. Run the existing demo suite first, stop its Expo server, then run the production configuration. Production configuration starts a fresh Expo server on 8081 with explicit production mode and fixture-derived public URLs/key. `reuseExistingServer:false` intentionally refuses to reuse the demo server. Do not run the two suites or other browser/native operations concurrently.

## Eight scenarios

| Scenario | Observable acceptance |
| --- | --- |
| Public welcome / all ages | Welcome states joint guardian setup at every age; child join has its independent sign-in and no self-signup bypass; public Help opens/closes without login. Stable welcome is scanned with axe WCAG 2 A/AA tags. |
| Pending child / consent | Real guardian creates a uniquely named fictional pending profile and consent request. No self-verification button exists. Attempting account activation without independent consent fails with the backend's incomplete-consent result and supplies no invitation material. |
| Child authority | Real child signs in to their own account. Guardian setup/invitation controls, parent matching and allowance administration are absent; the child's own financial functions remain present. Stable home is axe-scanned. |
| Draft/report/account boundaries | Parent prepares a message review with visible recipient/response, writes a separate confidential report draft, then revisits the conversation. Message text remains its own draft. After actual UI sign-out and child sign-in, both message/report fields are blank and parent sentinels are absent. Nothing is submitted as a report or sent as a message in this scenario. |
| Appearance persistence | Dark and light are selected through the UI, persisted under the approved appearance key and retained after actual reload. Stable settings in both themes are axe-scanned. |
| Browser journal boundary | Signed-in child opens Journal and sees the unsupported device-vault state; no private journal textbox or enrollment action exists. Browser storage contains no token/journal fallback keys. Public Help returns to that same state; the stable page is axe-scanned. This does not test SQLCipher. |
| Credential purpose | A proposed recovery password is entered but not submitted. Leaving recovery and opening sign-in yields an empty password field. No recovery email/request is sent. |
| Server financial workflow | Parent configures a fictional allowance and assigns a unique $3 chore. Public Help opens while assignment Review is pending, then returns to the same pending Review. Child submits completion; parent approves separately; approved earnings increase by exactly $3 relative to the recorded baseline. All mutations use normal UI Review/Confirm and actual server authorization. No money is transferred. Stable financial overview is axe-scanned. |

An optional ninth scenario can cover two different recipients' retained-review regression if the master seeds a second permitted parent conversation and supplies its identifier. The initial eight do not claim two-contact race coverage; they cover purpose and cross-account draft isolation. Request/session races remain covered separately by portable boundary tests and backend authorization tests.

Tests create fictional pending profiles and finance events; they are not automatically undone. Retries are disabled so a failed mutation is not silently replayed with a new operation identity. Reset/reseed the synthetic fixture when rerunning mutations near allowance limits or when investigating uncertain results. The financial scenario has a longer timeout because it signs in as each real actor in sequence. Test outcomes must report actual counts and failures, not treat source presence or axe setup as a pass.

## Root execution and evidence

From PowerShell, after the master has prepared the fixture/services and stopped the demo Expo process:

```powershell
Set-Location 'D:\projects\BetweenUs\apps\mobile'
node .\node_modules\@playwright\test\cli.js test --config .\playwright.production.config.ts
```

Keep fixture contents and generated account/session material out of terminal output, reports and version control. `test-results/production` is inside the existing ignored test-results directory. Root may collect redacted screenshots separately after credential fields are cleared and only with fictional content. The helper does not start services, launch Chrome, execute the browser suite, operate ADB or build native binaries.

## Limits and native gates

Browser checks cannot validate native SQLCipher, actual key protection/invalidation, local module compilation, backup/device-transfer exclusion, iOS app-switcher snapshots, biometric own-prompt interruption, Android keyboard layout, physical VoiceOver/TalkBack behavior, cancellation under native memory pressure or secure deletion. Those remain physical Android/iOS and independent review gates in `JOURNAL_STORAGE.md` and the integration review. Axe is an automated baseline, not a complete accessibility audit. Public enrollment, real child data and production service activation remain closed pending their established approvals.
