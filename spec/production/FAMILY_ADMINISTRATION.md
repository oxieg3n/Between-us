# Guardian family administration

Pending migration019 and the new `ProductionFamily` screen add a member directory and confirmed removal through the existing membership endpoint. Root owns navigation/integration, migration application and actual UI/database checks. No identity, session, invitation, consent or removal helper is replaced by this migration.

## Member directory

`api.list_family_members(p_family_id uuid, p_limit int DEFAULT 50, p_before_user_id uuid DEFAULT NULL)` returns:

```ts
type FamilyMemberPage = {
  members: {
    userId: string;
    displayName: string;
    kind: "parent" | "child";
    role: "guardian" | "child";
    childId: string | null;
    currentOwn: boolean;
  }[];
  hasMore: boolean;
  nextBeforeUserId: string | null;
};
```

The managed `actor()` must currently be an active parent guardian of the requested family. The function performs a preflight own-guardian check, acquires the existing single-family advisory lock, then rechecks actor/guardian authority before projecting rows. This serializes against ordinary membership/consent changes that use the same family lock. Only active, currently usable memberships with matching trusted profile kind/role are listed. A child requires the existing approved consent/account/membership conditions; pending or unusable children are not labeled approved by this directory. Pending enrollment belongs to the existing invitation/child-setup workflow.

Rows sort by user UUID descending, with at most 50 per page. `p_limit` null or outside 1–50 raises `22023`. Pass the returned `nextBeforeUserId` unchanged while `hasMore` is true; append/deduplicate by `userId`. An inactive, unapproved, other-family or absent cursor raises the same `42501`. If a cursor is removed between pages, refresh from the beginning rather than treating it as another family's selector. A terminal page has a null cursor; paging beyond the oldest valid member gives an empty terminal page. Concurrent newly approved members above the cursor appear after a refresh.

The six metadata fields are the full projection. There is no email, Auth alias, credential, session, IP, consent record, case/report, finance, journal or unsent-draft field. `displayName` comes from the permitted member profile; a blank name becomes `Family member`, never an email or UUID fallback. `currentOwn` is calculated from the server actor. The function pins an empty search path and grants execute only to `authenticated`; the transport service role is not a guardian directory identity. Existing raw-table grants remain absent.

## Removal and independent authorship

The screen invokes the existing `api.revoke_membership(p_family_id,p_user_id)` after explicit confirmation naming the person and family. That endpoint remains the sole authority: it locks the family, rechecks the current guardian, requires an active target membership and prevents removing the final active guardian. It revokes the membership, pending guardian invitations issued by that target and applicable pending/verified family consent, then records the existing audit event. This migration does not duplicate those rules, delete an account, grant roles or promote/impersonate a child. The last-guardian error requires the existing reviewed dispute process; this screen does not claim that an operational dispute service has been configured.

Removing a child ends family application authority under the existing account/membership/consent checks. It does not erase the child's independent Auth identity/profile, transfer their journal keys, export their writing or grant a guardian their account session. A still-valid independent managed session can reach the existing narrow own-privacy identity portal even when ordinary family application access is denied. This does not promise that the online Journal unlock UI will work after family/account authority has been revoked; local key custody, stored pages and own-account recovery/deletion policy remain separate. Existing family audit/financial retention is not changed by membership removal.

## Mobile integration

`ProductionFamily({ context, onBack, onInvitations, onChanged? })` uses the supplied UID only as the expected-author intent boundary and loads fresh server `get_context` before exposing guardian controls. Family choices come only from fresh own guardian memberships. Every member read/removal passes the same original expected UID to `accountRpc`; server authorization remains authoritative. The screen offers no arbitrary actor/UID input, role promotion, password field or child impersonation control.

Verified parents with no guardian families still receive `Family invitations and child setup`, which must navigate to root's existing create/join/guardian-invitation/child workflow. Children receive no administration controls. Family changes clear the current roster and confirmation. Load more uses the server cursor. Every removal first rechecks current server guardian scope, then calls the existing endpoint and refreshes server context/roster before reporting success. `onChanged` lets root refresh its outer context, including self-removal or revoked child access. Callers should not reimplement revocation or infer the last guardian from only one loaded page.

Failures hide the roster and require Refresh to determine the current server result before another attempt; the UI does not blindly retry a possibly completed removal. Background/inactive and Auth events retire pending UI results, clear member/confirmation state and require current permission refresh. The component is keyed by the managed author UID; stale awaited results cannot populate a later author's workspace. Root still owns the global privacy/session barrier and must keep safety/own-privacy routes reachable independently of guardian approval. No member metadata is persisted locally by this screen.

## Verification and remaining gates

The 44-assertion fictional SQL fixture covers authenticated-only/raw-table grants, complete 53-approved-member pagination, exact six-field projection, pending child suppression, own/other-family boundaries, child/forged-role denials, cursor forgery, page bounds, session mismatch/revocation, guardian removal and invitation invalidation, child family-access loss with retained own privacy identity, and the unchanged last-guardian guard. All fixtures roll back. The helper performed structural source review only; SQL was not executed.

Mobile typechecking and focused Family ESLint are required before freeze; root must exercise initial load, no-family invitations, multi-family selection, paging, cancellation/confirmation, successful and failed/uncertain removal, self-removal, child/outsider navigation, account changes and foreground/background privacy in the actual app. A two-connection list-versus-revocation check should demonstrate either the pre-revocation directory under the held family lock or the revalidated post-revocation result/denial, without mixed unauthorized rows. No database/service, package, Git, native build/emulator/device or browser operation was performed by this helper. Source checks are not deployment, legal approval or independent security certification.
