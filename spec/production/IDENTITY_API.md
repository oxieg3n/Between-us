# Identity migration interface

2026-11-16. Implementation: `services/backend/supabase/migrations/202611160001_identity.sql` (held as `.sql.pending` until root review). This records final signatures and integration requirements; execution and real Auth verification belong to the master. All examples and tests use fictional reserved-domain identities. Public enrollment, real-child collection and public-report promises default OFF.

## Shared private boundary

The contract names are implemented: `profiles`, `families`, `children`, `memberships`, `operators`, `consents`, `registration_intents`, `guardian_invites`, `identity_audit` and singleton `deployment_policy` live in `app_private`. Every table enables RLS; authenticated/anonymous callers have neither raw-schema access nor direct table grants. Only explicitly granted `api` RPCs are exposed. Functions pin an empty search path. Server/operator grants are separate from ordinary guardian authority.

| Private helper | Behavior |
| --- | --- |
| `actor() -> uuid` | JWT UID, expiry and `session_id` must match current `auth.sessions` + Auth user; SHARE-locks that session row against sign-out deletion. Denies banned/deleted/suspended/closed accounts; active child authority additionally requires current consent/membership. Onboarding accounts can only use workflows whose checks explicitly allow onboarding. |
| `lock_family(uuid) -> void` | Transaction advisory lock (`hashtextextended(family_id::text,1729)`). Lock family before contact locks, financial aggregate locks or enrollment-intent row updates. |
| `account_usable(uuid) -> bool` | Active confirmed adult, or active independently enrolled child with active child membership and unexpired verified consent from a currently active guardian. Synthetic/approved opaque child Auth aliases are explicitly distinguished from ownership-verified personal email. |
| `is_member(uuid,uuid)`, `is_guardian(uuid,uuid) -> bool` | Current account and membership authority; profiles/metadata alone never grant membership. |
| `child_for_user(uuid,uuid) -> uuid` | Child subject only for current child membership; otherwise NULL. |

These helpers have no public execution grants; other definer functions call them internally. Supabase documents that a JWT can remain valid after sign-out, and checking the managed session row closes that gap. [Sessions](https://supabase.com/docs/guides/auth/sessions).

## Exposed signatures

All functions below require `authenticated` except the explicitly service-only parent intent issuer. PostgREST must expose `api` and use that schema for RPC. All UUIDs and times are server-derived unless an existing authorized object ID is required.

| Function | Result / restriction |
| --- | --- |
| `api.get_context()` | JSON `{user,families,memberships,children,policy}`; child sees only their own child subject, guardians their authorized family's child subjects. No consent evidence, session tokens, ledger, child directory or journal data. |
| `api.issue_parent_registration(p_email text)` | **service_role only**; JSON `{id,token,expiresAt}`; current policy and recipient restrictions checked. Root's trusted HTTP layer must additionally rate-limit any local synthetic request route. |
| `api.bootstrap_parent(p_display_name text)` | JSON `{id,kind}`; one-time pending **parent-purpose** identity with current policy, recipient and expiry; a child-purpose identity can never use it. |
| `api.create_family(p_name text,p_timezone text)` | Family UUID; active parent only; timezone must be a PostgreSQL zone. |
| `api.create_child(p_family_id uuid,p_name text)` | Pending child UUID; guardian and collection policy required. Does not create Auth identity or activate authority. |
| `api.request_child_consent(p_child_id uuid,p_notice_version text,p_policy_version text)` | Pending consent UUID; versions must match deployment policy; guardian cannot mark it verified. |
| `api.verify_child_consent(p_consent_id uuid,p_method text,p_evidence_reference text,p_expires_at timestamptz)` | Void; active `operators(scope='consent')` only, independent of the subject family. Rejects checkbox/email methods; evidence reference is private metadata, not uploaded evidence. Expiry is future and at most one year. `synthetic_fixture` only in explicit local mode. A recorded method is not proof of legal adequacy. |
| `api.begin_child_enrollment(p_child_id uuid,p_email text DEFAULT NULL)` | JSON `{token,email,authAlias,expiresAt}`; current guardian + verified unexpired consent, **every child/teen age**. Optional email must belong to a new independent identity. NULL generates a unique opaque technical alias, never a substituted guardian email. |
| `api.accept_child_enrollment(p_token text)` | JSON `{childId,familyId}`; authenticated independent child identity must match token-bound recipient and subject. Activates child/membership once; a guardian session cannot accept it. |
| `api.invite_guardian(p_family_id uuid,p_email text)` | JSON `{token,expiresAt}`; guardian, recipient-bound; does not create an account or prove legal guardianship. |
| `api.accept_guardian_invite(p_token text)` | Family UUID; intended active parent-purpose account only, single use, current issuer authority. |
| `api.withdraw_consent(p_child_id uuid)` | Void; current guardian or active enrolled subject; withdraws consent, suspends child subject, revokes child membership and outstanding enrollment tokens under family lock. |
| `api.revoke_membership(p_family_id uuid,p_user_id uuid)` | Void; current guardian; revokes associated consent/invites under family lock. Last-guardian removal fails and requires a reviewed confidential dispute/operator procedure. |

`operators` has composite primary key `(user_id,scope)` with `consent`, `verification`, `privacy`, `safety` and `active`; only trusted database/operator provisioning may change it. Contact verification must use `verification`, not `consent`. No guardian endpoint grants operator authority.

## Account-creation sequence

1. **Parent:** trusted service issues a parent intent, returning its random 32-byte bearer token once. Auth signup/createUser supplies `{registration_token: token}` in user metadata and a distinct credential. The hook and database trigger both validate token hash, recipient, expiry and policy; metadata `role`/`kind` has no authority. Auth email ownership and login are still required before bootstrap.
2. **Child/teen:** guardian creates a pending subject and records the applicable notice/consent request. An independent consent operator finalizes reviewed evidence. Guardian and child jointly begin enrollment, receiving a recipient-bound intent. A trusted child-provisioning handler creates the separate managed Auth identity with that token and the child's distinct credential; it must neither share a family password nor expose an impersonation control. The child signs in and accepts that same token once.
3. Auth creation binds/consumes the creation stage; child acceptance is a separate one-use stage. Only hashes live in intent tables. The trigger strips the bearer token from stored Auth metadata after binding. Issuance/acceptance must not log tokens. Unaccepted intents expire in 30 minutes; guardian invitations expire in one day. A child intent cannot become a parent intent by changing metadata or email.

The root-owned Auth configuration must enable `before_user_created` at `pg-functions://postgres/app_private/before_user_created`; the migration grants execution only to `supabase_auth_admin`. The Auth insert trigger repeats validation so an administrative createUser path cannot accidentally bypass the policy. Parent/child intents are therefore needed even for managed local admin creation. [Before-user-created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook).

An alias is a login identifier, not a mailbox or proof the child owns email. Local aliases use `child-<random UUID>@accounts.test`; future public aliases use `@between-us.invalid` only after `child_alias_policy_id` is approved and all public/real-child gates pass. No message, confirmation or recovery mail may be sent to an alias. Root's trusted provisioning must distinguish technical Auth confirmation from personal-email verification and require the child to set their own secret before activation. Alias credential recovery/dispute handling remains a release review gate; guardian access never yields journal keys.

## Local seed and tests

Root's guarded local seed may set `local_synthetic=true`, `notice_version='synthetic-v1'`, `consent_policy_version='synthetic-v1'`, leaving public flags false. Only `.test` email addresses pass this mode. It cannot coexist with public/real-child enablement. There is no runtime environmental guess or client toggle that enables it.

Public policy fields are `public_enrollment_enabled`, `real_child_data_enabled`, `public_reports_enabled`, `jurisdiction_policy_id`, `age_policy_id`, `legal_review_id`, `notice_version`, `consent_policy_version`, `consent_verification_method`, `retention_policy_id`, `operator_policy_id`, `child_alias_policy_id`. All public review identifiers default NULL. Local operators may finalize only `synthetic_fixture`; a future public verification method must exactly match the independently approved policy method and cannot be that synthetic marker. `guardian_managed_children` has a database constraint requiring true; there is no age-based opt-out. Changing policy records is privileged operator work, not application enrollment UI.

`supabase/tests/identity.test.sql` uses pgTAP in a rolled-back transaction, synthetic Auth rows/sessions and reserved-domain fixtures. It tests closed defaults, raw-write/operator denial, metadata forgery, recipient/expiry binding, both younger-child/teen consent gates, independent verification, separate child activation/credential identity, no parent promotion, invitation replay, cross-family scope, JWT/session binding, expiry, managed-session deletion and immediate consent withdrawal. It does not establish GoTrue HTTP behavior, session-delete concurrency, credential UX or legal adequacy; root must execute real local Auth/PostgreSQL integration and concurrency checks before claiming those pass. No migration or test was executed by this helper.
