# Between Us — UX Workflow Blueprint v1.0

**Brand:** Between Us  
**Tagline:** when it's hard to find the words, start here  
**Purpose:** Give children and parents a gentle way to initiate and continue difficult conversations, especially when text feels easier than talking aloud.

## Design system

- Safe Harbor palette: Ivory `#F7FAFC`, Ocean `#2F6077`, Mist `#A9D6DD`, Peach `#F0B8A4`, Deep Slate `#253746`.
- Friendly rounded typography for names and headings, clear high-legibility body type, 16–20 px card radii, large touch targets.
- Friendly black-outlined two-person/chat-bubble logo for branding. Avoid saturating the actual UI with hard black borders.
- Light and dark mode should support accessible contrast and visible focus states. Mood labels must always include words, not just colors or emoji.
- Parent and child screens should be similarly welcoming, with distinct navigation and tools.

## Screen map

| ID | Screen | Primary user | Purpose | Next step |
|---|---|---|---|---|
| 01 | Welcome | Both | Introduce app and choose role | Child join or parent setup |
| 02 | Parent setup | Parent | Establish family space and issue invitation | Parent home |
| 03 | Child join | Child | Accept invitation and understand what is shared | Child home |
| 04 | Child home | Child | Start a conversation, see a check-in, access private space | Guided composer or check-in |
| 05 | Child composer | Child | Express feelings in their own words; optional writing guidance | Review |
| 06 | Child review | Child | Review exact message and choose kind of response wanted | Conversation |
| 07 | Parent home | Parent | Start hard conversations, manage check-ins, open chats | Parent composer or scheduler |
| 08 | Parent composer | Parent | Draft sensitive news or apologies with optional prompts | Review |
| 09 | Parent review | Parent | Confirm content and avoid pressuring child for immediate response | Conversation |
| 10 | Open Door scheduler | Parent | Choose check-in prompt, time and frequency | Preview as child / save |
| 11 | Child check-in | Child | Answer, write freely, snooze, or skip | Conversation or home |
| 12 | Conversation | Both | Exchange messages and optionally plan a face-to-face talk | Home |
| 13 | Privacy | Both, age-adjusted | Explain drafts, sharing, check-ins and trusted adult paths | Home |

## Core workflows

### A. A child needs help finding the words

1. From **Child Home**, select **Help me say it**.
2. Pick a person, or confirm the currently selected trusted family member.
3. Express a feeling (optional) and write rough thoughts (optional). The child can bypass prompts and send a simple message.
4. Optionally request phrasing help; any suggestion must preserve the child's meaning and require approval.
5. On **Review**, choose what kind of response is helpful: **Just listen**, **Advice**, **A hug**, or **Talk later**.
6. Send the message intentionally. Only this approved message and selected request are shared.
7. The recipient can reply in a private conversation; the child can continue writing or arrange an in-person talk.

### B. A parent has difficult news

1. From **Parent Home**, choose **Help me find the words**.
2. Select the child and a topic, such as **Family changes**, **An apology**, or **Something else**.
3. Write the facts in the parent's own voice. Optional prompts encourage honesty and room for feelings.
4. Review the exact message. The child should not be pressured to answer immediately.
5. Send into the family conversation and respond with listening-first guidance.

**Example:** A parent needs to tell their child the family is moving. The tool can encourage direct language, acknowledge the child's possible loss of friendships, and avoid pretending the news is automatically positive.

### C. Parent-scheduled Open Door check-in

1. On **Parent Home**, open **Open Door check-ins**.
2. Write a check-in question, choose recipients, weekdays, and an approximate delivery time.
3. Preview exactly how the child will see the invitation.
4. Save the recurrence. The child receives a neutral notification that does not expose sensitive text on the lock screen.
5. The child can choose a quick response, write freely, **Not right now**, or **Skip**.
6. Skipping is not framed as failure, does not create a streak penalty, and does not trigger nagging reminders.

### D. Ongoing conversations

- Replies are private between chosen participants.
- The family can continue by text or choose a convenient time to talk in person.
- Parent-facing guidance emphasizes validation, curiosity and calm reactions rather than automatic advice.
- A separate trusted-adult or safety-help path should be provided when a parent is not a safe recipient.

## Navigation

**Child:** Home • Chats • Start • Private  
**Parent:** Home • Chats • Start • Check-ins

## Privacy and child-safety requirements

- No hidden monitoring of drafts, notes, or content the child has not explicitly shared.
- Describe sharing boundaries clearly in onboarding and within message review.
- Both roles must review and approve AI suggestions before sharing; no autonomous messages on a user's behalf.
- Scheduled check-ins are invitations, not obligations. Provide mute, frequency, skip, and snooze controls.
- Give children age-appropriate ways to contact another trusted adult when talking to a parent may be unsafe.
- Include clear guidance toward real-world emergency/support services for serious safety situations; don't position the AI as a therapist or sole crisis responder.
- Before production, design consent, data retention, age assurance, family access, abuse prevention, reporting and moderation in accordance with applicable child privacy/safety requirements.
- No public social feed, performance scoring of emotional disclosure, or engagement-streak incentives.

## MVP recommendation

1. Family invitations and private role-specific navigation.
2. Two-way text conversations with optional guided composition and explicit send review.
3. Parent-initiated difficult conversation flow.
4. Scheduled Open Door check-ins with easy skip and reply controls.
5. Private drafts, understandable privacy settings and trusted-adult/safety pathway.

**Later:** voice notes, fully tested optional AI wording assistant, richer conversation starter library, accessibility options, and on-device reminders. The MVP should work well without AI.

## Prototype status

The HTML is a **click-through visual concept**, not a deployed app. Names, messages and family codes are examples. It sends no messages, creates no accounts and schedules no real notifications. Images in this package are deterministic screenshots of the prototype, not photographs of a functioning product.