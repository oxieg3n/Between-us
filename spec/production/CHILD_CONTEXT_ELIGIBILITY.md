# Child setup state and selection readiness

Pending migration021 adds two display fields to each existing `get_context().children` row: `state` is the child workflow state and `accountReady` is an exact JSON boolean. Existing actor checks, row visibility, ordering, family/membership/user/policy projections and execution grants remain unchanged. Guardians still receive pending/unready children in their own families for onboarding; children still receive only their own currently admitted subject. No caller-supplied role or eligibility flag changes server authority.

The readiness expression is:

```sql
COALESCE(
  c.state = 'active'
  AND EXISTS (SELECT 1 FROM app_private.profiles p
              WHERE p.user_id = c.account_user_id AND p.kind = 'child')
  AND app_private.child_for_user(c.family_id, c.account_user_id) = c.id,
  FALSE
)
```

The existing `child_for_user` / `is_member` / `account_usable` helpers validate the exact linked child subject, active admitted membership and current account/consent/guardian state. The explicit profile-kind condition prevents a parent identity linkage from masquerading as a distinct child account. A missing account, pending child, absent/revoked membership, unusable account or missing/expired/withdrawn consent produces false, never null. The requesting author may be that child: readiness does not require a different requesting UID. It also does not require the child to be currently logged in; deleting a child session does not turn this flag into a presence indicator.

The child projection now has exactly `id`, `familyId`, `name`, `state`, `accountReady`. No child Auth UID, email/alias, password, session, consent evidence, report or private writing field is added. This remains a scoped server snapshot, so readiness can change after the response. Financial and check-in actions retain their current server authorization and locks; the boolean is not a capability, offline grant or substitute for those checks.

Mobile `AccountContext.children` accepts the two fields as optional for older contexts. `financialScopes` requires both `state === 'active'` and `accountReady === true` before applying its existing parent/own-child membership filter. Unknown/malformed fields fail closed. This avoids defaulting a guardian's financial screen to an earlier pending child, while still allowing the first ready child to be selected. An older context without the new fields offers no financial scope until refreshed from the updated backend.

Checkins independently applies the same explicit readiness predicate to its own guardian child selector, including current parent/active display context. It does not import Finance or derive scheduling eligibility from money state. Existing check-in contact approval, current guardian access and scheduling RPC checks remain separate. The family/child setup screens can continue using the full children array so pending enrollment is not hidden.

The portable Finance test adds pending-first, missing-account, unknown-state/readiness, suspended and malformed boolean cases, retaining the existing child/sibling/guardian separation assertions. The SQL fixture is fictional and rolled back: it covers ready and unready children in parent context, pending/missing/linkage/membership/consent cases, exact projection keys/booleans, child/outsider/operator scope, expired consent, revoked membership, session-independent readiness and actual consent withdrawal. No SQL was executed by this helper. Root owns migration review/application, full pgTAP and native/browser confirmation that a pending child before Alex no longer becomes the default financial scope.

This change creates no new backend financial or check-in authority, real-data permission, service, credential or deployment. No existing applied migration, root Application flow, financial operation method or unrelated client behavior was changed.
