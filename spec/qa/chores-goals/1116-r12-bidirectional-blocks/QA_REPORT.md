# R12 bidirectional blocking: native pass

This focused native run completed successfully: four blocking cases passed across Safe Harbor and Night Harbor, appearance persistence passed, and original device settings were restored without errors. The final manifest is `completed: true`, `error: null`. All 14 original Android PNGs were individually inspected and independently hash/dimension verified. This result covers the workflows below, not the complete production or application regression matrix.

## Provenance

- Build `1115-FamilyEnvelopes-Journal-r12`; app/driver source `8607573e37dadd66ede3bb368389e0a2531ef6d8`, branch `feature/mobile-foundation`.
- Master-recorded installed APK SHA-256: `34716578ABD1C9DCB9C255C9993E66F3B00BB532B29AC7DE953095302C8FB6E9`. This reviewer independently verifies PNGs; APK build/installation/hash are reported from the master's record.
- Pixel_10 AVD, Android 17 x86_64, serial emulator-5554, package `com.oxieg3n.betweenus`, Metro 8082. Original size 1080 x 2424, density 420, font scale 1.0. The master recorded guest Google SwiftShader for this session. This does not certify separate physical hardware or establish the cause of earlier graphics failures.
- [Final capture manifest](capture-manifest.json), [actual actions](capture-actions.json), [native assertions](native-check-results.json). Originals came from actual ADB screencap and pull and remain unaltered. Earlier failed runs remain separate evidence.

## Actual interaction results

| Case | Real interaction/assertion | Result |
|---|---|---|
| LIGHT child-owned block | Child blocked Alex through Circle/confirmation; parent opened Sam; native input/Review and new parent check-in Save disabled; child completed safe-adult practice | Passed |
| LIGHT parent-owned block | Parent blocked Sam; child opened Alex; input/Review and new parent check-in Save disabled; child completed safe-adult practice | Passed |
| DARK child-owned block | Same child-block/peer-role/new-check-in/safe-practice workflow in Night Harbor | Passed |
| DARK parent-owned block | Same parent-block/peer-role/new-check-in/safe-practice workflow in Night Harbor | Passed |
| Native appearance persistence | Night Harbor remained selected after force-stop/relaunch without selecting it again; then Follow device appearance selected through Settings | Passed |
| Device restoration | Original size/density/font verified restored, no errors | Verified restored |

This is five functional passes plus one restoration result, not six functional cases. Native enabled-state assertions checked both Message draft and Review as `enabled=false`; Save example schedule was also `enabled=false`. After each block, the child navigated from Circle to Privacy & safety, prepared words for another trusted adult, explicitly reviewed them and activated Keep words for practice. All four practice originals show the actual confirmation "Your words are ready to practice. Nothing was sent." This path needed no parent approval.

The run verifies new-message/new-schedule denials while retaining prior fictional thread history. It does not force an internal send after blocking or reproduce a block arriving between Review and Send. Final in-memory permission gates were separately source-reviewed and have domain regression coverage; this report records the actual UI assertions above only. The demo role selector is an inspection tool, not authentication.

## Visual and privacy findings

All 14 originals show coherent full-width rendering with the four phone navigation destinations present. No tiled corruption, overlapping controls or forgotten light-only surface in Night Harbor was found. The unavailable-connection copy is generic: the peer is not told a private block owner's identity or reason. Visible thread text is the fictional cooking/pizza fixture; schedule text is a fictional prompt marked simulated. No personal information, credentials, real payment details or private journal text appears in these originals.

The disabled composer/Review and Save fit within the viewport. Muted styling reflects disabled controls; no numerical contrast certification is inferred from screenshots. Practice uses a separate neutral sentence and says that no journal or other drafts are attached. Its repeated Keep words button extends partly below the scroll viewport in the final screenshot, while the visible success notice proves the action was activated. Some thread identity content is above the scrolled viewport, deliberately framing the denied composer. These are framing limits, not evidence of clipped native root geometry.

The appearance original clearly shows Night Harbor selected after process restart. The final system-preference original shows Follow device selected, immediately rendering the device's light appearance. Neither image has clipped theme labels or missing navigation. No urgent visual defect was found in these captured states.

## Scope and remaining gates

This focused run does not rerun tablet/density, 200% font, keyboard, spoken TalkBack, iOS, physical-device or full financial/model flows. Those require their own results and provenance. Production identity, consent, server authorization, queued delivery revocation and operational reporting remain release gates. Journals, messages, check-ins and finance remain fictional memory-only simulations; no real message, notification or money was delivered. Appearance and explicitly downloaded model assets are the approved persistence exceptions.

This reviewer performed read-only evidence inspection and wrote this report only; no ADB, app source, package, capture or Git changes were made.

## Independent original verification

All 14 PNG SHA-256 values and IHDR dimensions were independently recomputed and match the final manifest. Every image is 1080 x 2424: six LIGHT blocking originals, seven DARK originals including appearance persistence, and one Follow device original. All original bytes remain unchanged.

| Original | Dimensions | SHA-256 |
|---|---|---|
| [light/child-block-incoming-denied.png](light/child-block-incoming-denied.png) | 1080 x 2424 | `cb65d2d6e30061cd6307d9ff9da0c89fa626e0c27de2398ce12032912c38543a` |
| [light/child-block-checkin-denied.png](light/child-block-checkin-denied.png) | 1080 x 2424 | `7b9a980ef2fe2a06b601e115983380849a53bb84088752c9f4224a7785d88790` |
| [light/child-block-safety-practice.png](light/child-block-safety-practice.png) | 1080 x 2424 | `6d606554ab37482132c9a51a35b3c07857a2f8224d395fae0f8f25c476d1b769` |
| [light/parent-block-incoming-denied.png](light/parent-block-incoming-denied.png) | 1080 x 2424 | `4bf0d30e77dd61d0d757c69f1f56e986695925b4298060bfbe7d4412bac9623f` |
| [light/parent-block-checkin-denied.png](light/parent-block-checkin-denied.png) | 1080 x 2424 | `487d93a0916a0d6892c127c846e303b6ec880f46caab4aa4b0938cca2d94f1c1` |
| [light/parent-block-safety-practice.png](light/parent-block-safety-practice.png) | 1080 x 2424 | `a09a986289faddf0380bff22820d6ca320f2755e8f498b95c6da08f5301cae9f` |
| [dark/child-block-incoming-denied.png](dark/child-block-incoming-denied.png) | 1080 x 2424 | `1f370cd6a750d3efb2fc5977ca3f473b2a41c56e396d6716c9984acee0c52b70` |
| [dark/child-block-checkin-denied.png](dark/child-block-checkin-denied.png) | 1080 x 2424 | `72d3a7267a63bb26532aa696412bd0e4846abd3e772ea4c4edc7540472a2e409` |
| [dark/child-block-safety-practice.png](dark/child-block-safety-practice.png) | 1080 x 2424 | `35c12d97a1ac5781d2ab9c696234ed0c8a0d85b82fb79ed069ed925baed73c36` |
| [dark/parent-block-incoming-denied.png](dark/parent-block-incoming-denied.png) | 1080 x 2424 | `d8be532a0ec30145da3240112ae4c7255eabeaf3a919bbb60da08850d026fa85` |
| [dark/parent-block-checkin-denied.png](dark/parent-block-checkin-denied.png) | 1080 x 2424 | `460f119027fc15559ae8478afe480cb91938a1aa3e3933756bff6d5357ab059f` |
| [dark/parent-block-safety-practice.png](dark/parent-block-safety-practice.png) | 1080 x 2424 | `356a55ec5d1fbd56dd599577a1392a33077c90d07012b9e1ed8ad970fe8478f9` |
| [dark/appearance-after-restart.png](dark/appearance-after-restart.png) | 1080 x 2424 | `e15c5c67ddcf4dc15daae9584a75f0f4cad0a9d8a7e785cd1fb66fc6ec0281c4` |
| [system/appearance-follow-device.png](system/appearance-follow-device.png) | 1080 x 2424 | `b237d23f360b8aa59fc89f3eaeef43ea4fd73746dd8fc035ddc1efcd00c487f8` |
