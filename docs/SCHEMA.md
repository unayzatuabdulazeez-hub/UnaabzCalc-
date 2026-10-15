# Database schema (migration 0001)

```
auth.users (Supabase)  1 ── 1  profiles          id = auth.users.id; email, full_name, phone
                       1 ── 1  entitlements      user_id; status, trial_*, subscription_*, payment_status, cancellation_status, paystack_*, granted_by, grant_reason
                       1 ── *  businesses        owner_id; name, business_type, phone, address, currency (default NGN), archived_at
                       1 ── 0..1 admin_users     user_id; role (owner|admin)
                       audit_log                 actor_id (plain uuid, no FK), action, target_table, target_id, details jsonb, created_at  (append-only)
```
**Ownership rule for every future table:** carry `business_id` (and `user_id`) and use an RLS policy that allows a row only when
the business belongs to `auth.uid()`. Business rows are never visible to admins.

**Who can do what**
| Table | Signed-in user | Admin | Trusted server (service role) |
|---|---|---|---|
| profiles | read own; edit own name/phone | read all | all |
| entitlements | read own | read all; change only via `admin_grant_complimentary` / `admin_revoke_complimentary` | all |
| businesses | read/create/edit(archive) own; no delete | none | all |
| admin_users | read own row | read own row | all |
| audit_log | none | read | all (but rows cannot be edited or deleted) |

Entitlement statuses: free, trial, premium, founding_member, complimentary, expired, cancelled. The *effective* status is computed
by `src/lib/entitlements/resolve.ts` (e.g. a `premium` row past its end date is treated as expired even before a webhook arrives).

**Making yourself the first admin (owner action, once):** in Supabase SQL Editor run
`insert into public.admin_users (user_id, role) select id, 'owner' from auth.users where email = 'YOU@EXAMPLE.COM';`
Nobody can do this through the app or API.

## Phase 2 additions (migrations 0002 and 0003)
```
businesses 1 -- * customers   business_id + user_id, name, phone, email, address, notes, archived_at
businesses 1 -- * products    business_id + user_id, name, unit, cost_price, selling_price (numeric 14,2), notes, archived_at
businesses 1 -- * jobs        business_id + user_id, customer_id (optional), title, description, status (quote|in_progress|completed|cancelled), due_date, agreed_amount, archived_at
app_settings                  key = 'premium_price' -> {amount_kobo: 499900, currency: NGN, interval: monthly}; readable by everyone, changed only by admin_set_premium_price()
```
**Rules every business-owned table follows**
- `(business_id, user_id)` is a composite foreign key to `businesses (id, owner_id)`, so a row can never point at another user's business, even when written by trusted server code.
- `jobs.customer_id` is checked together with `business_id`, so a job can never reference a customer from a different business.
- `business_id` and `user_id` are not in the UPDATE grant, so a record cannot be moved to another business, not even between two businesses of the same owner.
- **Reading** is always allowed for the owner (a lapsed subscriber still sees and can export their data). **Writing** needs an active Premium plan, enforced in the database by `public.has_premium()`.
- No DELETE: records are archived. Admins have no access to these tables.

**Premium rules in two languages.** `public.has_premium()` (SQL) and `src/lib/entitlements/resolve.ts` (TypeScript) implement the same rules. `npm run gen:parity` generates `20_has_premium_parity.sql`, which compares them on 686 status/date combinations; a unit test fails if the committed file is stale.

## Phase 3 addition (migration 0004)
```
businesses 1 -- * saved_calculations   business_id + user_id, calculator_id, title, inputs (jsonb), engine_version, notes,
                                       customer_id / job_id / product_id (each optional, each must be in the SAME business), archived_at
```
- **Only the inputs are stored, never the result.** The result is recomputed by the shared engine whenever a record is opened, so a stored result cannot be fabricated or drift. `engine_version` (a hash of `free/calc-engine.js`) records which engine saved it; the page tells the user if the engine changed since.
- `calculator_id` and `business_id` cannot change after insert. To change type, duplicate.
- Reading: owner always. Insert and update: active Premium (checked in the database). **Delete: the owner always, even on a lapsed plan** (removing your own data is never paywalled).
- Deleting a linked customer, job or product clears only that link.

## Calculator ids stored in `saved_calculations.calculator_id` (Phase 5)
- 11 Free-parity calculators (shared Free engine): basic, percentage, profit, discount, retail-pricing, target-profit, business-expenses, multiple-products, loan, loan-repayment, handwork-pricing.
- 5 advanced (Premium engine, `src/lib/calc/premium-engine.ts`): advanced-import, advanced-retail-pricing, advanced-poultry, advanced-fish, advanced-handwork.
- 3 estimators (Premium engine): general-estimate, electrical-estimator, building-estimator.
No migration was needed: the column accepts any lowercase-hyphen id, and the application only accepts ids in its registry. Only inputs are stored (max 18,000 bytes of JSON, enforced in the app; 30,000-byte jsonb cap in the database).

## Payments (Phase 7, migration 0005)
- `payments`: one row per checkout or renewal (`reference` unique, `paystack_tx_id` unique, `expected_amount_kobo`, `amount_kobo`, `currency`, `status` pending | success | mismatch, `note`). `user_id` is a plain uuid so payment history survives account deletion. Users can read their own rows; nobody can write them except through the service-role functions.
- `webhook_events`: SHA-256 of each webhook body, event name, outcome. No policies: service role only.
- Functions (service role only, security definer): `create_checkout_payment`, `apply_paystack_charge`, `apply_paystack_subscription_event`, `claim_webhook_event`, `finish_webhook_event`. Period end = base + one calendar month (UTC), base = the current end date if still paid up, else the payment date.

## Admin (Phase 8, migration 0006)
- `premium_active_for(uuid)`: the single definition of "has Premium right now". `has_premium()` (used by every policy) now calls it for the signed-in user, and the admin screens call it for each listed person, so they cannot disagree. Not callable by users.
- Read functions, each re-checking `is_admin()` and raising 42501 for anyone else (anonymous visitors cannot execute them at all): `admin_list_users`, `admin_user_detail` (audit-logged), `admin_list_payments`, `admin_list_webhooks`, `admin_stats`. Page size is capped at 100, filters are checked against fixed lists, search text has `%`, `_` and `\` escaped.
- `admin_end_paid_access(target, reason)`: ends paid, cancelled or trial access after a refund done in Paystack; marks the payment status `refunded`; never touches founding members or complimentary access; audit-logged.
- Admins can see accounts, plans, payments and webhook results. They cannot see businesses, customers, jobs, products or saved calculations.
- Revenue figures are verified successful NGN payments only. Paystack fees are not deducted and refunds are not subtracted.

## Checkout limit (Phase 9, migration 0007)
`create_checkout_payment` now refuses a sixth pending checkout by the same person within an hour ("too many unfinished"); the app shows `checkout_busy`.
