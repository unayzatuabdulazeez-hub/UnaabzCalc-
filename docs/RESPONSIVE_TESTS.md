# Responsive and layout tests (Phase 9)

## What was run
`premium/scripts/render/` renders the **real page components** (30 page variants: public pages, sign-in screens, workspace, upgrade, billing, every business page, calculators, print view and all admin screens) to HTML using fake data, then opens each in **real Chromium at six widths: 360, 412, 768, 1024, 1280 and 1920 px**. Result: **29 pages x 6 widths = 174 checks, all clean** (the 30th variant is the "normal user opening an admin page gets a 404" case).
Each check fails the page if: it scrolls sideways; any element sticks out of the screen outside a scrollable table; a button or field is under 36 px tall; a form field has no label; ids repeat; there is not exactly one main heading; text is under 13 px; the page has a browser console error.
Run it yourself: `npm run test:render` (needs Python, Playwright and Chromium).

## What it found and fixed
- Long e-mails and Paystack codes pushed the admin user page sideways on phones.
- Small text-style buttons (Archive, Sign out) were 24 px tall, too small for a thumb. Now 44 px.
- The job form's Customer and Status labels were not linked to their drop-downs.
- A read-only "copy as text" box had no label.

## What this does NOT prove
- It renders static HTML from fake data. It does not click, submit forms, sign in, or run the browser-side script, so **interactive behaviour (buttons updating results, forms saving, redirects) is untested in a browser**.
- It was not run on real phones or on Safari/Firefox; only Chromium.
- Tables on phones scroll sideways inside their own box by design (e.g. the admin user list); the check allows that.
- `next build` has never been run, so server-side build errors, if any, are still possible.
**You must do a real click-through on a phone and a laptop** (checklist in `docs/HANDOVER.md`).
