# Mobile integration review

Date: 2026-11-16. Scope: source review of the new production application, account client/session storage, route entry points and backend HTTP API before native QA. The master edited the integration while this review ran; locations below identify the observed source snapshot and may move. This is a bounded engineering review, not independent security approval, legal certification or proof of hardware behavior.

Reviewed: `apps/mobile/src/production/Application.tsx`, `client.ts`, `session-storage.ts`, `session-storage.native.ts`, new `session-boundary.ts`, `apps/mobile/src/app/index.tsx`, `accounts.tsx`, and `services/backend/src/api.ts`. Relevant callers inspected: `local-server.ts`, function entry point, identity RPCs and the installed Supabase authentication/fetch implementation. Root-owned application/backend source was not modified by this reviewer.

## Findings and remaining regression evidence

The master has now applied source fixes for the four findings below. Their original triggers are retained to explain the required regressions. Remaining open items are native credential-removal failure, ambiguous message retries, global lifecycle/revocation integration and rendered/device verification, rather than a claim that all original source defects remain present.

### P1: Global sign-out failure can retain the current local session

Observed source: `apps/mobile/src/production/Application.tsx:211`, global branch immediately following the local sign-out branch. Global sign-out awaited the remote SDK result, then threw on error before generation invalidation, private-state clearing and welcome navigation. A network failure therefore left the old account's client/session state accessible after the author requested all-device sign-out.

The local scope has a material distinction: inspected installed `@supabase/auth-js/src/GoTrueClient.ts:4132` removes the local session and emits `SIGNED_OUT` before sending the request. Retryable refresh failure also removes the local session at line 4119. The application's existing `SIGNED_OUT` listener clears local UI. Therefore the ordinary local-network-failure path is already cleared by this SDK version; it must not be described as the same confirmed defect as global scope. Storage failures and global errors still need explicit handling.

Observed source fix: both actions now invalidate/clear/navigate immediately and invoke `client.ts`'s `signOutAccount`. It captures the already cached token, stops auto-refresh and removes the fixed local session/verifier keys before requesting managed remote logout. It does not await a new token refresh before local removal. This addresses the ordinary global network-failure path in source. The final notice distinguishes local exit from unconfirmed remote revocation. Required regression: fail remote global revocation, verify no prior account history/drafts remain visible or accessible and no local token reopens the account, then confirm that the UI does not claim all other sessions were revoked. **Still open:** native SecureStore-removal failure needs a separate failed-local-removal/locked outcome; it must not disappear behind a stale-generation catch or be described as successful local sign-out. The master explicitly acknowledged this case as pending.

### P2: A late rejected context refresh can clear a newer valid session

Observed source: `Application.tsx:105`, the queued `refresh().catch(...)` in the auth listener. Successful refreshes checked `generation.current`, but this rejection handler unconditionally cleared state and navigated to sign-in. If an earlier request fails after another account/session's context has already loaded, its catch can erase the newer UI state. This is an availability/flow defect rather than an authorization grant.

Observed source fix: `refresh` now catches its RPC failure and returns without throwing if its generation is stale or the component unmounted. Only a current failure reaches the outer clearing handler. Required regression: delay account A's refresh, complete account B's refresh, then reject A; B must remain current. Also repeat with sign-out and component unmount before the rejection.

### P2: Recovery and child-setup password fields share a secret buffer

Observed source: `Application.tsx:44` (`password`), line 67 (`go`) and line 149 (`secret`). The same password state feeds sign-in, registration, recovery and joint child setup. Navigation originally changed the screen without clearing that state. A signed-in guardian could type a proposed recovery password, cancel that flow, then reach child setup with the masked old password still present. Submitting it creates an independent Auth identity with an unintentionally reused credential.

Observed source fix: the common `go` navigation function now clears `password`. Required regression: enter a sentinel recovery password, leave without submitting, and open child setup/sign-in; the password field must be blank. Confirm that submitted child credentials are deliberately entered for that child rather than inherited from another form.

### P2: Joint enrollment instructions discard their only invitation handoff

Observed source: `Application.tsx:186` writes the child identifier and acceptance token into `email`/`code`, then directs the guardian to sign out so the child can sign in. `clear()` at line 68 removes both values on sign-out. The token was shown in an ordinary nonselectable `Body`, with no explicit safe transfer step. The backend correctly requires that same recipient-bound token after the child signs in, so following the visible flow can strand acceptance unless the family manually recorded it first.

Observed source fix: a selectable native `Text` now displays both identifier and token, and the notice explicitly requires copying them before sign-out and states the 30-minute expiry. No unrelated guardian session secrets are retained and the child's acceptance remains mandatory. Required regression: complete fictional guardian setup, explicitly transfer the identifier/invitation, sign out, authenticate the separate child and accept; the guardian account must still be denied if it tries to use the child's token.

## High-priority issues addressed in source during this review

These are source-level observations. Full rendered UI regression remains required; source inspection alone does not establish every race or interaction outcome.

| Original finding | Observed change | Remaining check |
| --- | --- | --- |
| P1: Old review retained Alice's conversation ID after opening Bob; `setReviewed(previous => previous ?? newSnapshot)` could send to Alice while Bob was current. Review omitted recipient/response. | `openConversation` clears review; snapshots are reused only when conversation/body/response still match; final Send checks conversation ID. Review now displays recipient and response. | Review A, open B, edit/back/review/retry. Verify exact recipient/body/response and stable retry identity. Recipient must be recognizable to the author, not merely an unexplained UUID. |
| P1: One `words` state mixed confidential report descriptions and message drafts, and carried unsent text between recipients. | Separate `reportWords` and conversation-indexed `messageDrafts` now exist. | Enter distinct report/A/B sentinels; navigate all three flows and verify isolation, including back/navigation, send failures and sign-out. |
| P1: `SIGNED_IN`/recovery account replacement refreshed context without clearing old drafts/history. | Non-refresh authenticated events now invalidate/clear before refreshing context. | Replace A with B without a preceding `SIGNED_OUT`; no A content may flash or remain behind B's routes. Retest background/foreground with a pending old request. |
| P1: Account epoch was checked only after network results; waiting for the managed session could dispatch A's staged payload with B's newly loaded token. The SDK RPC fetch also selected its token asynchronously. | `withSessionBoundary` checks epoch after reading credentials and after completion; RPC now uses the captured explicit Bearer token instead of relying on a later SDK token lookup. | Three focused portable tests pass. Add real delayed-auth/network coverage in integration; server authorization must remain authoritative. |
| P2: Custom HTTP API returned 401 without CORS headers for browser preflight, blocking cross-origin browser enrollment/finance calls. | API wrapper now permits OPTIONS for an explicit configured/dev allowlist and denies other origins. | In-process recheck returned 204 + exact allowed-origin header for `http://localhost:8081`, and 403 with no allowed-origin header for an unapproved origin. Rendered browser requests remain to be checked. |

## Boundaries that remained intact in the reviewed source

- `app/index.tsx:358` permits the role-switching demo only with `__DEV__` and explicit demo mode; the ordinary entry redirects to `/accounts`. `accounts.tsx` loads the production application.
- Browser managed tokens use an in-memory map. Native managed tokens use SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; no browser persistence/plaintext token fallback was introduced. This does not prove native reinstall, backup or biometric behavior.
- The reviewed account HTTP API has no journal endpoint, journal table write, journal-key handling or cloud inference call. Journal text is not sent as part of context/session verification.
- Child enrollment first invokes `begin_child_enrollment` under the authenticated user. The inspected identity function requires a current guardian and independently verified, unwithdrawn consent, with no age bypass. Account creation is subsequently checked by the binding trigger, and child acceptance is bound to the independent child identity/token. No new consent/authentication bypass was found in this bounded HTTP/caller review. The master's actual Auth integration test results are separate evidence.
- UI text distinguishes server storage from actual device receipt and does not claim end-to-end encryption. Report/privacy requests are labeled as requests/staging rather than completed exports, deletion or staffed emergency handling.

## Known integration and release gates

The master already identified missing global iOS app-switcher protection, global online revocation polling/refresh and unwired journal-to-messaging handoff before this audit. They remain required integration work; this review does not count them as newly discovered defects. The journal's own key-bound unlock and background lifetime checks do not replace root session/privacy barriers.

The master also identified ambiguous pending-message retry behavior as ongoing work. Retrying an unconfirmed send must reuse the same immutable message/operation identity; changing recipients or text cannot silently turn uncertainty into a new send. This needs rendered failure/retry coverage. A new public Help modal was observed in source; it preserves the Journal/Finance component while showing safety information, so help does not depend on completing or discarding those private workflows. Its modal/back/accessibility behavior is not yet interaction-verified here.

The opaque root cover also needs physical VoiceOver/TalkBack checks: ensure covered content is removed from assistive-technology traversal and keyboard interaction as well as visually hidden. `accessibilityViewIsModal` alone does not establish Android descendant hiding. No screen-reader leak was reproduced here; this is a required validation case, not a claimed hardware finding.

Native SQLCipher/key behavior, local module compilation/autolinking, backup exclusions, actual biometric interruption/resume, screenshots/recording/Recents, memory cleanup, Android keyboard layout and iOS accessibility were not exercised in this audit. Real child data, production enrollment and safety-operations claims remain blocked by their existing qualified reviews and owner release gates.

## Checks actually performed

- Read-only source/caller/installed-SDK inspection; no root-owned source edits.
- `node --import tsx --test tests/production-session.test.ts` from `apps/mobile`: 3 passed.
- Two in-process API preflight requests using fictional configuration only, without opening a listener or making network calls: approved dev origin 204 with exact origin header; unapproved origin 403 without an allow-origin header. The initial pre-fix probe returned 401 without CORS headers.
- No browser interaction, native/emulator/ADB/build operation, Git operation, package installation, service start, deployment, credential creation or real-data collection was performed. The only artifact written for this review is this document.
