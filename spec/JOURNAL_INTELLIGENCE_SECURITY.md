# Journal intelligence security boundary

Status: fictional, memory-only prototype. This extends the owner-approved mission; it does not authorize cloud AI, content persistence, telemetry, real children's information or financial decisions based on writing.

## Information flow

```text
author's in-memory editor
  -> explicit action or per-role opt-in
  -> local template OR reviewed on-device adapter
  -> strict output validator
  -> private suggestion display
  -> explicit recipient choice -> separate editable draft -> Review
  -> permission check -> simulated message OR in-person practice
```

The domain imports only contact permission types/rules. It has no network, disk, analytics, finance or notification API. `buildLocalPrompt` constructs an in-memory prompt with bounded writing and a safe example; it does not include the full address book. An adapter must not send prompts, model output, KV caches or errors to an external service. Downloading a public model file is separate from inference and must never attach journal text.

## Controls and residual risks

| Threat | Implemented domain control | Remaining release work |
| --- | --- | --- |
| Journal prompt injection | Treat text as data; instruction-like input uses a generic fallback; validate output independently | Multilingual/adversarial corpus and independently reviewed model prompts |
| Invented events or motives | Bounded conversation frames; exact short grounding or approved topic phrase; app-authored titles/reasons | Heuristics cannot establish truth or understand all grammar; never claim otherwise |
| Diagnosis, treatment, problem-solving advice | Deterministic conversation-only templates, forbidden-output screening and fallback | Qualified child-safety review and broader semantic evaluation |
| Unsafe parent/teacher/contact | Explicit unsafe IDs, blocked/removed denial, conservative local name/category screening | This English matcher can miss euphemisms/negations or overexclude; author choice and another-safe-adult route are essential |
| Contact approval confused with verification | Any model-specified in-app contact must satisfy existing accepted + verified permission rule | Server-side identity/consent/revocation before real delivery |
| Stale writing or role disclosure | Abort signal plus generation version token; consumers cancel on every lifecycle boundary | Native adapter must interrupt/release generation and clear sessions; integration tests must verify role switching |
| Model output leaks private paragraphs | Reject whole-entry echo and restrict exact contextual span to 100 characters and at most 60% of entry | Author reviews any short contextual disclosure; no guarantee against device debugging/screenshots |
| Hidden data in metadata/errors | Reject unknown JSON fields and non-app-authored title/reason; generic error text only | Audit native logs, crash handlers, model cache/recovery and app-switcher snapshots |
| Model supply-chain compromise | No model/runtime installed by domain; evaluation records source/license/hash candidate | Verify pinned artifact hash, runtime install scripts, native binary provenance and license notices before integration |
| Journal affects money | No finance import/API or shared model prompt | Maintain separation in future backend and authorization tests |

Never notify a parent automatically about an unsafe-person hint. Safety information and choosing another safe adult require no parental approval. The role selector is a demo inspector, not secure authentication. Process memory, OS keyboards, screen captures and development tools are outside the prototype's confidentiality guarantee. No encryption claim is made.

## Checks performed

Eight focused domain tests cover fictional topics, blocked/unsafe/unverified recipients, instruction-like input, malformed JSON, invented words/relationships, diagnosis/advice, control characters, unknown fields, whole-entry echo, native adapter errors and cancelled/stale asynchronous results. These tests are not a model benchmark or a full penetration/accessibility audit. The master report records integration checks actually run.

Before real data: independently review identity, age/consent, shared-device switching, safe help routes, abuse handling, model licenses, background behavior, key custody/storage, deletion/export, crash reporting and operational response. Real model generation remains gated by supported native-device testing.
