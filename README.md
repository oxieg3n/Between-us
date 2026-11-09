# Between Us

**when it's hard to find the words, start here**

A welcoming product concept that helps kids and parents find their words and build confidence talking to people they trust.

## [Open the interactive demo](https://oxieg3n.github.io/Between-us/)

The current **v2.0 design prototype** was redesigned from the ground up around three connected tools:

- **My Journal:** Private, role-specific entries, held only in this browser tab's memory during the demo. A small rule-based on-device matcher can *optionally* suggest talking with someone. It offers **no psychological advice, diagnosis, or treatment**.
- **My Circle:** Parents, guardians, siblings, approved friends, teachers, and trusted adults. A demo-only parent approval workflow for additional contacts.
- **Open the Door:** Parent-created gentle check-ins; children can respond, write their own words, or skip without pressure. Parent- and child-initiated conversations include an explicit review step before entering a **simulated** message thread.

The visual direction uses the **Safe Harbor palette** and approved Between Us logo. The demo is responsive across mobile and desktop and requires no build step or services.

### Pages publishing

The site is served by GitHub Pages from `main:/docs`. A root `index.html` redirects to `docs/` when needed.

### Project structure

- `docs/index.html`: web demo entry point
- `docs/styles.css`: design system and responsive styles
- `docs/app.js`: client-only demo navigation and state
- `docs/assets/`: approved logo and small app icon
- `spec/JOURNAL_AND_CIRCLE.md`: product rules, privacy boundaries, and requirements
- `spec/WORKFLOW.md`: earlier v1 design exploration, preserved as history

### Important privacy notice

This is **not** a functioning, secured communication app. There is no real authentication, encryption, persistent journal storage, messaging delivery, notification scheduling, or contact verification. All content is illustrative. Anything you type remains in tab memory and is lost on refresh; **do not enter private or identifying information** in the public demo.

A future production release needs age-appropriate consent, verified contacts, moderation and reporting, abuse prevention, securely stored and access-controlled journal entries, strong encryption, and well-designed paths to seek another trusted adult when a parent is unsafe.

Built with care by [Powered By Oxieg3n](https://poweredby.oxieg3n.com/).
