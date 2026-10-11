# Premium V1 requirement checklist

Statuses: **Not started**, **In progress**, **Implemented**, **Tested**, **Blocked**. "Tested" means automated tests that were actually run and passed; the evidence is named.
*Note:* this list was built from the master prompt as I received it plus the six follow-up sections. Please compare it against your original prompt and tell me about anything missing.

## Phase 1: foundation (this delivery)
| Requirement | Status | Evidence / gap |
|---|---|---|
| Keep Free app unchanged, recoverable, 14 calculators, limits, Handwork, poultry 100 | **Tested** | `free/` identical to original except `ui_test.py` now uses a relative path. 137/137 calc checks, 117/117 browser checks. Baseline zip delivered. |
| Single shared calculation engine, no rewrite | **Tested** | `engine.test.ts`: byte-identical copy, 14 calculators, parity with Free |
| Repository / branch / commit confirmed and synchronised with GitHub | **Blocked** | GitHub not connected to this session. Owner action needed (see report). Nothing has been pushed. |
| Next.js + TypeScript + Supabase project structure | **In progress** | Code written; `npm install`/`build` not yet run (packages could not be downloaded here) |
| Accounts: register, login, logout, password reset | **In progress** | Code written, not run against Supabase. Validation **Tested** (unit). |
| Secure sessions, protected routes | **In progress** | Middleware + server-side `getUser()` checks written, not run |
| Business profile + multiple businesses per user | **In progress** | Create/list in dashboard written (not run). Database rules **Tested** (53 checks) |
| User/business data isolation (RLS), IDOR resistance | **Tested** | 53 DB checks incl. cross-user read/update/insert attempts; 4 deliberate weakenings were all caught |
| Entitlement model (7 statuses, trial/subscription dates, payment/cancellation status) | **Tested** | Schema + `resolveEntitlement` unit tests (22). Users cannot write entitlements (DB test). |
| No 3-day trial at launch, ability preserved | **Tested** | New users start `free`, no trial dates; `TRIAL_OFFERS_ENABLED=false`; trial logic tested |
| Premium never granted from browser state | **Tested (design)** | No client input reaches the resolver; DB blocks writes. End-to-end attempt test needs the running app. |
| Premium price NGN 4,999 per month, configurable, no trial at launch | **Tested (database)** | `app_settings` + `admin_set_premium_price` (range check, reason, audit row) tested in `30_customers_jobs_tests.sql`. The Paystack plan must be matched in Phase 7. |
| Admin foundation: owner-only, server-enforced, audit log, grant/revoke complimentary | **Tested (database layer)** | Admin screens, user search, statistics, webhook view: **Not started** |
| Security headers, env validation, `.env.example`, `.gitignore` | **Tested** | `security-config.test.ts`, `env.test.ts` |
| README, SECURITY, DEPLOYMENT, schema, routes, migrations, limitations docs | **In progress** | Drafts delivered; completed per phase |
| Hosting/cost explanation | **In progress** | See DEPLOYMENT.md; prices **not verified** from official pages |

## Later phases (all still required; none started)
| Phase | Requirement | Status |
|---|---|---|
| 2 | Customers, jobs, products: database rules (Premium-gated writes, isolation, same-business links, archive only) | **Tested** | 139 checks + 686-case SQL/TypeScript parity; 9 deliberate weakenings caught |
| 2 | Customers, jobs, products: validation (names, phone, email, money, dates, statuses) | **Tested** | `records.test.ts` |
| 2 | Customers, jobs, products: screens (list, search, add, edit, archive/restore, status, customer link) | **Implemented, not run** | Syntax-checked only; needs `npm run build` and a real Supabase project |
| 2 | Estimate and project associations | **Tested** (Phase 5) | Estimates are saved calculations; each can be linked to a customer, a job (the project record) and a product, in the same business only (database-enforced, 37 checks) |
| 3 | Saved calculations: database (inputs only, same-business links, Premium writes, owner delete) | **Tested** | 37 + 3 checks; 8 deliberate weakenings caught |
| 3 | Saved calculations: input definitions, cleaning, engine adapters for 11 calculators | **Tested** | `adapters.test.ts`, `prepare.test.ts`, `calc-meta.test.ts` incl. parity with the Free engine |
| 3 | Saved calculations: screens (new, save, reopen, recalculate, edit, duplicate, search, filter, archive/restore, delete) | **Implemented, not run** | Syntax-checked only; needs `npm run build` and a real Supabase project |
| 3 | Import, Poultry, Fish saved calculations | **Done in Phase 5** | Replaced by the advanced versions (no Free caps) |
| 4 | Exports: real `.xlsx`, PDF, print, share; Calculate by POST | Built; 20 export tests pass; all 22 sample files open in openpyxl, LibreOffice, qpdf and pdftotext. Pages are syntax-checked only (no browser test) |
| 5 | General Estimate; Electrical Estimator; Building & Project Estimator (user-entered quantities/rates only) | **Tested** (engine, exports); screens syntax-checked only | Hand-calculated expected values; payment milestones add up to the total to the kobo; no built-in prices, taxes or standards |
| 5 | Advanced Import and Retail Pricing; Advanced Poultry, Fish, Handwork | **Tested** (engine, exports); screens syntax-checked only | No size limits; what-if scenarios for poultry and fish; layers as well as broilers; Premium-only to preview and save |
| 6 | Dashboard, records search, records export, business analysis (formulas in `docs/ANALYSIS_FORMULAS.md`) | **Tested** (analysis maths, workbooks; 7 deliberate breakages caught); screens syntax-checked only | Built only on entered data: no revenue, cash or profit figures (no payments record) |
| 7 | Paystack subscriptions: verify server-side, signed idempotent webhooks, configurable price, test mode | **Logic tested** (78 DB checks, 15 deliberate breakages caught; 36 unit tests); pages syntax-checked only; no real Paystack run yet | See `docs/PAYMENTS.md`. Off until keys are set |
| 7 | AdSense (off when no real publisher id; never for Premium) and Premium promotion | Rule tested; ad slot and CSP additions untested with real ads | Pricing page, upgrade page, billing page and plan banner link are in place |
| 8 | Admin screens: users, subscriptions, statistics, search/filter, webhook status, grant or end access with a reason | **Database and logic tested** (93 database checks, 25 deliberate breakages caught; 10 unit tests); pages syntax-checked only | Admins see accounts, plans and payments only, never business records |
| 9 | Security review, full responsive test (360/412/768/1024/1280/1920), deployment readiness, handover | Not started |
| All | V2 compatibility (modular, centralised entitlements, shared exports) without building V2 | In progress (structure only) |
