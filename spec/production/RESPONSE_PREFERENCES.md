# Message response preferences

Pending migration018 expands the stored response-value set without renaming existing values or changing the message/fetch DTO.

| Author-facing choice | Stored/API value |
| --- | --- |
| Just listen | `listen` |
| Give me ideas | `reply` |
| Talk later | `later` |
| Talk in person | `talk` |

These are explicit communication requests chosen by the author. They do not infer feelings, diagnose, schedule contact, create a reminder, require a response or promise that another person will act. `later` contains no timestamp/timezone and does not modify check-in scheduling or notification policy. Journals and unsent drafts are not copied into a message by this migration.

The migration replaces the named `messages_response_check` with the four-value constraint and replaces `api.send_message(uuid,text,uuid,text)` only to add `later` to its validated preference set. The existing function originally defined in002 uses008's current actor/contact locking and permission helpers; no008 helper is replaced. Sender/session checks, relationship authorization, family/contact locks, command-identity locking, content limits, immutable replay comparison, 30-new-send budget, server timestamps, recipient selection, invalidation and neutral notification enqueue remain byte-for-byte equivalent after normalizing the function declaration and enum-list change. No new grants or raw-table access are introduced: execute remains authenticated-only.

Idempotency includes the response preference. An unchanged UUID/conversation/body/preference retry returns the original saved message; changing only `later` to another preference raises `22023` idempotency conflict. A confirmed rejection permits the UI to compose a new explicit action/UUID. An uncertain network outcome must retain the exact reviewed UUID, recipient, text and preference for retry. A currently blocked/revoked/unverified contact still fails before any replay is returned. `fetch_messages` is unchanged and returns the stored preference string, including `later`, under its existing own-sent/acknowledged/current-contact content boundary.

Root owns mobile composer/type updates and must show all four labels, render historical values without remapping, include the chosen value in explicit Review, and preserve it during uncertain retry. Any shared Checkins response choices/types also need deliberate integration if that flow is expected to offer Talk later; this backend migration does not alter those components. Existing `listen`, `reply` and `talk` rows need no data rewrite.

`supabase/tests/message_response_preferences.test.sql` supplies fictional, rolled-back fixtures covering all four parent values, a child's independent `later` choice, exact fetch preservation, identical and changed-preference/body retries, invalid/null/empty values, body bounds, table constraint enforcement, send-budget/idempotency preservation, cross-family forgery, both-direction blocks, replay reauthorization and queued incoming suppression while authorized history remains available. These tests use real RPC/SQL source, without provider HTTP or live notification delivery.

This helper performed source comparison/structural checks only. Root must review/rename/apply the pending migration and run this test plus the existing communication/external-contact suites serially. No database execution, services, packages, Git, native operations or mobile source changes were performed by this helper. There is no production or compliance certification.
