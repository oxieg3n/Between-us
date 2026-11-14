# The Open Letter screen specifications

Build family: `1114-OpenLetterRedesign`. These requirements apply to the existing Expo application and preserve its memory-only communication boundaries. Actual test outcomes belong in the visual QA report.

## Shared shell and account

Compact approved identity and account access sit in the header. Nested pages show top-left Back and clear page identity. Phones have Home, Journal, Chats, Circle along the bottom, with visible labels, icons and selected states. Check-ins are contextual. Keep actions above safe-area and keyboard insets. Use open rows and dividers rather than repeated panels; restrict paper to meaningful writing surfaces. Tablet content retains a comfortable reading width, with a rail where appropriate.

Onboarding introduces the official tagline, purpose, fictional information, memory-only writing and simulated delivery. Role choice is a demo inspector, not authentication. Settings contains appearance, demo role choice, build identifier and safety/privacy. A role change must not expose the previous author's draft. Guard unsaved content loss. Appearance changes immediately and persists only the selected theme preference; errors have a retry action.

## Child and parent Home

Use a natural greeting, such as “Hi, Sam.” The main editorial phrase is “Some things are easier to write.” Primary action: **Talk to someone**. Secondary access: **Write privately**, **My Circle**. Show at most one relevant check-in and one recent conversation or new-user invitation. Do not invent usage statistics or emotional scores.

Parent Home retains the same visual system and adds quiet scheduling/management access for Open the Door. Administrative tools must not crowd the main conversation action.

## Journal overview

Title: **My Journal**, with private-in-this-demo status and a simple list of recent entries. Primary action: **New entry**. Each entry opens the writing editor and can be edited or deleted with confirmation. Empty state invites writing. Never imply encryption or secure shared-device separation.

## Journal editor and reflection

A quiet paper surface holds title and comfortable multiline writing. Keep writing dominant and **Save entry** visible. Saved/unsaved status reflects actual local state. Retain drafts within the same role/session, and guard navigation that would discard edits. Role changes cannot reveal another author's editor. Verify keyboard reachability.

After saving, optionally offer **Help me find someone to talk to**. Do not run the matcher merely because a person types. Suggestions encourage conversation with a user-chosen safe person or preparation for an in-person talk. They provide no diagnosis, treatment, emotional interpretation, judgment or unsafe-person routing. Original journal text never appears automatically in the composer. A separate starter such as “Can we talk?” requires an intentional action. Include dismiss and safety access.

## Conversations list

Title: **Chats**. Primary action: **New conversation**. Rows show recipient, relationship, recent simulated message preview and sensible session time. Empty state supports a first simple hello. Keep data scoped to fictional participants. Include contextual check-in access where relevant.

## Active conversation

Show recipient identity, Back and appropriate circle/safety access. Incoming and outgoing bubbles differ in alignment and semantic color. Group consecutive messages sensibly; use readable timestamps and explicit simulated status. A multiline composer sits above the keyboard. Review precedes simulated send. New messages scroll into view without hiding the composer. No delivered/read claims exist without backend evidence.

Optional contextual helpers: Can we talk?, Help me find the words, What I need from you, Help me reply, Conversation Do-Over. Keep ordinary short messages easy. Reply examples communicate directly without interpreting hidden emotions.

## Compose and review

Choose a permitted contact or prepare in-person words without requiring an installed app. Optional response preferences: Just listen, Give me ideas, Talk later, Talk in person. Parent starters include an apology and family change. All text is editable.

Review shows exact recipient, separately composed words and preference. Provide **Edit** and explicit **Simulate send**. Recheck eligibility at the final action, including revocation since selection. Requested, approved, invited, unaccepted, unverified, blocked and removed contacts cannot receive in-app messages. Preserve drafts on failure. In-person preparation clearly states that nothing was sent.

## My Circle and parent management

Use a contact list with name, relationship and textual state. Keep requested, approved, invited, accepted, verified, blocked and removed distinct. Seed verification is simulated. Children can request additions, start permitted conversations, block and report. Parents add/remove directly and approve requests without another administrator's permission. Addition or approval never enables messaging by itself.

Add/request forms have visible name and relationship labels. Confirm removal and destructive relationship changes. Blocking immediately disables future sends. Reports say no real submission occurred and offer safety information. Never route confidential concerns automatically to a potentially unsafe guardian.

## Open the Door scheduler

Parent scheduling includes recipient, question, weekdays, time, preview and a clearly simulated save action. Schedules can be edited or removed with confirmation. Validate missing questions and malformed times. Recurrence execution and notification delivery remain simulated. Little Conversations provides everyday questions; parents can answer too.

## Child check-in

Present an invitation with quick response, written response, request conversation, later and skip. Responses pass through review; skipping does not. Skips create no guilt, emotional score, penalty, streak loss or repeated reminder. Later remains intentionally recoverable.

## Privacy, safety and error states

Use short child-readable sections explaining journal/draft ownership, parental contact administration and prototype limits. Safety needs no contact approval. A child worried about a parent can prepare words for another trusted adult and seek appropriate real-world help. Do not imply therapist or emergency dispatch capability.

Appearance loading cannot block safety access. Persistence failures identify that the preference was not saved. Invalid input identifies the field and preserves text. Send failure keeps the draft. Confirmations use the current theme, accessible heading and clear cancel/destructive labels. Success appears only after the actual local action finishes.

## Native capture and review

Capture through actual interactions in the running Android app, in Safe Harbor and Night Harbor: child home, parent home, journal overview, journal editor, journal reflection, conversations, active conversation, My Circle, parent contacts, check-in scheduler, child check-in, appearance settings. Save all 24 original-resolution PNGs in `spec/qa/open-letter/light/` and `dark/`.

Comparisons use actual captures, light left and dark right, with labels and no defect-hiding crop or retouch. Inspect alignment, typography, safe areas, keyboard, selected tabs, readable bubbles, focus/labels, dark layers and approved logo. Inspect small/standard/large phone and tablet dimensions serially where supported. Record incomplete checks and defects in `VISUAL_QA_REPORT.md`; fix and recapture significant defects before requesting owner review.
