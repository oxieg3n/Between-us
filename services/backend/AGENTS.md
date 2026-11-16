# Backend implementation contract

Read root AGENTS and spec/production/ARCHITECTURE.md / SECURITY_REVIEW.md. This is a Supabase backend with private Postgres tables, exposed api RPCs and a server-only TypeScript finance adapter. No new identity provider, custom encryption, cloud writes, paid resources or real child data.

Master owns package/config changes, local service/migration execution, API integration and Git. Helpers own only explicitly assigned migration/test/source files. Never run migrations or Docker concurrently. Never print or commit generated local/hosted keys, passwords or JWTs. Local credentials and generated bundles remain ignored.

Every object is authorized from Auth UID plus active session/current membership. User metadata/client role flags are untrusted. app_private contains raw tables; api exposes only granted projections/functions. SECURITY DEFINER functions pin search_path and revoke default public execution. Public enrollment defaults off; only guarded local synthetic seeds may enable test identities. No backend journal table or upload route. Realtime may contain only content-free own-user invalidations.

Schema/handler signatures are coordinated by master before independent migrations. Reuse r12 finance logic; atomic commit CAS rechecks actor/session/membership under transaction lock and never returns private aggregate/revision to a child. Blocking locks the same relationship as sends/delivery. Public reporting cannot promise staffed response without an operator. Tests must exercise direct adversarial API/SQL clients, not only button visibility.
