# UnaabzCalc

Business calculators for Nigerian vendors. *Calculate Better. Sell Smarter.*

This repository holds **two apps**:

| Folder | What it is | Status |
|---|---|---|
| `free/` | The live Free app: static HTML/CSS/JS, 14 calculators, no sign-in. **Frozen.** | Unchanged. Do not edit. |
| `premium/` | UnaabzCalc Premium V1: Next.js + TypeScript + Supabase. | **Phase 8 of 9 built (admin screens); see PREMIUM_V1_FEATURES.md for what is tested.** |

The calculation engine lives in **one place**: `free/calc-engine.js`. Premium uses a generated, byte-identical copy
(`premium/src/vendor/calc-engine.js`), kept in sync by `npm run sync-engine` and checked by a test.

## What Phase 1 contains
Project foundation, database (profiles, businesses, entitlements, admin allowlist, audit log) with row-level security,
sign-up / sign-in / sign-out / password reset, a protected workspace page where a user can add businesses, the central
Premium-entitlement rules, security headers, environment validation and the test suites. No payments, ads, calculators,
exports or admin screens yet (see `PREMIUM_V1_FEATURES.md`).

## Prerequisites (on your laptop)
- Node.js 20 or newer (`node -v`), npm, Git.
- A free Supabase account (https://supabase.com) with one **development** project.
- For the database tests only: PostgreSQL 14+ command-line tools (`initdb`, `pg_ctl`, `psql`). Optional; they test the SQL on a throwaway local database.

## First-time setup
```bash
cd premium
npm install                 # creates package-lock.json: commit it
cp .env.example .env.local  # then fill in the 3 values from Supabase > Project Settings > API
```
Apply the database migration: open Supabase > SQL Editor, paste `premium/supabase/migrations/0001_foundation.sql`, run.
(Do this on the development project only. Never run migrations on production without a reviewed backup.)

In Supabase > Authentication > URL Configuration set **Site URL** to `http://localhost:3000` and add
`http://localhost:3000/auth/confirm` to Redirect URLs. In Authentication > Email Templates, set the link in the
*Confirm signup* and *Reset password* templates to:
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app`  (for reset: `type=recovery&next=/reset-password`).

## Run it
```bash
npm run dev                  # http://localhost:3000
```

## Run the tests
```bash
cd premium
npm run test:free   # the 137 Free calculation checks
npm test            # Premium unit tests (entitlements, validation, env, engine parity, security config, exports, advanced calculators and estimators)
npm run test:db     # migration + row-level-security tests on a throwaway local Postgres
npm run typecheck   # TypeScript
npm run build       # production build
```
Export samples can be opened in real software: `npx tsx scripts/gen-sample-exports.ts out && python3 scripts/verify_exports.py out` (needs LibreOffice, qpdf, poppler, openpyxl).

The Free browser suite (117 checks) needs Python + Playwright: `cd free && python3 ui_test.py`.

## How sign-in and plans work (short version)
Supabase Auth handles passwords and sessions. Every user gets a `free` row in `entitlements` when they sign up. Only
trusted server code can change that row; the browser can only read it. Pages call `resolveEntitlement()` on the
server to decide Premium access. See `SECURITY.md`.

## Troubleshooting
- *"Invalid environment configuration"*: a value in `.env.local` is missing or still the placeholder. The message names the variable, never its value.
- *Confirmation or reset link says "invalid or expired"*: check the email-template and Redirect URL settings above.
- *`npm run test:db` says "cannot be run as root"*: run it as a normal user.
- *Engine copy differs*: run `npm run sync-engine`.

More: `DEPLOYMENT.md`, `SECURITY.md`, `docs/SCHEMA.md`, `docs/API_ROUTES.md`, `docs/MIGRATIONS.md`, `docs/KNOWN_LIMITATIONS.md`.

## Where the calculation maths lives
- `free/calc-engine.js`: the Free engine, shared byte-for-byte with Premium for the 11 uncapped calculators (never edited in Premium).
- `premium/src/lib/calc/premium-engine.ts`: pure functions (no UI, database, network) for the 5 advanced calculators and 3 estimators. Every figure is typed by the user.
- `premium/src/lib/calc/{advanced,estimators,adapters,kit}.ts`: field definitions, form cleaning and on-screen formatting.
To add a calculator: write the maths in `premium-engine.ts`, add an adapter, add a sample in `tests/samples.ts`, and add hand-calculated tests.
