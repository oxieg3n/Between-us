# Participant conversation previews and paging

Migration: `202611160016_conversation_previews.sql.pending`. The owner must review, rename, apply and run the tests serially. This helper performed source work only; no SQL, services, Git, provider HTTP or native operations were run.

## Contract

`api.list_conversations()` retains its exact zero-argument signature and JSON array shape. It now returns at most the first 50 rows with the fields below. New clients must use `api.list_conversations_page(p_limit int DEFAULT 50, p_before_id uuid DEFAULT NULL)` so older conversations remain reachable. There is no overloaded default-argument variant of the legacy function.

```ts
type ConversationPreview = {
  id: string;
  contactId: string;
  peerId: string;
  canExchange: boolean;
  peerName: string;
  preview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
};
type ConversationPage = {
  conversations: ConversationPreview[];
  hasMore: boolean;
  nextBeforeId: string | null;
};
```

`p_limit` must be 1–50; null/out-of-range raises `22023`. A cursor must identify a conversation where the current managed author is an endpoint with currently usable endpoint access. A guessed sibling, other-family or absent conversation raises the same `42501`; it cannot become a directory/existence probe. There is no user/family argument that could select another author.

Pages sort by immutable `(conversation.created_at DESC, conversation.id DESC)`. Equal timestamps use the UUID tie-breaker. This deliberately trades inbox-style recent-activity ordering for stable, privacy-preserving pagination: unseen incoming messages cannot reorder a blocked conversation, change its paging cursor or reveal their timestamp. Refresh the first page to discover newly created conversations. Messages/permission changes do not shift a conversation between pages. Concurrent inserts newer than the cursor appear on refresh rather than being injected into an older page.

`nextBeforeId` is null on a terminal page. Otherwise pass it unchanged as `p_before_id` to Load more. The cursor reflects the last **scanned** candidate: post-lock permission changes may omit rows after candidate selection, so an empty page can still have `hasMore: true`. Clients must advance by the returned cursor, append/deduplicate by conversation ID, and keep Load more available while `hasMore` is true. A cursor whose own access was later removed fails closed; refresh from the beginning. Do not calculate a cursor from message time or the last displayed row.

## Content delivery boundary

The function obtains its managed UID through `communication_actor`, which checks current Auth session/account/consent state and holds the existing session share lock. It selects at most 50 owned candidate **IDs/creation metadata**, then passes every candidate contact to migration013's `domain_lock_scope`. That helper acquires the complete distinct family union in sorted order before any contact-pair advisory/row lock. The preview function does not incrementally acquire family locks while iterating content.

After acquiring the whole scope, it rechecks the managed actor and current own-endpoint usability. Per contact it re-evaluates `contact_allowed`, covering both acceptances, current verification, guardian approval/independence, both endpoint states, revocation/review and either author's private block. Only then does it read a profile name or message body. `peerName` is the current permitted profile display name only when `canExchange` is true; otherwise it is exactly `Connection unavailable`. A missing/blank permitted name also uses that fixed label. UI must not fall back to an email or UUID label.

The newest eligible message follows the existing `fetch_messages` predicate exactly:

```sql
sender_id = current_author
OR (recipient_id = current_author
    AND (current_contact_permission OR acknowledged_at IS NOT NULL))
```

Thus a denied/blocked/revoked relationship can still show the author's own sent text and incoming history previously acknowledged by that author. An unacknowledged queued incoming message cannot contribute a preview or `lastMessageAt` after permission is removed. Preview text is `left(body,160)`, measured in PostgreSQL characters rather than bytes; its timestamp comes from that same selected visible message. No eligible message means both fields are null. Reading a preview does not acknowledge a message, mark it read, send a receipt or restore permission. `canExchange` is a current display hint; Review/send/fetch retain their independent server checks.

This API delivers private message content to the requesting participant. Keep it behind the existing author/session UI barriers and clear it on account changes. Never copy preview text to a push payload, analytics, log, family report, financial projection or journal. A guardian's family administration does not permit listing a child's separate conversation unless the guardian is an actual endpoint. No raw-table grant, publication or service-role participant preview capability is added. Both RPCs revoke default/public/anonymous/service execution and grant only `authenticated`; `SECURITY DEFINER` functions pin an empty search path.

## Revocation and lock behavior

Block/revoke/consent/membership operations that use the existing relationship/family locks serialize against preview delivery. If revocation wins first, the waiting preview rechecks its state and cannot deliver newly disallowed incoming content/name. If preview holds the scope first, the revocation waits until that transaction releases it; content already delivered cannot be remotely withdrawn. Auth session deletion similarly serializes against the actor's existing share lock. The function does not promise retroactive removal from a device or immediate disconnected-client revocation.

The algorithm depends on existing API-controlled immutable contact family bindings and migration013's global ordering. Direct privileged out-of-band edits that ignore those locks are outside this application concurrency protocol. Independent security review and actual concurrent-session tests remain release gates.

## Source tests and owner-run checks

`supabase/tests/conversation_previews.test.sql` uses a rolled-back fictional fixture with two children, an outside-family peer, an unrelated account, independent verification/consent and 54 conversations for a guardian. It checks existing grants/array compatibility, own/sibling/guardian/external isolation, a 160-character Unicode boundary, visible timestamps, empty previews, complete paging with tied creation times, forged cursors/limits, both-direction blocking, acknowledged/own history, missing acceptance, expired verification, relationship revocation, managed-session revocation and withdrawn child consent. No test was executed by this helper.

The owner should also run a separate multi-connection regression, following the existing receipt-lock test pattern:

1. Seed an author with contacts spanning families A, B and Z and actually permitted queued incoming messages. In one connection hold only the B/Z contact-pair advisory lock, without a family lock. Start the page RPC in a second transaction. Confirm it waits on that pair and that a third connection cannot acquire the A family lock: this proves the complete family union was locked first.
2. Let revocation hold the appropriate family/contact locks first; start a waiting page read, revoke/block the contact and commit. The completed page must use the unavailable name and omit queued incoming content/time while preserving only authorized history. Repeat for child consent withdrawal, which must deny the child actor entirely.
3. Reverse that ordering and show revocation waits until preview delivery commits. Repeat managed-session deletion versus its share lock. Bound statement/lock timeouts and verify no deadlock across reversed external-contact anchor families.

Do not call single-connection pgTAP success proof of these races. Record the actual owner-run migration, full pgTAP and concurrency results separately before claiming integration readiness.
