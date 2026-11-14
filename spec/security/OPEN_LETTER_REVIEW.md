# Open Letter privacy and dependency review

Reviewed 2026-11-14 for build `1114-OpenLetterRedesign`. This is a source and focused-test review of the fictional local prototype, not an independent penetration test or production security approval. The master integration and Android reports record the final tested commit.

## Boundaries checked

| Boundary | Evidence and result |
| --- | --- |
| Journal authorship | Journal screens read `journals[role]`. Saved-entry comparison uses that same author list. Parent administration has no journal read path. The demo selector can still choose either fictional account, so this is UI separation, not authentication. |
| Drafts on account switch | `switchRole` asks before clearing nonempty unsaved journal/message writing. The approved switch clears journal editor, message draft, selected recipient, response preference and in-person state; saved entries remain keyed to their fictional author. Tab navigation retains the current draft in memory. |
| Routes | Router parameters contain screen names only. Journal text, messages, recipient names and private drafts are not added to navigation URLs. Unknown screen names fall back to onboarding. |
| Persistence | The only application storage calls found are appearance reads/writes under `between-us.appearance`. Values are `system`, `light` or `dark`, with unknown values returning to device appearance. No journal, message, contact, identity, role or report persistence was found. AsyncStorage is unencrypted; the theme-only exception must remain narrow. |
| Sending and connections | `sendMessage` resolves the current contact again and excludes the current demo person. `createMessage` requires a verified, accepted connection and nonblank words. Blocking/removal clears acceptance/verification, so approval alone cannot unlock a send. UI review remains required before the explicit simulated-send action. |
| Thread participants | `threadFor` includes outgoing messages only for the selected recipient and incoming messages only when both fictional participants match. A conversation with another contact does not include the parent/child thread. |
| Optional journal reflection | Reflection runs only after a saved entry and an explicit action. Output uses fixed conversation-only templates, not copied journal text or inferred mental state. Editing disables the old suggestion. The separate-message action now supplies an empty recipient, requiring the author to choose a person; the in-person action requires no app connection. |
| Unsafe guardian path | Safety is available from onboarding/settings without parental approval. It explicitly permits another trusted adult and prepares words in person. It does not send a report to an alleged unsafe guardian, invent a hotline number, or claim emergency dispatch. |
| Check-ins | Child management routes deny schedule editing; state mutations check parent permission. Child skip/later actions have no score, streak or reminder transport. Actual delivery and operational enforcement do not exist. |

No application content-network request, external AI call, analytics, or private-text log was found in the reviewed source. This does not protect against device screenshots, memory inspection, developer tools, a shared unlocked device, OS keyboards, backups, or a compromised operating system. Do not enter real children's information.

## Findings raised during implementation

1. **Journal recipient default corrected.** The reflection's separate-message action initially inherited the normal parent default. It now passes an empty recipient, so writing about an unsafe parent cannot silently preselect that parent through the journal path. The generic starter remains editable and never contains entry text. The master should verify deliberate recipient selection in the browser workflow.
2. **Cross-conversation draft transfer corrected in source.** Opening a different thread initially reused the global unsent draft. The reviewed `openConversation` implementation now confirms before discarding previous-person words and clears them when the recipient changes. Calls from the conversation list use that method. The master should exercise cancel/confirm behavior in integrated UI tests.
3. **Appearance save-error race corrected in source.** A failed earlier queued write could set an error after a newer selection cleared it. The reviewed implementation now increments `writeVersion` for each selection, lets only that version set write errors, and clears the error after the latest successful write. This correction addresses stale write feedback; it does not change content storage or imply encrypted preferences. Failure/retry behavior still needs the master's integrated test results.
4. **Schedule recipient guard corrected in source.** The initial scheduler allowed saving when its selected child had been blocked/removed because validity checked only question, days and time. The reviewed scheduler validity and `saveSchedule` state mutation now both require the chosen fictional child to remain available and unblocked/unremoved. Parent permission is checked again in state. This is a local fixture guard; actual delivery would additionally require verified server identity, authorization, acceptance and revocation checks.

## Focused checks performed

`npx tsx --test tests/communication.test.ts tests/journal.test.ts tests/model.test.ts tests/messaging.test.ts` passed **13 tests, zero failures** at this review. They cover all connection status/flag combinations, revocation, unauthorized contact management, fixed reflection output/no-copy behavior, saved versus dirty journal writing, author entry comparisons, participant filtering and example timestamp labeling. Targeted journal ESLint and the TypeScript check passed before the full screen integration. `git diff --check` passed.

These checks do not establish server access control or validate native screen-reader behavior. No extra test was added merely to inspect source-code strings or duplicate existing domain assertions. UI account-switch confirmation, recipient selection and cancellation need real integrated interaction checks recorded by the master.

## Dependency finding

Read-only `npm audit --json` reported **eight moderate findings, zero high/critical**. The chain is driven by `minimatch@10.2.6`, through `@expo/fingerprint@0.21.10` and `@typescript-eslint/typescript-estree@8.72.2`. The [reviewed upstream advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) marks versions `>=7.0.0 <11.0.1` affected by attacker-controlled glob amplification; [11.0.1 is the first patched release](https://github.com/isaacs/minimatch/releases/tag/v11.0.1).

The npm metadata queried during review still lists fingerprint `0.21.10` with `^10.2.6` and estree `8.72.2` with `^10.2.2` as their latest versions. Therefore there is no currently published, patched version within those declared 10.x ranges. A forced Expo downgrade is not an appropriate automatic fix.

The narrow candidate for evaluation is a scoped override to a reviewed patched 11.x version, leaving unrelated minimatch 3.x dependencies alone. The dependents use the exported `minimatch` function and `Minimatch` object methods/properties; the current 11.0.8 package supports Node `20 || >=22`, including this workstation's Node 26. Those facts make a compatibility experiment reasonable, but a major-version override cannot honestly be called guaranteed nonbreaking. Before adopting it, test fingerprint ignore/negation/dotfile handling, TypeScript ESLint project-service patterns, lint/typecheck, Expo Doctor, dependency audit and native/web exports. Remove the override when maintained upstream dependencies accept a patched version. This reviewer made no dependency or lockfile changes.

## Next secure implementation phase

Keep journals/drafts/messages in memory until identity and storage design is reviewed. Before connecting real accounts, choose the age/consent and family-relationship model, then test deny-by-default object authorization independently of family administration. Verify contacts and acceptance through trusted server evidence, including immediate revocation and offline/queued-send races. Review journal key custody, device lock, recovery, multi-device access, export/deletion/backups and logging before selecting an encryption/storage implementation. Do not invent encryption.

Real messages, notifications and schedules need server reauthorization, neutral notification content, timezone/recurrence semantics, operational abuse handling and confidential unsafe-guardian reporting. Owner approval is required before credentials, paid services or production deployment. No provider has been selected or connected by this review, and no compliance or encryption claim is made.
