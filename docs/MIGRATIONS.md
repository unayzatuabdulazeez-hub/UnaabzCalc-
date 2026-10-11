# Migration record
| File | Contents | Tested on | Applied to a real Supabase project |
|---|---|---|---|
| `0001_foundation.sql` | profiles, entitlements, businesses, admin_users, audit_log, RLS, admin grant/revoke functions, new-user trigger | throwaway local Postgres 16 + Supabase stand-in | not yet |
| `0002_customers_jobs_settings.sql` | `has_premium()` (SQL twin of the TypeScript rules), customers, jobs, `app_settings` (launch price NGN 4,999 per month = 499900 kobo), `admin_set_premium_price()` | same | not yet |
| `0003_products.sql` | products (same rules as customers and jobs) | same | not yet |
| `0004_saved_calculations.sql` | saved_calculations (inputs only, engine version, optional links to a customer, job and product in the same business) | same | not yet |
| `0005_payments.sql` | payments (own-read), webhook_events, and service-role-only functions to record a checkout, apply a verified charge, apply subscription events, de-duplicate webhooks | same | not yet |
| `0006_admin.sql` | admin read functions (users, payments, webhooks, statistics), end paid access after a refund, one shared Premium check used by policies and admin screens | same | not yet |

Rules: one new numbered file per change; never edit an applied migration; take a backup before touching production
(free Supabase projects have no downloadable automatic backups, so export with `pg_dump` first). Requires PostgreSQL 15+.
