# Payments (Paystack), ads (AdSense) and Premium promotion: Phase 7

**Status: built and tested with fake Paystack and a real Postgres. NOT yet tried against a real Paystack account or a real Supabase project.** Do the test-mode run below before anything else.

## How a payment works
1. Signed-in Free user opens **/app/upgrade** and presses *Pay with Paystack*.
2. The server reads the price from `app_settings`, fetches your Paystack plan, and **refuses** if the plan's amount, currency or interval differs from that price (so nobody is charged a different amount from the one shown).
3. It records a *pending* payment (reference `UC-…`, expected amount) and sends the customer to Paystack's checkout page.
4. Paystack redirects back to **/billing/callback**; the app asks Paystack to verify the payment and grants Premium. Paystack also calls **/api/paystack/webhook**, which does the same check. Whichever arrives first wins; the other is a harmless duplicate.
5. Premium lasts one calendar month from the payment (extended from the current end date if still paid up). Paystack's automatic monthly renewal sends `charge.success` again, which extends it.

What the app trusts: only Paystack's own **verify** answer (amount, currency, plan, status). The webhook body is used only to learn *which* reference to check, and only after its HMAC-SHA512 signature (`x-paystack-signature`) is verified against the raw body with your secret key.

## What can never happen
- Browser or URL values cannot grant Premium. Entitlements are written only by database functions callable only by the service role.
- The same payment cannot grant twice (unique reference and transaction id, advisory lock, de-duplicated webhook bodies).
- A payment with the wrong amount, wrong currency (not NGN) or a different plan grants nothing and is recorded as `mismatch`.
- A renewal for an unknown customer grants nothing (`unmatched`).
- Founding members and complimentary users are never downgraded by a payment event; a failed or cancelled subscription only ends access at `subscription_end`.

## Set-up in TEST mode (do this first; no real money)
1. Paystack dashboard: switch to **Test mode**. Settings > API Keys: copy the **test secret key** (`sk_test_…`).
2. Products > Plans > Create plan: **Monthly**, amount **exactly the Premium price** (₦4,999 at launch), currency NGN. Copy the plan code (`PLN_…`).
3. Settings > API Keys & Webhooks: set **Test Webhook URL** to `https://<your-app>/api/paystack/webhook`. (Paystack cannot reach `localhost`; use a Vercel preview URL or a tunnel for a local run.)
4. Supabase: apply migration `0005_payments.sql` (after a backup). Copy the **service_role** key.
5. Set in `.env.local` / Vercel: `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_CODE`. If either Paystack value is missing, payments stay OFF and the page says so.
6. Pay with a Paystack **test card**. Check: Premium appears; /app/billing lists the payment; paying again does not double-extend; the Paystack dashboard shows the webhook delivered with status 200.
7. **Confirm and tell me:** that the renewal `charge.success` payload (Paystack's test-mode "next payment") carries `plan.plan_code`. The code rejects a non-`UC-` charge that has no plan. If Paystack omits it, that rule needs a small change.
8. Optional plumbing check: `PAYSTACK_SECRET_KEY=sk_test_… npx tsx scripts/simulate-webhook.ts http://localhost:3000/api/paystack/webhook subscription.not_renew` and again with `--bad-signature` (must return 401).

## Changing the price
The price is the `premium_price` setting, but a Paystack plan's amount cannot be reliably edited for existing subscribers. To change it: create a new plan at the new amount, update `PAYSTACK_PLAN_CODE`, update the price setting with the admin function, redeploy. Existing subscribers stay on the old plan until they re-subscribe. Until both match, checkout is refused (by design).

## Refunds, disputes, cancelling
Refunds are done in the Paystack dashboard and are **not** automatic in the app: afterwards, an admin ends access manually. Users cancel through *Manage or cancel subscription* (Paystack's own page). `subscription.not_renew` marks it "will not renew"; `subscription.disable` marks it cancelled; access continues to the paid-until date.

## Ads
Off unless **both** `ADSENSE_PUBLISHER_ID` (a real `ca-pub-…`) and `ADSENSE_SLOT_ID` are set. Shown only to non-Premium users, only on read-only pages (business home, analysis, records). Never on forms, billing, checkout, exports or Free-calculator pages. The Content-Security-Policy allows Google ad domains **only** when a publisher id is set. AdSense needs your real domain, approval and privacy/terms pages (not built yet).

## Not covered
Paystack's IP list is documented but not enforced (the signature is the check). No automatic reminder e-mails. No invoices/receipts beyond Paystack's own e-mails. Annual plan, coupons, and a Business/Pro split are V2.
