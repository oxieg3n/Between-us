# Privacy, permissions and threat model

Status: requirements and prototype limitations, not implemented production security.

The current master mission permits optional on-device inference and explicitly downloaded, hash-verified licensed model assets. Only appearance preference and those model files persist. Journal/finance content, prompts and native sessions remain memory-only; no cloud inference or real financial transfer is authorized. See `../JOURNAL_INTELLIGENCE_SECURITY.md`, `FINANCE_BOUNDARIES.md` and `../mission/PRODUCTION_RELEASE_GATES.md`.

## Permission matrix

| Action | Child/teen | Parent/guardian administrator |
| --- | --- | --- |
| Create/read/edit/delete own journal and drafts | Yes | Yes |
| Read another author's journal or unsent drafts | Never | Never, including administrator |
| Compose/review a separate conversation | Yes | Yes |
| Send in-app message | Only permitted, accepted, verified, unblocked connection | Same connection requirements |
| Add/remove trusted people | Request an addition; block/report directly | Manage directly without another administrator's approval |
| Invite/manage family or approve child request | No | Yes; approval alone cannot enable messaging |
| Create recurring check-in | No | Yes |
| Answer, postpone or skip own check-in | Yes, without penalty | Yes for own prompts |
| Access safety information or another safe adult | Always, without approval | Always |

The prototype role switcher is an inspection tool for fictional users. It is not a login or a secure shared-device account boundary. In-memory separation prevents ordinary cross-role UI display, but debugging tools can inspect process memory. Restart clears entries; this is not secure deletion or encryption.

## Connection state model

Requested -> approved -> invited -> accepted -> verified is a conceptual lifecycle. A parent may add an approved contact directly. Acceptance and verification are independent facts, not implied by parent approval. Only a permitted connection with completed acceptance and verification may message; blocked and removed always deny, including queued sends and realtime subscriptions. Prototype fixture labels must say verification is simulated. Production must record verifier, method, timestamps, expiry and revocation; never trust client-supplied flags.

Blocking must take immediate precedence over invites, queued work, notifications and new sessions. Reports need confidential intake and operational follow-through; a local demo report is never submitted. Children need a safe external help path even when an abusive guardian controls their contact approvals. Do not notify an alleged unsafe adult automatically when a child seeks help or reports them.

## Threats and required controls

| Threat | Required design/control before real data |
| --- | --- |
| Guardian uses admin role to inspect child's writing | Journal ownership checks independent of family admin; no admin export/read endpoint; recovery cannot silently grant guardian access |
| Malicious client changes author/family/contact ID or role | Derive identity from authenticated server session; authorize each object/action; deny forged roles and cross-family IDs |
| Adult impersonation, stolen invite or grooming | Reviewed age/identity and relationship verification, expiring single-use invitations, acceptance, revocation and abuse response; no anonymous incoming contact |
| Journal leaks through suggestions, logs or push | Local opt-in matcher only; no entry transport, analytics, crash payload or automatic draft copy; push contains neutral metadata only |
| Shared/unlocked/stolen device | Device/session locking, account switching and memory clearing policy; background/app-switcher handling; reviewed secure local storage and key custody |
| Provider/operator/database compromise | Minimize retained data, isolate environments/secrets and privileged access; reviewed encryption/key design, audit controls and incident response |
| Removed contact retains queued access | Reauthorize at send and delivery; revoke subscriptions/tokens; test races and offline retries |
| Skip becomes surveillance or punishment | No scores, missed-check-in escalation, streaks or repeated reminders; clarify any future parent-visible status before collecting it |
| Report exposes child to unsafe guardian | Separate case permissions, restricted operational access, reviewed confidentiality/retention and age-appropriate explanation |
| Backups or logs retain deleted content | Explicit retention/deletion/export design including backups, crash reports and vendor systems; test restore behavior |

Safety resources must be reachable without login, contact approval or disclosure of a journal. The UI may encourage contacting a safe nearby adult or local emergency services when immediate help is needed. Any regional helpline directory requires verified current sources and localization; this document does not invent phone numbers or claim emergency dispatch capability.

## Required negative tests before backend release

- A parent cannot list/read/export a child's journal, even in the same family; another child and unrelated families cannot either.
- Tampering author IDs, role flags, family IDs, contact IDs and realtime channel names cannot bypass authorization.
- Approval, invitation or acceptance alone cannot send. Blocked/removed contacts fail at send/delivery/subscription time, including a block between review and send.
- A journal reflection never includes original entry text in a message or network request; the user explicitly reviews every shared message.
- Role/account change never exposes another user's draft. Logout and shared-device switch clear sensitive screen state.
- Skipping creates no punishment event, repeated notification or emotional score.
- Safety/help and confidential report paths work when a parent is the reported person and when parental permission is unavailable.
- Expired/replayed invites, revoked sessions, duplicate deliveries, offline retries and notification token reassignment fail safely.

## Production review gate

Decide identity/age assurance, verifiable consent and relationship disputes with qualified privacy/child-safety reviewers for target jurisdictions. Review child-friendly notices, withdrawal, deletion/export, notification permissions, abuse staffing, escalation, breach response, vendor contracts/subprocessors and accessibility. This is a review checklist, not legal advice or a statement of compliance.

Do not collect real children's information until the owner approves the reviewed architecture and the access-control, storage and abuse-response design passes independent review. Do not connect paid services, introduce credentials or deploy production resources without explicit owner approval. No secrets belong in an Expo public environment variable or mobile bundle.
