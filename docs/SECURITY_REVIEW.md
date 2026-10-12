# Security review (Phase 9, 2026-10-12)

**What this is:** a systematic review plus automated checks. **What it is not:** an independent penetration test, and nothing has been run against a real Supabase, Paystack or hosting account. A human reviewer should still read the code paths below before launch.

## How to re-run the automated checks
- `npm test` includes `tests/security-audit.test.ts` (15 source-code checks) and `tests/security-config.test.ts`.
- `npm run test:db` includes `supabase/tests/80_security_audit.sql` (25 checks of the database permissions). **Run it against the live Supabase project too:** paste the file into the SQL Editor of a *copy* of production, or run it in a staging project built from the same migrations.
Each of these was proven to catch deliberate mistakes (12 database breakages and 10 code breakages were each caught).

## What was checked
| Area | Result |
|---|---|
| Row-level security on every table; no views; no sequence access | Enforced by test 80 |
| Anonymous visitors | Can read only the public price setting; can execute no function |
| Who can write entitlements, payments, webhook log, audit log, admin list, price | Nobody through the API; only audited database functions or the service role |
| Database functions | All `security definer` functions pin `search_path`; the exact list callable by signed-in users is fixed in test 80, so a new one must be added deliberately |
| Admin functions | Each re-checks `is_admin()`, anonymous cannot call them, page sizes capped, search escaped, filters whitelisted, reason required, every change audit-logged |
| Admins and private data | No policy gives admins access to businesses, customers, jobs, products or saved calculations (tested) |
| Every page, route and Server Action under `/app` | Checks who is calling in the file itself (tested), not only in the middleware |
| Payments | Signature check on the raw body (timing-safe), body size capped while reading, event de-duplication, amount/currency/plan taken from Paystack's verify answer, Paystack plan must equal the displayed price, checkout limited to 5 unfinished attempts per hour per account |
| Secrets | Paystack secret and service-role key are read only by a fixed list of server files (tested); only 3 `NEXT_PUBLIC_` variables exist; secrets are never logged (tested) |
| Injection | No `dangerouslySetInnerHTML`, `eval` or `innerHTML` anywhere (tested); Excel text is written as plain text, never formulas; PDF text is escaped |
| Redirects | Sign-in `?next=` goes through `safeNext`; Paystack redirect target must be https on paystack.com (tested) |
| Headers | Strict CSP, `frame-ancestors none`, nosniff, HSTS, referrer and permissions policies; downloads `no-store` |
| Dependencies | Six runtime packages (Next, React, React DOM, Supabase x2, server-only), pinned by test; **`npm audit` has not been run** (npm is blocked in the build sandbox) |

## Fixed during this review
- A job-form `<label>` was not linked to its drop-downs (accessibility); fixed.
- The webhook trusted the `Content-Length` header for its size limit; it now stops reading at the limit regardless of headers.
- A single account could create unlimited unpaid checkouts (and Paystack calls); migration `0007` limits it to 5 per hour.

## Residual risks and what to do about each
1. **Script policy allows `'unsafe-inline'`.** Next.js needs it unless you add per-request nonces. Medium effort; recommended before wide launch.
2. **No rate limiting in the app** beyond Supabase Auth's own limits and the checkout cap. Turn on Supabase CAPTCHA protection, and consider Vercel's firewall rules.
3. **`npm audit` and a lockfile are missing.** Run `npm install`, commit `package-lock.json`, run `npm audit`, and enable GitHub Dependabot.
4. **Paystack IP allow-list is not enforced** (the signature is the check). Acceptable; documented.
5. **Admin accounts have no extra sign-in protection** in the app. Turn on two-step sign-in for the owner's GitHub, Supabase, Vercel and Paystack accounts; keep the admin list to one or two people.
6. **Refund handling and admin changes are manual.** Every admin action is audit-logged, but nobody is alerted. Review `/app/admin` weekly.
7. **Nothing has run against real services.** The riskiest untested pieces are the Paystack renewal payload (see `docs/PAYMENTS.md`) and the browser behaviour of Server Actions.
8. **Backups:** free Supabase has none you can download. Use Pro before launch.
9. **No security headers test against the live site.** After deploying, check the site at securityheaders.com or similar.

## Reviewer checklist (for the human developer)
Read, in this order: `supabase/migrations/0001..0007` and `supabase/tests/80_security_audit.sql`; `src/lib/server/{admin,context}.ts`; `src/lib/payments/{settle,verify,signature}.ts` and `src/app/api/paystack/webhook/route.ts`; `src/app/app/billing/actions.ts`; `src/app/app/admin/actions.ts`; `next.config.mjs`; `src/middleware.ts`. Then confirm: no table lacks RLS, no secret in the repo history, no route skips `GATE`.
