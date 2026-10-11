# Security design (Phase 1)

## Authentication and sessions
Supabase Auth (email + password). Sessions live in secure cookies managed by `@supabase/ssr`. Server code calls `auth.getUser()`
(which re-validates with the Auth server) and never trusts a session cookie by itself. Passwords: 10 to 72 characters.
Login, sign-up and reset give identical answers for existing and unknown emails (no account enumeration). Post-login
redirects accept same-site paths only.

## Authorization and data isolation
Every business-owned row is tied to its owner and protected by Postgres row-level security (RLS). Users cannot read or change
another user's rows even if they guess an ID. Table privileges are minimal (column-level for updates). Admins cannot see business data.
Test evidence: `supabase/tests/10_rls_tests.sql` (53 checks).

## How Premium is enforced
`entitlements` can be read by its owner but written only by trusted server code or the two admin functions. `resolveEntitlement()`
is the single decision point and fails closed (missing/odd data = no Premium; `premium` requires `paid` status and a future end date).
Browser-supplied "I am Premium" signals are never read.

## Secrets
Real values live only in `.env.local` (git-ignored) and the host's settings. `.env.example` has placeholders only. The Supabase
service-role key is **not used** in Phase 1 and a test fails if source code references it. When Paystack arrives, the secret key
and service-role key will be server-only. Config errors name the variable, never the value.

## Paystack (planned, Phase 7)
Server-side initialise and verify; ignore browser "success" messages; verify webhook signatures; store event ids for idempotency;
amounts from server config. Official docs will be checked before coding.

## Admin
Admin = a row in `admin_users`, inserted only by the owner in the Supabase SQL editor. No app or API path can create one.
Admin grant/revoke actions re-check admin status in the database and write an append-only audit row (actor, action, target, time).

## Saved data
Saved calculations store the user's INPUTS only. Results are recomputed by the shared engine on the server when saved and every time a record is opened, so a result cannot be forged through the browser. Writes need Premium (checked in the database); delete is always allowed for the owner. Known trade-off: calculator inputs travel in the page address (see docs/KNOWN_LIMITATIONS.md item 16).

## Headers and CSRF
CSP (frame-ancestors none, object-src none, connect-src limited to self + your Supabase URL), nosniff, X-Frame-Options DENY,
Referrer-Policy, Permissions-Policy, HSTS. Server Actions are POST-only with Next.js' built-in origin check.

## Backups and recovery
Free app: `unaabzcalc-free-v1-baseline.zip` and Git tag (once GitHub is connected). Database: export with `pg_dump` before every production migration.

## Known limitations
See `docs/KNOWN_LIMITATIONS.md`. In short: pages not yet run against real Supabase; no app-level rate limiting; CSP allows inline scripts; this has had no independent security review. Do not call it production-secure yet.

## Exports (Phase 4)
- Export routes run as the signed-in user, so row-level security applies: another user's record is a 404.
- Files are built from stored inputs by re-running the engine; nothing from the browser is trusted.
- Excel text is written as inline strings, so a name like `=HYPERLINK(...)` is text, never a formula (tested).
- Download names contain only letters, digits, dash and underscore. Responses are `no-store` with `nosniff`.
- Share text excludes customer names and notes.
- Calculate no longer puts numbers in the URL.

## Advanced calculators and estimators (Phase 5)
- Previewing and saving them needs Premium (checked in the `calculate` Server Action and the page; saving is also enforced by the database). Opening, exporting and deleting what you already saved never needs Premium.
- No prices, taxes or standards are built in, so there is no data to leak or go stale; results are recomputed from stored inputs on every open and export.
- Inputs are cleaned to the declared fields, limited to 18,000 bytes, and refused if they contain control characters.

## Dashboard, records and analysis (Phase 6)
- All reads run as the signed-in user, so row-level security applies; another user's business is a 404.
- Record search escapes `%`, `_` and `\` and searches one column per table (no free-form filter strings are built from user text).
- "Download my records" works on every plan: your own data is never paywalled. Text is written to Excel as plain text, never as formulas.
- Downloads are `no-store`, `nosniff`, with letters/digits/dash-only file names.

## Payments and ads (Phase 7)
- The Paystack secret key and the Supabase service-role key are read only by files on a fixed server-only list (a test fails if any other file names them or if a listed file is a client component).
- Webhooks: raw-body HMAC-SHA512 signature (timing-safe), 100,000-byte limit, de-duplicated by body hash, and the transaction is re-verified with Paystack before anything is granted. The amount in the webhook is never used.
- Checkout refuses to run if Paystack's plan amount, currency or interval differs from the displayed price.
- Redirects to Paystack are checked to be https on paystack.com; the callback requires the signed-in owner of the payment.
- CSP: `form-action` now allows `https://*.paystack.com` (needed for the redirect to checkout); Google ad domains are allowed only when `ADSENSE_PUBLISHER_ID` is set. Untested with real ads.
- Not enforced: Paystack's source IP list (the signature is the check).

## Admin screens (Phase 8)
- Two locks: every admin page and action calls `requireAdmin()` (a 404 for non-admins), and every admin database function re-checks `is_admin()` itself. The "Admin" link on the workspace page is a convenience only.
- Admin rights live in `admin_users`, which no API user can write. Admins have no access to anyone's business records.
- Every admin change needs a written reason and is appended to the audit log (which cannot be edited or deleted). Opening a person's detail page is logged too.
- Webhook bodies and hashes are never shown, and payment-record contents are limited to what the screens need.
- Search and filters: values are checked or escaped before they reach the database; page size is capped.
