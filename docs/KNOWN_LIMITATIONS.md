# Known limitations after Phase 1
1. The Next.js pages, middleware, server actions and Supabase client code (including all Phase 2 screens) are written but have **not been built or run**: this session could not download npm packages. Only a syntax check of every file was run. First step on your laptop: `npm install && npm run typecheck && npm run build`, then fix anything reported.
2. Sign-up, sign-in, reset and the confirm route have **not been tested against a real Supabase project**.
3. The SQL was tested against a Postgres 16 stand-in, not Supabase itself. Re-run the checks by hand once on the real dev project.
4. No custom rate limiting yet. Supabase Auth applies its own limits to sign-in and email sending; app-level limits come with the security-hardening phase.
5. CSP allows `'unsafe-inline'` scripts/styles (needed by Next.js bootstrap). Nonce-based CSP is a later hardening step.
6. Business deletion is not allowed (archive only). Whether owners can permanently delete a business is an open decision.
7. No admin screens yet (database functions exist and are tested).
8. Premium pages are not yet linked to the Free site under `/free`; routing is an open decision (see DEPLOYMENT.md).
9. The Free engine enforces Free-tier caps internally (import value ₦500,000, poultry 100). Premium's advanced calculators will be new engine modules; the Free engine is not modified.
10. Plan gating is a product decision to confirm: a signed-in user on the Free plan can create a business but cannot add customers, products or jobs (writes need Premium; reads always work).
11. Customers, products and jobs cannot be permanently deleted by users (archive only).
12. Search is a simple case-insensitive "contains" on name or title, limited to 200 rows per page; no pagination yet.
13. Records are not yet linked to calculations, estimates or projects (those tables arrive in later phases).
14. Phase 2 screens have no browser tests yet and have not been checked at the six required screen widths.
15. (Fixed in Phase 5) Import, Poultry and Fish now have advanced Premium versions with no Free caps. The capped Free versions remain Free-only and are never saved.
16. (Fixed in Phase 4) Calculate and Recalculate now use POST, so entered numbers are no longer in the page address. Calculate needs JavaScript enabled (React form action).
17. Fields that only apply to one option (for example "hours" when labour is a total) are always visible, with a hint, because there is no client-side script.
18. Calculation and export pages have no browser tests yet and have not been checked at the six required widths. Export files were verified with real software, but the download buttons and routes were not run against a live Supabase.
19. PDF files use the built-in Helvetica font: the naira sign is written "NGN" and accents are removed. Browser Print > Save as PDF (the Print view) keeps full Unicode.
20. Excel exports contain values, not live formulas: changing a number in the file does not recalculate. The numbers are the engine's, written as real numeric cells.
21. Share links (WhatsApp, email) carry only the title and result, capped at 1,500 characters, never the customer or notes.
22. Phase 5 screens (picker, calculator pages with 19 calculators) are syntax-checked only: no `next build`, no browser test, not checked at the six required widths.
23. The Premium gate on previewing the advanced calculators and estimators lives in a Server Action (`calculate`) and the page. It cannot be unit-tested without Next.js here, so it is untested. (Saving is also enforced by the database, which is tested.)
24. The estimators have no built-in prices, tax rates or building standards, on purpose: every figure is typed by the user. Results are estimates, not quotations or engineering designs, and say so on screen and in exports.
25. Estimates and projects are not separate database tables. An estimate is a saved calculation linked to a customer, a job and a product; a "project" is a job. A dedicated project record (phases, progress, payments received) is not built.
26. Poultry and fish figures are forecasts from the user's own feed, price and mortality numbers. There are no built-in growth curves, feed-conversion tables or market prices.
27. Saved inputs are limited to 18,000 bytes of JSON (measured to stay under the database's 30,000-byte cap). Extremely large estimates are refused with a message telling the user to remove rows.
28. PDF files: a table whose figures cannot fit even at 6 pt type, with very large numbers across 8 or more columns, may shorten text columns (never figures). Excel has no such limit.
29. Phase 6 screens (dashboard, analysis, records) are syntax-checked only: no `next build`, no browser test, not checked at the six required widths. The records search page builds its database queries generically and could not be type-checked against Supabase types here.
30. The dashboard and analysis read up to 5,000 newest rows of each table on every page load and calculate in the app. That is fine for a small business; a very large one will want database-side summaries (a later optimisation).
31. There is no payments, sales or stock record, so the analysis shows agreed job amounts only, never revenue, cash, profit or stock. Product averages are simple averages, not weighted by sales.
32. "Last six months" groups by the date a job or calculation was added, not completed, because the app does not record a completion date.
33. Payments have been tested only against a fake Paystack and a real local Postgres, never a real Paystack or Supabase project. See docs/PAYMENTS.md for the test-mode run.
34. Whether Paystack's renewal `charge.success` includes `plan.plan_code` is unconfirmed; a renewal without it (and without our `UC-` reference) is rejected and logged, not granted.
35. Changing the price needs a new Paystack plan (docs/PAYMENTS.md). Until the plan and the price setting agree, checkout is refused.
36. Refunds are manual. There are no receipts or reminder e-mails of our own.
37. AdSense and its Content-Security-Policy additions are untested with real ads. Privacy and terms pages (needed by AdSense) do not exist yet.
38. Pages and server actions for billing could only be syntax-checked here (no `next build`); the logic underneath is tested.
