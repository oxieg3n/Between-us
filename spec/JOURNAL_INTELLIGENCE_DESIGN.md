# Journal conversation ideas

Implemented domain: `apps/mobile/src/journal-intelligence/index.ts`. Prototype only: fictional writing, memory-only state, no cloud inference, no finance dependency.

The author can request ideas manually. “Conversation Ideas While I Write” must default off, remain separately controlled for each demo role, and be cancellable. A meaningful writing pause starts a 1,200 ms timer; typing, entry/role changes, leaving the editor, disabling the option and unmounting invalidate pending work. `createLatestOnlyRunner` aborts and rejects stale results even when a native runtime ignores cancellation. The editor remains editable throughout.

`suggestConversation(request)` produces at most two local, explicitly labeled conversation templates. Topics cover school, bullying, friendship, moving, apology, achievement, loss, breakup, embarrassment, everyday events and a generic alternative. It uses limited topic phrases rather than reproducing private paragraphs. It does not analyze the author's emotions. “More like me” offers an editable first-person wording variant; this fallback does not learn an author's style.

`generateConversation(request, adapter?, signal?)` returns validated native output when a reviewed local adapter is available; otherwise the same useful fallback with a truthful reason. No native model is silently downloaded or initialized by this module. See [LOCAL_AI_MODEL_EVALUATION.md](LOCAL_AI_MODEL_EVALUATION.md) for the current native support gate.

## Typed boundary

| Record | Fields |
| --- | --- |
| JournalRequest | text, role, contacts, optional variant and unsafeContactIds |
| ConversationSuggestion | id, title, why, editable draft, recipientCategory, optional recipientId, in-app/in-person route, source |
| SuggestionResult | suggestions, source, display label, optional fallback reason, excludedContactIds, excludedCategories, optional safety notice |
| LocalModelAdapter | asynchronous generate(request, AbortSignal), returning unknown JSON for validation |

Variants are `shorter`, `simpler`, `direct`, `like-me`, and `another`. Changing a variant must not overwrite a separately edited message draft.

## Deliberate sharing

1. Display an idea and its local source without saving or sending it.
2. Author explicitly chooses to use those words and selects a recipient. No automatic parent selection.
3. Filter blocked, removed, explicitly unsafe and locally flagged contacts with `isRecipientAllowed`. Preparing words for an external safe adult remains available without a parent approval gate.
4. Let the author edit the separate draft and response preference.
5. Show the exact recipient and text on Review. Recheck recipient safety and messaging acceptance/verification before simulated Send. In-person practice never sends.

The unsafe-contact exclusions are derived privately. They must not appear in a message or notify an alleged unsafe person. Journal text and inferred topics never enter financial state.

## Validation and limits

`validateModelOutput` accepts one or two JSON suggestions, limits output and draft length, rejects unknown fields/control characters/advice/diagnostic language and validates any contact ID. Titles and reasons come from app-authored text. A draft must match a limited conversation frame containing either an approved topic phrase or a brief exact journal span; word rearrangements alone do not prove factual grounding. Invalid, failed or instruction-like output falls back with a truthful label.

These English heuristics are intentionally conservative. They are not a multilingual abuse detector, a semantic proof, a clinical classifier or a production safety guarantee. A qualified review and adversarial evaluation remain release gates. Existing journal privacy, unsaved-writing protection, text scaling and explicit Save behavior remain mandatory.

## Domain checks performed

`npx tsx --test tests/journal-intelligence.test.ts` passes eight focused tests: topic fixtures, exclusions, wording styles, empty/injected input, output schema, grounding/advice rejection, adapter failure/cancellation and stale-result protection. Targeted ESLint passed. Full application typecheck/regression/native UI validation belongs to the master integration run; no physical model benchmark is claimed here.
