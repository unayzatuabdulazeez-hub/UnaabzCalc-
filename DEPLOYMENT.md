# Deployment and costs

## Accounts you must own
GitHub (code), Supabase (database + auth), hosting account (Vercel or alternative), Paystack (payments), Google AdSense (ads), domain registrar (later). All in your name.

## Environments
Local (laptop + a Supabase *development* project + Paystack *test* keys) -> Staging (optional second Supabase project + preview deploy) -> Production (separate project, live keys). Never share keys across environments.

## Current decision: nothing paid yet
No domain bought, no paid hosting enabled. Build and test locally on free tiers.

## Premium price (decided)
Launch price: **NGN 4,999 per month**, no trial at launch. It lives in the `app_settings` table (499900 kobo, Paystack's unit), not in code,
and changes only through the audited admin function `admin_set_premium_price()` (valid range NGN 100 to NGN 1,000,000). When Paystack is
connected (Phase 7), the Paystack plan amount must be set to match. A Business/Pro split is planned for V2 and is not built.
At NGN 4,999, roughly NGN 4,750 per subscriber remains after Paystack's fee (about 1.5% + NGN 100; **verify**). Covering about NGN 68,000
per month of hosting and database (about US$45 at about NGN 1,500 per dollar; **both figures unverified**) needs about 15 paying subscribers.

## Expected costs before production (**not verified**)
I could not open the official pricing pages in this session, so the figures below are from general knowledge and **must be re-checked** before you pay anything.
| Service | Why it may cost | Rough figure (verify) | Matters |
|---|---|---|---|
| Vercel | Hobby (free) plans are for **personal, non-commercial** use. A paid subscription product should use a paid plan or another host. | Pro about US$20 per month per member | Read Vercel's current terms |
| Supabase | Free tier fine for development. Production should use Pro for backups, no inactivity pausing, and higher limits. | Pro about US$25 per month | Free projects can pause when inactive |
| Domain | Needed for a professional URL, AdSense approval and Paystack live. | about US$10 to 20 per year | Buy only when ready |
| Paystack | Percentage fee per successful payment, no monthly fee. | See Paystack's published pricing | Test mode is free |
| AdSense | Free; pays you. Needs approval, privacy/terms pages and a real domain. | none | |
Lower-cost alternative: keep Supabase free and host Premium on a host whose free tier permits commercial use, **after reading its terms**; trade-off is less reliability/backups. A person should decide this once real usage is known.

## Free site and Premium site routing (open decision)
Option A (recommended): keep the Free app as its own deployment, link to it from Premium. Zero risk to Free. Option B: serve Free under `/free` inside the Premium project later via a rewrite, only after a reviewed migration and rollback plan.

## Deploy steps (when approved)
1. Push repo to your GitHub. 2. Import in the host, set **Root Directory = `premium`**. 3. Add env vars (`.env.example` names) per environment. 4. Apply migrations to the target Supabase project after a backup. 5. Set Supabase Site URL and Redirect URLs to the real domain. 6. Run the production verification checklist below.

## Rollback
Hosting: redeploy the previous successful deployment. Database: restore the pre-migration backup (write a down-migration for every migration that is not purely additive). Free app: untouched; restore from baseline tag/zip if needed.

## Production verification checklist (all must be ticked; none are yet)
- [ ] Env vars set; no test keys or secrets exposed  - [ ] Migrations applied after backup  - [ ] Sign-up, login, reset work on the live URL
- [ ] RLS enabled and re-tested on the live project  - [ ] Paystack TEST run completed (docs/PAYMENTS.md) before live keys; live webhook URL set; duplicates ignored; plan amount equals the price setting
- [ ] Entitlements change only on the server  - [ ] Errors/logs/monitoring in place  - [ ] Mobile + desktop layouts checked
- [ ] Privacy and terms pages live  - [ ] AdSense publisher id real and ads hidden for Premium
A successful build alone does not prove any of this.
