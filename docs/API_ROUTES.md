# Routes and server actions (Phase 1)

| Route / action | Method | Who may call it | Notes |
|---|---|---|---|
| `/` | GET | anyone | Landing page |
| `/login`, `signIn` action | GET / POST | signed-out (signed-in users are redirected) | Same error for unknown email and wrong password |
| `/register`, `signUp` action | GET / POST | signed-out | Same response whether or not the email exists |
| `/forgot-password`, `requestReset` | GET / POST | anyone | Same response whether or not the email exists |
| `/auth/confirm` | GET | anyone holding an email link | Verifies the one-time token; `next` must be a same-site path |
| `/reset-password`, `updatePassword` | GET / POST | signed-in (via reset link) | |
| `/app` (middleware + page check) | GET | signed-in only | Shows plan and businesses |
| `createBusiness`, `signOut` actions | POST | signed-in only | `owner_id` is taken from the verified session, then enforced by RLS |

Server Actions are POST-only and Next.js rejects cross-origin submissions (origin check), which is the CSRF protection in use.
| `/app/b/[id]` | GET | signed-in owner of that business (else 404) | Counts of customers, products, jobs |
| `/app/b/[id]/customers`, `/products`, `/jobs` | GET | owner of that business (else 404) | Search (`?q=`), archived toggle, jobs status filter. Read-only when the plan is not Premium |
| add, edit, archive/restore actions for customers, products, jobs | POST (Server Actions) | owner with an active Premium plan | Checked in the action for a friendly message, and again by the database |

| `/app/b/[id]/calculations` | GET | owner of that business | Search by title, filter by calculator, archived toggle |
| `/app/b/[id]/calculations/new`, `/new/[calc]` | GET | owner; saving needs Premium | `[calc]` must be one of the 11 saveable calculators, else 404 |
| `/app/b/[id]/calculations/[rid]` | GET | owner of the record's business (else 404) | Reopen; Recalculate is a POST Server Action (`calculate`), numbers never go in the URL |
| `/app/b/[id]/calculations/[rid]/export/xlsx`, `/export/pdf` | GET | owner (else 404), any plan | Downloads; engine re-run from stored inputs; safe file name; `Cache-Control: no-store`, `nosniff` |
| `/app/b/[id]/calculations/[rid]/print` | GET | owner (else 404), any plan | Print view for Print / Save as PDF |
| `calculate` Server Action | POST | signed-in owner of the business | Preview only; saves nothing |
| `saveCalculation`, `updateCalculation`, `duplicateCalculation`, `setCalculationArchived` | POST (Server Actions) | owner with active Premium | Engine is re-run on the server; browser-supplied results are ignored |
| `deleteCalculation` | POST (Server Action) | owner, any plan | |

| `/app/b/[id]` (dashboard) | GET | owner (else 404) | Open value, overdue, recent calculations, shortcuts |
| `/app/b/[id]/analysis` | GET | owner (else 404), any plan | Jobs by status, deadlines, top customers, margins, last six months |
| `/app/b/[id]/analysis/export/xlsx` | GET | owner, any plan | Analysis as Excel |
| `/app/b/[id]/records` | GET | owner, any plan | Search customers, jobs, products and saved calculations (`?q=&type=&archived=1`); each table searched on its own title column |
| `/app/b/[id]/records/export/xlsx` | GET | owner, any plan | All of the business's data as Excel, archived included |

No JSON API routes exist yet. Paystack routes arrive in Phase 6.

## Phase 7: payments and promotion
| Route | Method | Who | Notes |
|---|---|---|---|
| `/pricing` | GET | anyone | Price read from `app_settings` |
| `/app/upgrade` | GET | signed-in | Price and *Pay with Paystack* (`startCheckout` Server Action) |
| `/app/billing` | GET | signed-in | Plan, paid-until, payment history (own rows only), *Manage or cancel* (`openManageLink` Server Action) |
| `/billing/callback?reference=` | GET | signed-in owner of that payment | Verifies with Paystack, then redirects to /app/billing with a message code |
| `/api/paystack/webhook` | POST | Paystack only | Valid `x-paystack-signature` required (else 401); body max 100,000 bytes; 200 acknowledges, 500 asks Paystack to retry; 404 when payments are off |
