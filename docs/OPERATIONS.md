# Operations runbook

## Weekly (10 minutes)
1. `/app/admin` statistics: new users, paying users, revenue by month. Does anything look odd?
2. `/app/admin/webhooks`: any events not processed or failed? See "Webhook problems".
3. `/app/admin/payments`: any payment that is not matched to an account or looks wrong?
4. Supabase and Vercel dashboards: usage against free-tier limits.

## Webhook problems
- Check Paystack dashboard → Settings → Webhooks for failed deliveries; the URL must be `https://<your-domain>/api/paystack/webhook`.
- A 401/400 means the signature failed: confirm `PAYSTACK_SECRET_KEY` is the key for the same Paystack mode (test vs live).
- Paystack retries; events are de-duplicated, so a retry is safe. Use "Resend" in Paystack for a missed one.

## Paid but no Premium
1. Find the payment in `/app/admin/payments` by reference or e-mail.
2. Not there: resend the webhook from Paystack. Still nothing: check the webhook list for a rejection reason (amount/plan mismatch is deliberate).
3. Verified in Paystack but the app refuses it: do not edit the database by hand; use "Give access" with the reason "paid, reference X" and tell the developer.

## Refunds and chargebacks
Refund in Paystack, then "End paid access" on the user page with the reason. Both steps are needed; the app does not read refunds automatically.

## Incident steps
- Suspected key leak: rotate it at once (Paystack, Supabase service role), update Vercel env vars, redeploy, review the audit log.
- Site down: check Vercel and Supabase status pages; roll back to the previous Vercel deployment.
- Bad migration: restore from your `pg_dump` backup; never edit an applied migration, add a new one.

## Backups
Free Supabase projects have no downloadable automatic backups. Run `pg_dump` before every migration and monthly. Store the file off the laptop.
