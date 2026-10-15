# Handover guide (owner and reviewing developer)

Written for the owner, who is not a developer. A developer only needs to review, not build.

## 1. What exists
- `free/` — the frozen Free app (14 calculators). Not changed by Premium work. See `FREE_APP_VERIFICATION.md`.
- `premium/` — UnaabzCalc Premium V1 (Next.js, TypeScript, Supabase). Built in 9 phases; see `PREMIUM_V1_FEATURES.md` for what is **tested** and what is only **built**.
- Nothing is deployed, no domain is bought, no paid hosting is active, no real money has moved.

## 2. What has and has not been proven
Proven here: calculation maths, plan/entitlement rules, database security (RLS) rules, payment-recording logic, admin database functions, exports, page rendering at six widths (static render).
**Not** proven here: `next build`, real Supabase, real Paystack, real AdSense, clicking through in a real browser/phone, `npm audit` (no lockfile yet). These are the first things to do (section 5).

## 3. Everyday tasks (owner)
- **Run tests:** in `premium/`: `npm run test:all` (needs Node 20+ and `npm install`). Database suites: `bash supabase/tests/run_rls_tests.sh` (needs PostgreSQL 15+, run as a non-root user).
- **Deploy:** follow `DEPLOYMENT.md` step by step. Start with Supabase free tier + Paystack **test** keys + Vercel free tier. Do not go live until the go-live checklist there is ticked.
- **Change the price:** create a new monthly plan in Paystack for the new amount, put its code in `PAYSTACK_PLAN_CODE`, and update `app_settings` price (kobo, so ₦4,999 = 499900). The code refuses to take payment if the plan and the displayed price differ. Existing subscribers stay on their old plan until you move them in Paystack.
- **Make someone an admin:** SQL statement in `SCHEMA.md` ("Making yourself the first admin"). There is no screen for this yet.
- **Give or end access:** `/app/admin/users/<id>`; a written reason is required and is logged.
- **Refunds:** refund in the Paystack dashboard, then use "End paid access" on the user's admin page with the reason. See `OPERATIONS.md`.
- **Support:** an admin can see account, plan and payments, never business records. Ask the user to describe their issue.

## 4. Developer review checklist
- [ ] Read `SECURITY.md` and `SECURITY_REVIEW.md`; run `npm audit` after generating `package-lock.json`.
- [ ] `npm run build` passes; fix any type or lint errors that only a real build shows.
- [ ] Apply migrations 0001–0007 in order on a fresh Supabase project; run `supabase/tests`.
- [ ] Confirm the service-role key is only used in `src/lib/supabase/admin.ts` and payment code (test `security-config` enforces this).
- [ ] Confirm CSP in `next.config.mjs`; consider removing `unsafe-inline` with nonces (KNOWN_LIMITATIONS).
- [ ] Paystack test mode: pay, renew (see the open question in `PAYMENTS.md`: does the renewal `charge.success` carry `plan.plan_code`?), cancel, refund, replay a webhook.
- [ ] Add privacy policy and terms pages before taking real payments (missing).

## 5. Real click-through checklist (phone and laptop)
Do this in test mode, once on a phone (Chrome/Android and Safari/iPhone if possible) and once on a laptop:
- [ ] Register, confirm e-mail, log in, log out, reset password.
- [ ] Free user: calculate, save a calculation, see Premium-only items blocked politely, delete a saved calculation.
- [ ] Upgrade with a Paystack test card; plan banner changes; billing page shows the payment.
- [ ] Premium: customers, jobs, products, dashboard, exports (xlsx, PDF, print, share).
- [ ] Admin account: users, payments, webhooks, statistics; a normal account gets a 404 on `/app/admin`.
- [ ] Nothing overflows sideways at 360px width; buttons are easy to tap.
- [ ] Anything wrong: write it down with a screenshot and the page address.

## 6. Costs
See `DEPLOYMENT.md` (verified at the time of writing; prices change). Free tiers cover testing. Paystack charges a percentage per successful payment only.
