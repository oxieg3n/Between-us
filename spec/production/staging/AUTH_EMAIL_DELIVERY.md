# Auth email delivery qualification

2026-11-16. **BLOCKED: OWNER / EXTERNAL.** No hosted project, SMTP account, sender/domain configuration, credentials, email send or DNS mutation was created/performed. Local Supabase mail capture proves only local Auth flows. Public enrollment and real-child information remain off.

Current official [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp) says the built-in sender is restricted to project-team addresses, currently two messages/hour, with no delivery SLA. Custom SMTP starts with a 30-message/hour Supabase limit that must be reviewed alongside the sender's own allowance. These settings can change. Do not disable email verification, increase limits blindly, or invite children into the project team to bypass delivery restrictions.

## Required owner setup

1. Approve an existing/free eligible SMTP sender or official Send Email hook, its processing terms, region, retention, account/domain ownership, quota and responsible operator. No free allowance or no-credit-card eligibility has been verified for a specific external sender; no provider is selected here. If secure delivery cannot be operated within $0, record the precise blocker and obtain an explicit budget decision before any spend.
2. Owner controls sender-domain verification and approved SPF/DKIM/DMARC DNS changes; approve From/Reply-To and a genuinely monitored recovery/support channel. Use separate staging sender/recipient allowlists and fictional personas whose mailboxes are controlled by consenting adult testers. Reserved `.test` fixtures cannot establish internet deliverability. Actual test mailbox addresses stay out of published evidence.
3. Configure Supabase Authentication SMTP through the owner dashboard using protected credentials, or separately review the [official Send Email hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook). No keys enter mobile bundles, chat or Git. The variable-name inventory is `services/backend/config/staging/operator.env.names`; it is not loaded by scripts. A hook is not assumed to be a free compliant delivery service.
4. Keep registration intent, guardian relationship/VPC and child credential acceptance gates separate from email ownership. Owner records exact approved site URL and recovery/native redirect allowlists. Native callback is currently `between-us://auth/callback`; runtime cold/warm-device qualification and issuer/audience reconciliation remain mandatory. No wildcard redirects, silent account switch or disabled confirmation fallback.
5. Review shipped `supabase/templates/confirmation.html` and `recovery.html`, plus every newly enabled invitation/change-email/security template. Templates must contain only necessary account-action wording and bounded single-use action context, with no child name, private writing, message/finance/report content or tracking pixels. Confirm final sender instructions, link expiry, accessibility/plain-text readability and safe anti-phishing wording with operator/reviewer.

## Bounded actual delivery matrix — not yet run

Use two owner-controlled adult-test inbox providers and separate fictional parent/child identities after hosted authorization. Keep rate below both Supabase and sender limits; test abuse/load locally, not by overwhelming Free SMTP.

| Exercise | Required evidence, without message links/tokens/addresses |
| --- | --- |
| Confirmation / invitation / password recovery | Correct approved sender/template, SPF/DKIM/DMARC result, observed inbox arrival/time, correct independent account; no claim based only on provider acceptance |
| Expired, reused and substituted token | Single-use/expiry honored; no role/guardian/VPC grant from email alone |
| Native cold/warm callback and browser | Exact approved redirect; PKCE verifier binding; cancel, existing-session and account-switch denial; expired/mismatched callback fails closed |
| Spoofed redirect / modified link / changed account | No unapproved URL, credential leak or enrollment bypass; readable generic error |
| Bounce, suppression, timeout and temporary failure | Correct uncertain/failed status, bounded deliberate resend, no false notice/consent receipt or automatic mail loop |
| Sender or Supabase rate exhaustion | Controlled local fault for bulk branches; at most separately approved low-volume hosted proof; existing recovery access fails honestly |
| Sender link rewriting and mail security scanning | Confirmation remains bound to intended action; disable inappropriate click tracking; a scanner cannot silently complete the user's action |
| Privacy and accessibility | No fictional sentinel content/secret in logs, subject/preview or generic error; readable keyboard/screen-reader action and safe help access |

Review provider bounce/complaint/webhook authentication and replay protection if those callbacks are introduced. Do not publish raw MIME, private URLs, recipient details, service keys or token-bearing traces as QA artifacts. Record non-content trace IDs, source/config/template hashes, provider state, outcome, timestamp, reviewer and exact environment.

Recovery must explain permanent device-journal/key loss truthfully. Changing an Auth password or recovering a family account cannot recover another author's local journal key. Unsafe-guardian/custody recovery and child credential policy require qualified review; a delivered message cannot resolve them. [Privacy owner decisions](CHILD_PRIVACY_OWNER_DECISIONS.md).

Acceptance remains **UNTESTED** until actual SMTP configuration, authenticated sender checks, inbox arrival, callback/token/rate/failure cases and named operational custody pass against the reviewed hosted target. No outbound email was sent. Provider-specific sender limits, free eligibility, support address and incident coverage remain unresolved owner decisions. [Deployment preparation](DEPLOYMENT_RUNBOOK.md), [operating budget](FREE_PLAN_OPERATING_BUDGET.md).
