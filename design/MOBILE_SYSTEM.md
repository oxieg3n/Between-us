# Between Us mobile visual system

The mobile foundation applies the approved Safe Harbor identity. The source of truth remains `docs/assets/symbol.png`, `docs/assets/app-icon.svg`, `design/branding/app-icon.svg`, `docs/styles.css`, and the product specifications. The existing Pages demo stays intact.

Name: **Between Us**. Tagline: **when it's hard to find the words, start here**.

## Assets and typography

Use the existing symbol, keeping its proportions and full harbor curve. Keep its ivory backing visible on dark surfaces; do not invert or recolor the illustration. Use the existing simplified app-icon SVG as the source for launcher raster assets. Do not draw a substitute mark. A full approved logo-with-tagline file and a kickoff `brand/` folder were not present at audit time.

Use the native system font for readable body copy, with a rounded native heading face where supported. No font service requests or new font dependency is required. Comfortaa remains the preferred future wordmark direction; this milestone does not redraw the wordmark or claim that a bundled Comfortaa font exists.

## Theme tokens

`apps/mobile/src/theme.ts` exports `Theme`, `light`, `dark`, and `themes`. Dark colors are quiet slate surfaces derived from Safe Harbor. They are independent of the Powered By Oxieg3n corporate theme.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| background | `#F7FAFC` | `#142630` | Screen canvas |
| surface | `#FFFFFF` | `#203844` | Cards and inputs |
| text | `#253746` | `#F7FAFC` | Body and headings |
| muted | `#536976` | `#B8CDD5` | Secondary copy |
| primary | `#2F6077` | `#A9D6DD` | Main action |
| onPrimary | `#FFFFFF` | `#142630` | Main action label |
| accent | `#A9D6DD` | `#2F6077` | Supporting surfaces |
| border | `#CBDCE3` | `#59727E` | Subtle separators |
| peach | `#F0B8A4` | `#F0B8A4` | Warm supporting accent |

Use dark text on mist and peach. Avoid white text on these light accents. Borders support grouping and must not be the only way to identify an input or selected state. Give selected controls a text label and accessibility state.

Calculated WCAG contrast for the defined pairings: light text/background 11.69:1, light muted/background 5.49:1, light button label 6.86:1; dark text/background 14.84:1, dark muted/background 9.43:1, dark button label 9.89:1. Secondary text on surfaces is 5.75:1 in light mode and 7.44:1 in dark mode. These token calculations do not replace checking the rendered interface.

## Layout and components

Use a 24 dp screen inset, 16 dp between related controls, and 32 dp between sections. Cards use a 24 dp radius, actions 16 dp, and inputs 12 dp. Keep main controls at least 48 dp tall, including secondary actions and navigation. Let labels wrap and containers grow.

Use one large screen heading around 28–32 sp, section titles around 20–22 sp, and body and action copy at least 16 sp. Reserve bold weight for headings, selected states, and the main action. Use short readable paragraphs rather than dense instruction panels.

Each screen has one emphasized next step: write an entry, review a message, add/request a contact, or respond to a check-in. Place edit, delete, safety, and optional guidance nearby as quieter actions. Safety remains easy to find from every role.

Parents and children share the same type and color system. Parent home gives family administration and check-ins their own entry points; child home emphasizes writing and starting a conversation. Avoid childish decoration and clinical language. Explicitly label fictional contacts and simulated delivery.

## Accessibility and motion

Honor the system color scheme. Leave React Native text scaling enabled and avoid fixed heights around text. Verify 200% text size, landscape, and a narrow handset. Give inputs visible labels, buttons meaningful accessible names, and selection state announcements. Use a visible focus ring for keyboard focus on web and a sufficiently contrasting focus treatment on native.

No decorative animation is needed in the foundation, so reduced-motion users receive the same stable interface. Any later animation must honor the platform reduced-motion preference. Do not communicate contact state, errors, or privacy boundaries through color alone.

## Visual verification still required

The source symbol was visually inspected. Launcher recognition at 32, 48, and 64 px must be checked against actual generated launcher assets and Android masking. Do not claim small-icon QA based only on reading the SVG. Native TalkBack, text scaling, focus, dark mode, keyboard avoidance, and launcher checks require a device or emulator; the audit did not find Java, ADB, or an emulator on PATH.

Implementation note: the non-square approved symbol is reused unchanged on screen. A square raster export is used for Expo icon schema compatibility; original assets remain intact. Expo Doctor passes after this adjustment. Android launcher masking/small-size checks still require a standalone app build. The first native launch now passes; see `spec/qa/` for actual captures.
