# Mobile foundation QA

Use fictional people and text only. A checked item requires an observed result, a test record, or a captured screenshot. This file defines checks; it does not claim they have passed.

## Interaction checks

| Area | Action | Expected result |
| --- | --- | --- |
| Navigation | Visit every main destination as child and parent | Working destinations, appropriate role tools, visible return path |
| Journal ownership | Write a distinct entry and unsent draft in each role; switch roles repeatedly | Each role sees its own entries and draft only; no parent access to child writing |
| Journal editing | Create, revisit, edit, and delete an entry | Updated text appears; deleted entry disappears; no network or persistent storage |
| Optional reflection | Request help for fictional school writing, then dismiss it | Communication-only suggestion; no diagnosis, emotional interpretation, treatment, or automatic outreach |
| Unsafe parent | Request reflection on fictional writing involving an unsafe parent; open safety information | No named unsafe parent recommendation; another trusted adult/help path needs no parental approval |
| Draft privacy | Open composer from a journal reflection | Original journal text is absent from composer, review, thread, and notification text |
| Parent contacts | Add and remove a fictional trusted person | Changes apply without approval from another administrator; addition does not unlock messaging |
| Child contacts | Request a fictional contact | Request is pending; child cannot approve or verify it |
| Connection gate | Try requested, approved, invited, unaccepted, unverified, blocked, and removed contacts | No in-app send; only a fully eligible fictional connection can simulate a send |
| Review | Draft a message, choose each response type, review, return to edit, and review again | Exact recipient, edited text, and response request are shown before simulation |
| Minimal request | Compose “Can we talk?” without a detailed explanation | Review and simulation work without requiring disclosure |
| In-person preparation | Prepare words for someone without the app | Words can be reviewed without claiming a message was delivered |
| Replies | Choose a reply starter and conversation do-over | Editable communication examples; no claim about the sender's hidden feelings; review before sharing |
| Parent check-ins | Create an example recurring prompt | Preview shows question and recurrence; scheduling/notification delivery explicitly simulated |
| Child check-ins | Quick reply, longer reply, request conversation, later, and skip | Every offered control works; skip creates no score, streak loss, nag, or punishment |
| Little Conversations | Select an everyday prompt as either role | Friendly editable invitation, with parents able to answer too |
| Block/report | Block a fictional connection, attempt send, then report | Block prevents simulation; report is clearly local/simulated and does not claim staff received it |
| Reset | Reload or restart the prototype | In-memory edits disappear; no claim of durable or encrypted storage |

## Accessibility and visual checks

- Test both themes and 200% text scaling at narrow phone width. Labels and actions must remain readable, scrollable, and reachable.
- Test screen reader focus order, accessible control names, selection states, errors, and success notices. Test keyboard focus on web; do not infer native TalkBack results from web.
- Test the software keyboard on all forms, Android hardware back behavior, safe areas, landscape, and keyboard dismissal.
- Verify at least 48 dp touch targets and readable foreground/background combinations. Token contrast calculations are in `design/MOBILE_SYSTEM.md`.
- Enable reduced motion. The foundation should remain stable with no required animation.
- Inspect approved logo proportions and actual launcher icon crops at 32, 48, and 64 px. Record screenshots from rendered screens rather than source-only mockups.

## Native test environment

At the initial Windows audit, Node, npm, and Git were available. Java, `adb`, and `emulator` were not on PATH. This prevents claiming a local Android build or emulator run from that audit. Check whether Android Studio provides an SDK outside PATH before treating it as absent.

For an emulator run, install/configure a supported Android Studio SDK, Java, and an Android virtual device using current Expo and Android documentation; then start that device and run `npx expo start --android` from `apps/mobile`. For a physical phone, use the Expo Go version compatible with the installed Expo SDK or an explicitly built development client. The app and phone must be able to reach the Metro server. Do not connect paid build services or upload credentials without owner approval.

Record the installed Expo SDK, Android version, device/emulator, commands, observed results, and screenshot locations in the session report. A web export demonstrates bundling and is not an Android runtime test.

## Session execution, 2026-11-14

The implementation was launched on Pixel_10 (Android 17) through the SDK-compatible Expo Go client. `scripts/android-smoke.ps1` passed role navigation, child/parent journal screen checks, child-entry exclusion in the parent view, and the check-in destination. Screenshots are in `spec/qa/`. This is an Expo Go runtime smoke test, not a standalone APK/Gradle build, TalkBack audit or full native regression suite.

The Chrome workflow passed create/edit/delete journals, role isolation, no-copy reflection, explicit review/edit/send, reply starter, parent direct management, child request/parent approval, check-in skip, and in-person safety preparation. An axe scan of the dark safety screen passed WCAG 2 A/AA rules. Whole-app screen reader behavior, 200% system text scaling, launcher masking and 32/48/64 recognition remain unverified. See `spec/BUILD_REPORT.md` for exact checks and limitations.
