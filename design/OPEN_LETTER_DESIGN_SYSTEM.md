# The Open Letter design system

Approved direction for Between Us. Build family: `1114-OpenLetterRedesign`. Product name, approved logo and official tagline remain locked: **when it's hard to find the words, start here**.

## Intent and hierarchy

Between Us is a personal place to write and begin a conversation. An editorial heading, open background and one clear next action establish hierarchy. Use correspondence as a composition reference: a greeting, a short thought, a person to address. Paper surfaces belong selectively in writing and occasional invitations. Chats retain familiar message bubbles and contact rows.

Home asks what the person would like to do. Its main phrase is “Some things are easier to write.” Its primary action is “Talk to someone.” Private writing, the circle and one relevant check-in are quieter choices. Parent tools appear through context and account role. Avoid feature-card grids, pills around every control, decorative gradients, emotional scores, giant icons and ornamental animation.

## Skill and source audit

UI/UX Pro Max's actual `SKILL.md` was not found in the repository, `D:\gamedev\Codex\State\skills`, available plugin cache or the user's `.codex`, `.agents` and `.claude` skill locations. Prompt Sensei and `UI-App-Design-Agent-Guide.md` were also unavailable. No plugin, hook or global configuration was installed. The owner's approved specification is the authority for this phase.

Available Ponytail and design-principles guidance inform bounded changes, preserved behavior, hierarchy and verification against the built result. The local `design` catalog was inspected. Taste-skill is primarily a website workflow: its HTML, hero animation, photo, shader and deployment rules do not apply to this native app. Its emphasis on coherent composition is relevant. Humanizer guidance informs short, direct interface copy. No separate kickoff brand package was supplied.

Technical references checked: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), [SVG support](https://docs.expo.dev/versions/v58.0.0/sdk/svg/), [React Native text](https://reactnative.dev/docs/text) and [React Native accessibility](https://reactnative.dev/docs/accessibility). Platform implementation follows these sources; the approved identity overrides generic aesthetic suggestions.

## Approved assets

`docs/assets/symbol.png` was visually inspected: two people, speech bubbles, a heart, a protective curve and distinctive dark outlines. The mobile copy at `apps/mobile/assets/brand/symbol.png` preserves that image. Original `docs/assets/app-icon.svg` and `design/branding/app-icon.svg` remain unchanged. Do not generate an approximation or replace the wordmark lettering. Use compact branding near account access, and reserve the full tagline for onboarding/about.

The square mobile icon export meets Expo's image schema. Expo Go screenshots cannot prove standalone launcher cropping. Review generated masks and 32/48/64 px recognition before release.

## Semantic colors

Colors live in `apps/mobile/src/theme.ts`. Pale accents are fills or details, never pale text on a pale surface.

| Token | Safe Harbor | Night Harbor | Use |
| --- | --- | --- | --- |
| background | `#F7FAFC` | `#172730` | Main canvas |
| surface / paper | `#FFFFFF` | `#253943` | Inputs, dialogs, selective writing surface |
| text | `#253746` | `#F1F5F4` | Headings and content |
| muted | `#536976` | `#BECED0` | Secondary copy |
| primary | `#2F6077` | `#A9D6DD` | Main action and focus |
| onPrimary | `#FFFFFF` | `#172730` | Action label |
| accent | `#A9D6DD` | `#A9D6DD` | Restrained detail |
| peach | `#F0B8A4` | `#F0B8A4` | Occasional warm detail |
| border | `#CBD8DF` | `#455962` | Quiet separator |
| soft | `#EDF4F5` | `#20343E` | Low-emphasis region |
| incoming | `#EAF0F3` | `#253943` | Incoming bubble |
| outgoing | `#2F6077` | `#A9D6DD` | Outgoing bubble |
| onOutgoing | `#FFFFFF` | `#172730` | Outgoing label |
| danger | `#9A3838` | `#F0B8A4` | Destructive wording |

Calculated sRGB contrast, before opacity or overlays:

| Pair | Safe Harbor | Night Harbor |
| --- | --- | --- |
| Body / background | 11.69:1 | 13.95:1 |
| Secondary / background | 5.49:1 | 9.44:1 |
| Primary action label | 6.86:1 | 9.75:1 |
| Incoming bubble label | 10.65:1 | 10.95:1 |

Night Harbor secondary text on elevated surfaces is 7.41:1. Quiet borders are supplementary; labels, selected indicators and focus treatments carry state. Token calculations do not certify the whole rendered app.

## Typography

Editorial display headings use Georgia on iOS/web and native `serif` on Android. These are interface headings, not replacement logo typography. Body text uses native sans-serif. System faces require no bundled font file or remote font request; verify actual platform metrics in captures.

| Role | Size / line height | Treatment |
| --- | --- | --- |
| Main display | 36 / 43 | Regular serif, short text |
| Screen heading | 28 / 35 | Regular serif |
| Body | 17 / 26 | Native sans-serif |
| Form label / metadata | 14 / 21 | Native sans-serif |
| Writing | 18 / 30 | Comfortable multiline sans-serif |
| Button | 16 / 23 | Semibold |

Keep text scaling enabled. Avoid fixed-height text containers and truncated meaningful labels. Let headings wrap and action groups stack at large accessibility sizes.

## Components and layout

Use an 8 / 16 / 24 / 32 spacing scale, normally 24 dp phone content edges. Inputs have 10 dp radii; actions and selective paper surfaces have 12 dp. Use tonal differences and borders rather than floating shadows.

Shared components: `Heading`, `Body`, `Eyebrow`, `Button`, `Field`, `Paper`, `Divider`, `Icon`. Buttons have a minimum 48 dp target, explicit state and a focus border. Quiet actions keep an open background. Destructive relationship changes and deletion require clear confirmation. Inputs have visible labels and focus treatment. Simple 24-unit line icons supplement labels; decorative SVGs stay outside the accessibility tree. Strong illustration outlines do not spread across the interface.

## Navigation and adaptation

Phones use four persistent bottom destinations: Home, Journal, Chats, Circle. Each has an icon, visible label, selected state, accessible name and at least a 48 dp target. Save and Send remain contextual actions. Respect bottom safe areas and the software keyboard. Nested screens have top-left Back; account/settings lives in the header.

Appearance offers Follow device, Safe Harbor light and Night Harbor dark; Follow device is default. Only this non-sensitive preference may persist in this phase. Journals, drafts, contacts and messages remain memory-only. A save failure requires an honest retry path.

Tablet layouts may replace the bottom row with a navigation rail and should retain a comfortable reading measure. Verify phone, landscape and tablet sizes serially before claiming adaptation complete.

## Interaction, accessibility and privacy

Shared components use immediate press feedback with no decorative timed transitions. Future motion must honor reduced-motion preference. Never delay Save, review, block or safety access. Headings expose header semantics; fields and actions have names and state. Verify focus order, TalkBack, keyboard visibility, large text and dialog actions natively. Web scans provide supporting evidence only.

Private writing never transfers into a chat automatically. Reflections are optional fixed local conversation prompts. Contact approval does not imply acceptance or verification. Skipping check-ins creates no nagging or penalty. Children can reach safety information and prepare words for another adult without guardian approval. Delivery, verification, scheduling and reporting claims must remain explicitly simulated.

The master reviews the 24 native theme captures and comparisons in `spec/qa/open-letter/VISUAL_QA_REPORT.md`. Record missing captures, defects and unperformed tests. Saving images alone does not complete visual QA.
