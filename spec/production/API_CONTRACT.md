# Backend integration contract v1

This contract coordinates non-overlapping migrations/handlers. Root owns runtime/config/migration execution. All dates and real permissions come from PostgreSQL/Auth, not mobile roles. No public/real-child enrollment is enabled by these interfaces. Read ARCHITECTURE.md and SECURITY_REVIEW.md first.

## Schema and shared names

- `app_private`: raw tables, not exposed by PostgREST. `api`: explicitly granted RPCs. Enable RLS on all tables; no authenticated direct raw-table writes. Definer functions pin `search_path=''`, fully qualify references, revoke PUBLIC/anon defaults and grant only intended roles.
- `profiles(user_id uuid PK references auth.users, display_name text, kind text [pending,parent,child], state text [onboarding,active,suspended,closed])`.
- `families(id uuid PK,name text,timezone text)`, `children(id uuid PK,family_id uuid,name text,account_user_id uuid unique nullable,state text)`.
- `memberships(family_id,user_id,role [guardian,child],child_id nullable,status [active,revoked])`; only server workflows create/change authority.
- `operators(user_id,scope text,active bool)` is service-controlled; scopes include consent/privacy/safety. Ordinary guardians are never operators by metadata or family role.
- `deployment_policy`: singleton, public enrollment/real child data/report promises OFF; reviewed jurisdiction/age/notice/consent/retention/operator identifiers nullable. Local-only synthetic seed may allow reserved `.test` addresses/fictional consent fixtures. Guardian-managed child/teen enrollment is mandatory for every age and cannot be disabled in policy.
- `consents`: child/family/guardian scope, status, notice/policy version, verification method/evidence reference/verifier, expiry and withdrawal/revocation. A checkbox/email confirmation cannot finalize VPC.
- Registration/guardian/child invitation records hold hash of random single-use expiring recipient-bound token, not token plaintext. Child account creation requires a current guardian-issued enrollment intent for all ages; child self-signup is denied. User metadata cannot assign kind/role. Auth hooks bind the verified intent to account creation. Synthetic bypasses must be reserved-domain/local-seed only, never a release fallback.

## Shared private functions (identity migration owner)

`app_private.actor() returns uuid`: require verified Auth UID/current session_id and account not suspended/closed. Check managed `auth.sessions` user binding and lock its row for the request where needed; revoked/expired tokens fail. Onboarding profiles can bootstrap only through intended workflows.

`app_private.lock_family(p_family_id uuid) returns void`: transaction advisory lock. All membership/consent revocation and finance commits take it. Messaging takes family lock then relationship lock, consistently in that order.

`app_private.is_guardian(p_family_id uuid,p_user_id uuid) returns bool`; `app_private.is_member(p_family_id uuid,p_user_id uuid) returns bool`; `app_private.child_for_user(p_family_id uuid,p_user_id uuid) returns uuid`; `app_private.account_usable(p_user_id uuid) returns bool`: derive active membership/child consent/account facts, no client roles. Helpers are private, not a cross-user introspection API.

`api.get_context() returns jsonb`: `{user:{id,displayName,kind,state},families:[{id,name,timezone}],memberships:[{familyId,role,childId}],children:[{id,familyId,name}],policy:{...nonsecret enabled/review states}}`, filtered to caller's authorized scope. No session tokens, journal data, raw consent evidence or hidden financial records.

## Identity/public workflow signatures

- `api.bootstrap_parent(p_display_name text)` only legitimate pending parent-purpose identities, confirmed email and approved registration policy; never promotes an enrolled child.
- `api.create_family(p_name text,p_timezone text)` creates caller's guardian membership, server chooses identifiers.
- `api.create_child(p_family_id uuid,p_name text)` current guardian only, enrollment/notice/consent gates; returns pending child subject, not an activated identity.
- `api.invite_guardian(p_family_id uuid,p_email text)` / `api.accept_guardian_invite(p_token text)` recipient-bound one-time acceptance; role derived from invitation.
- `api.begin_child_enrollment(p_child_id uuid)` guardian only after required verified consent; returns one-time enrollment material for joint setup. `api.accept_child_enrollment(p_token text)` binds intended independently authenticated child. ALL ages require this guardian flow. The Auth hook must not let a client substitute a role/email/child ID.
- `api.withdraw_consent(p_child_id uuid)` authorized guardian/current legally entitled subject, revoke access atomically. `api.revoke_membership(p_family_id uuid,p_user_id uuid)` guardian/current authority, protects last guardian and unsafe/dispute procedure.
- Verification/operator-only transitions use separate service/assigned-operator authority and auditable evidence; do not expose a self-verify parent endpoint. Precise extra signature fields may be added by owner, documented alongside migration.

## Messaging, reports and notification migration owner

Use `trusted_contacts(id,family_id,a,b,...approval,acceptance,verification,revocation)` with one canonical pair; current child-family approval/consent and both acceptances plus independently verified relationship are required. Helpers `app_private.can_exchange(a,b)`/relationship checks deny both block directions and revoked memberships/consents. No open child directory. Only recipient-bound contact invitation/acceptance and appropriate guardian approval permit a relationship; verification is separate.

Expose authenticated `api.list_contacts()`, `api.request_contact(...)`, `api.accept_contact(...)`, `api.approve_contact(...)` guardian when child-bound, `api.revoke_contact(...)`, `api.block_user(p_user_id uuid)`, `api.create_conversation(p_contact_id uuid)`, `api.list_conversations()`, `api.send_message(p_conversation_id uuid,p_body text,p_client_id uuid,p_response text)`, `api.fetch_messages(p_conversation_id uuid,p_limit int default 50)`, `api.ack_message(p_message_id uuid)`. Document final signatures for integration. Message body <=5000, server stamps identity/time, unique sender/client ID with changed-body replay rejection. New fetch/ack requires current authorization; already acknowledged history for own reporting is distinct from undelivered queued bodies. Read status defaults off.

Private reporting/evidence and privacy-request functions allow reporter/assigned operators, never reported guardian/family admins by default. Unstaffed public promises remain off. Notifications use neutral payload, owner/session-bound token, preferences/quiet hours, bounded leases/retries and provider receipts. No journal/message body/hidden-match information or raw-table realtime publication. API response must distinguish saved/outbox/provider-accepted/actually acknowledged; never pretend a mock is delivered.

## Finance master contract

One private aggregate per family holds `{timezone,children,events}` from r12 `createFinanceState`/`applyFinanceCommand`; domain logic stays in the existing mobile source and is bundled into server code at build time. Private revision and append-only event/command records are server-only. Trusted server loads/applies then a privileged transaction CAS rechecks current session/child scope/membership under family lock, compares expected revision, appends and updates atomically. Conflicts retry internally; never expose revision/hidden counts to child clients. Public handler supplies Auth-derived actor and server time, rejects submitted role/actor/time fields, binds operation ID to normalized logical request, and returns only `financeView`. Matching defaults 100%/$20 per child/calendar month/Surprise/manual reveal and starts OFF.

Root owns migration 003/API; identity owner migration 001; messaging owner migration 002. Names may evolve only with an explicit coordinated message and contract update. Helpers do not execute migrations, install packages or use ADB/Git.
