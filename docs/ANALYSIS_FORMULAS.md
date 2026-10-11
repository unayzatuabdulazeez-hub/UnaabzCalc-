# Business analysis: what is calculated and how

Source: `premium/src/lib/analysis/business.ts` (pure functions, tested in `tests/analysis.test.ts` with hand-calculated numbers).
Everything comes from what the owner entered. Nothing is estimated, predicted or invented.

## Rules
- **Value** = the "agreed amount" typed on a job. It is **not money received**: the app has no payments record yet, so it never shows revenue, profit or cash.
- Money is added in whole kobo (integers), so totals never drift by a fraction of a kobo.
- Days and months use **Africa/Lagos** (UTC+1, no daylight saving). A job created at 23:30 UTC on 31 August counts as 1 September.
- Archived rows are ignored in every figure (their number is shown separately). Cancelled jobs are ignored in customer, month and "without an amount" figures but shown on their own line in "Jobs by status".
- Only the newest 5,000 rows of each table are read (5 requests of 1,000). If a table is larger the page says so.

## Figures
| Figure | Formula |
|---|---|
| Quotes / In progress / Completed value | Sum of agreed amounts of active jobs with that status (jobs without an amount add nothing and are counted separately) |
| Open value | Quotes + In progress |
| Overdue | Open job (quote or in progress) with due date before today |
| Due soon | Open job due today up to 7 days ahead |
| Top customers | Per customer: number and agreed value of their non-cancelled jobs; highest value first, max 5 |
| Product margin | (selling price - cost price) / selling price x 100 |
| Product markup | (selling price - cost price) / cost price x 100 (blank if cost is 0) |
| Average margin / markup | Simple average over products that have both prices and a selling price above 0. Not weighted by sales (the app does not record sales). Blank if no product qualifies |
| Below cost | Selling price lower than cost price |
| Last six months | Per Lagos month of the date the job or calculation was **added** (not finished): jobs added, their agreed value, calculations saved |

## What is deliberately not here
Revenue, cash, profit and loss, tax, stock levels and forecasts. They need payments, sales and stock records that the app does not have.
