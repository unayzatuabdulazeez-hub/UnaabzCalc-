# Deployment, costs and go-live checklist

**Status: nothing is deployed and nothing is paid for.** Do these steps in order, on **development** projects first. Never skip the test-mode payment run.

## 1. Accounts you must own (all in your name)
GitHub (code, done), Supabase (database and sign-in), Vercel or another host (the app), Paystack (payments), Google AdSense (ads, optional), a domain registrar (later).

## 2. What it costs (checked 2026-10-12 against the providers' own pages; prices change, so re-check before you pay)
| Service | Plan | Price | Why it matters |
|---|---|---|---|
| Supabase | Free | $0 | Fine for building. **Projects are paused after 1 week of inactivity**, 500 MB database, 2 projects. Not for a paid product. |
| Supabase | Pro | from **$25/month** | 7 days of daily backups, no pausing. Use this for production. |
| Vercel | Hobby | $0 | **Personal, non-commercial use only** (Vercel's own wording). Do not run a paid subscription product on it. |
| Vercel | Pro | **$20 per developer seat/month** (plus usage) | The right plan for production. |
| Paystack | Per payment | **1.5% + ₦100** per local transaction (₦100 waived under ₦2,500; fee capped at ₦2,000) | At ₦4,999 you receive about **₦4,824** per payment. No monthly fee. Test mode is free. |
| Domain | per year | about $10 to 20 (not checked) | Needed for AdSense, live Paystack and a professional address. Buy only when ready. |
| AdSense | free | none | Needs approval, a real domain, privacy and terms pages. |
**Rough break-even:** Supabase Pro + one Vercel seat is about $45/month, about ₦67,500 at ₦1,500 per dollar (**check today's rate**). At about ₦4,824 net per subscriber that is roughly **14 paying subscribers** to cover hosting.
Until you have paying customers you can build and test entirely on the free tiers.

## 3. Environments
Local (your laptop + a Supabase **development** project + Paystack **test** keys), then production (a separate Supabase project, live keys, a real domain). **Never reuse keys between environments.**

## 4. Set-up, step by step (development first)
1. **Supabase:** create a project. Copy Project URL, `anon` key and `service_role` key (Project Settings, API). The `service_role` key is a secret: it goes only in `.env.local` and the host's secret settings, never in code or chat.
2. **Database:** in Supabase's SQL Editor run the files in `premium/supabase/migrations/` **in order, one at a time** (`0001` to `0007`). On production, take a backup first.
3. **First admin:** after you register in the app, run the one-line statement in `docs/SCHEMA.md` ("Making yourself the first admin").
4. **Sign-in e-mails:** in Supabase, Authentication, URL Configuration: set Site URL and add `<your-url>/auth/confirm` to Redirect URLs; paste the e-mail template links from `README.md`. Turn on **CAPTCHA protection** for sign-up and password reset (Authentication, Attack Protection).
5. **Paystack (test mode):** follow `docs/PAYMENTS.md` (plan, webhook URL, keys). Set `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_CODE`.
6. **Run locally:** `cd premium && npm install && npm run dev`. Commit the `package-lock.json` that `npm install` creates (none exists yet because the build sandbox could not run npm).
7. **Run every test** (`npm run test:all`) and **click through the app yourself** using the checklist in `docs/HANDOVER.md`.
8. **Host:** import the GitHub repo into Vercel, set **Root Directory = `premium`**, add the same environment variables there, deploy a **preview**, and repeat the click-through on the preview URL. Paystack's webhook needs this public URL.

## 5. Going live (only after all of section 4 passes)
Production Supabase project (Pro plan), migrations applied after a backup, live Paystack keys and a new live plan whose amount equals the price setting, real domain, Supabase Site URL updated, Paystack live webhook URL set, privacy and terms pages published. Then tick every box below.

## 6. Where the Free app lives
The live Free app is on AppDeploy (see `docs/FREE_APP_VERIFICATION.md`); GitHub `main` holds an older copy. Keep Free as its own deployment and link to it from Premium. Do not overwrite it. Decide later whether to move it.

## 7. Rollback
Hosting: redeploy the previous good deployment in Vercel. Database: restore the pre-migration backup (Supabase Pro keeps 7 days). Payments: switch back to test keys or remove `PAYSTACK_PLAN_CODE` and payments turn off. Free app: untouched.

## 8. Go-live checklist (none ticked yet)
- [ ] `npm run test:all` passes on the exact commit being deployed
- [ ] A person other than the author has read `docs/SECURITY_REVIEW.md` and the code paths it lists
- [ ] `package-lock.json` committed; `npm audit` reviewed
- [ ] Test-mode payment run completed (pay, renew, cancel, duplicate webhook, wrong amount) and **the renewal payload question in `docs/PAYMENTS.md` answered**
- [ ] Live keys only in the host's secret settings; none in the repo (`git log -p | grep sk_live` finds nothing)
- [ ] Sign-up, e-mail confirmation and password reset work on the live URL
- [ ] RLS audit (`80_security_audit.sql`) run against the live project and passes
- [ ] First admin added; a normal account gets a 404 on `/app/admin`
- [ ] Phone, tablet and laptop click-through done on the real site (see `docs/RESPONSIVE_TESTS.md`)
- [ ] Privacy and terms pages live; AdSense approved and ids set (or ads left off)
- [ ] Backups confirmed (Supabase Pro) and a restore tried once
- [ ] Someone watches `/app/admin/webhooks` for problems after launch (see `docs/OPERATIONS.md`)
A successful build alone proves none of this.
