# Which Free app is the real one? (checked 2026-10-11)

Three versions of the Free app exist. Nothing was changed in any of them.

| Where | What it is | Result |
|---|---|---|
| **Live on AppDeploy** (`unaabzcalc-gz88rn`, version 1791028437769) | 14 calculators, one `index.html` of 2,787 lines | **The real, current Free app** |
| `free/` in this repo (the frozen baseline Premium is built on) | Same 14 calculators, split into `index.html`, `app.js`, `calc-engine.js` | **Calculation code is identical to the live app** (see below) |
| GitHub `main`, root `index.html` | An **older** Free app: no Handwork calculator, free limits of 5 where the live app has 10 | Stale. Left untouched. Do not deploy it over the live app |

## How "identical" was checked
- The live engine (`docs/evidence/live-free-engine.js`) was run through the 137 Free calculator checks (`free/test.js`): **ALL PASSED**.
- The live engine and `free/calc-engine.js` have the same calculator registry (14 ids, same names, categories and limits) and the same categories.
- With comments, spacing, quotes, trailing commas and parentheses ignored, the two files differ only in: (a) 12 extra alias names in `free/calc-engine.js` (`calculateProfit` and so on, pointing at the same functions) and (b) a Node-compatible export line. No formula differs.
- The older engine on `main` fails this check (different registry and limits).

## What this does not cover
Only the calculation engine was compared. The page layout, wording and styling of the live app were not compared line by line, and the live app's `index.html`, styles and icons are not copied here.
