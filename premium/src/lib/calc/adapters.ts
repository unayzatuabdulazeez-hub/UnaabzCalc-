/**
 * Registry of everything Premium can calculate and save: the 11 uncapped Free calculators (shared engine), the 5 advanced
 * Premium calculators and the 3 estimators (Premium engine, src/lib/calc/premium-engine.ts).
 * Import / landed cost, Poultry and Fish are not saved in their Free form: the shared engine caps them at the Free limits.
 * Their advanced versions replace them here.
 *
 * What is stored is the user's INPUTS only (cleaned, declared fields only). Results are recomputed with the shared engine
 * every time a record is opened or exported, so a stored result can never be fabricated or drift from the screen.
 */
import { type CalcResult } from "./engine";
import { engine } from "./engine";
import { N, O, S, UNIT, FREQ, call, num, rowsIn, rowsOf, sel, text, tone, money, pct, int, plain, type Adapter, type Described, type Field, type Inputs, type Tone } from "./kit";
export { money, pct, int, plain } from "./kit";
export type { Adapter, Described, Field, Inputs, NumField, TextField, SelectField, RowsField, Tone, Group } from "./kit";
import { hasControlChars } from "../validation/common";
import { ADVANCED_ADAPTERS } from "./advanced";
import { ESTIMATOR_ADAPTERS } from "./estimators";

function loanDescribe(r: CalcResult, label: string): Described {
  const sched = (r.schedule as { no: number; principal: number; interest: number; balance: number }[]) ?? [];
  return {
    rows: [[label, money(r.payment)], ["Total repayment", money(r.total)], ["Total interest", money(r.interest)], ["Number of payments", int(r.n)]],
    table: { head: ["#", "Principal", "Interest", "Balance"], body: sched.map((s) => [int(s.no), money(s.principal), money(s.interest), money(s.balance)]) },
  };
}

type CoreAdapter = Omit<Adapter, "group" | "premium" | "blurb">;
const CORE: CoreAdapter[] = [
  { id: "basic", name: "Basic Calculator", fields: [text("expression", "Calculation (for example 200 + 10% or 12 x 5)", 200, false)],
    run: (v) => call("basic", S(v.expression)), describe: (r) => ({ rows: [["Result", plain(r.value)]] }) },
  { id: "percentage", name: "Percentage Calculator",
    fields: [sel("mode", "What do you want to find?", [["of", "X% of Y"], ["change", "Percentage increase or decrease"], ["difference", "Percentage difference"]]), num("a", "First value (for X% of Y: the percentage X)"), num("b", "Second value (for X% of Y: the number Y)")],
    run: (v) => call("percentage", S(v.mode), N(v.a), N(v.b)),
    describe: (r, v) => v.mode === "of" ? { rows: [[`${S(v.a)}% of ${S(v.b)}`, plain(r.result)]] }
      : v.mode === "change" ? { rows: [[r.direction === "increase" ? "Percentage increase" : r.direction === "decrease" ? "Percentage decrease" : "No change", pct(Math.abs(r.percent as number)), r.direction === "increase" ? "good" : r.direction === "decrease" ? "bad" : ""], ["Change in value", plain(r.amount)]] }
      : { rows: [["Percentage difference", pct(r.percent)], ["Difference in value", plain(r.amount)]], note: "Difference is relative to the average of the two values." } },
  { id: "profit", name: "Profit Calculator", fields: [num("cost", "Cost price"), num("sell", "Selling price")],
    run: (v) => call("profit", N(v.cost), N(v.sell)),
    describe: (r) => ({ rows: [[(r.profit as number) > 0 ? "Profit" : (r.profit as number) < 0 ? "Loss" : "Break-even (no profit, no loss)", money(Math.abs(r.profit as number)), tone(r.profit)], ["Profit margin (share of selling price)", pct(r.margin)], ["Markup (profit as a percentage of cost)", pct(r.markup)]] }) },
  { id: "discount", name: "Discount Calculator", fields: [num("price", "Original price"), num("pct", "Discount (%)")],
    run: (v) => call("discount", N(v.price), N(v.pct)),
    describe: (r) => ({ rows: [["Final price", money(r.final)], ["Discount amount", money(r.discount)], ["Amount saved", money(r.saved)]] }) },
  { id: "retail-pricing", name: "Retail Pricing Calculator",
    fields: [num("cost", "Product cost"), num("expenses", "Additional expenses per item", true), sel("mode", "Set my price by", [["markup", "Markup (% added on top of cost)"], ["margin", "Profit margin (% of selling price)"]]), num("value", "Desired markup or margin (%)"), num("discount", "Discount to offer (%)", true)],
    run: (v) => call("retailPrice", { cost: N(v.cost), expenses: O(v.expenses), mode: S(v.mode), value: N(v.value), discount: O(v.discount) }),
    describe: (r, v) => ({ rows: ([["Recommended selling price", money(r.price)], ["Total cost per item", money(r.base)], ["Expected profit per item", money(r.profit), (r.profit as number) >= 0 ? "good" : "bad"], ["Profit margin", pct(r.margin)], ["Markup", pct(r.markup)]] as [string, string, Tone?][])
      .concat(O(v.discount) > 0 ? [[`Price after ${S(v.discount)}% discount`, money(r.after)], ["Profit after discount", money(r.profitAfter), tone(r.profitAfter)]] : []) }) },
  { id: "target-profit", name: "Target Profit Calculator",
    fields: [num("cost", "Cost per product"), num("profit", "Profit you want to make"), num("fixed", "Fixed expenses", true), num("units", "Units you expect to sell", true), num("price", "Your selling price, if you already have one", true)],
    run: (v) => call("targetProfit", { cost: N(v.cost), profit: N(v.profit), fixed: O(v.fixed), units: O(v.units), price: O(v.price) }),
    describe: (r) => ({ rows: [r.mode === "price" ? ["Price you must charge per item", money(r.price)] : ["Items you must sell", int(r.units)], ["Revenue needed", money(r.revenue)], ["Total costs", money(r.totalCost)], ["Expected profit", money(r.profit), "good"]] }) },
  { id: "business-expenses", name: "Business Expense Calculator",
    fields: [rowsOf("items", "Monthly expenses", "Add expense", [text("name", "Expense", 80), num("amount", "Monthly amount", true)], 9)],
    run: (v) => call("expenses", rowsIn(v.items)),
    describe: (r) => ({ rows: [["Total monthly expenses", money(r.monthly)], ["Yearly projection (x 12)", money(r.yearly)]],
      table: { head: ["Expense", "Monthly", "Share"], body: ((r.items as { name: string; amount: number; share: number }[]) ?? []).map((x) => [x.name, money(x.amount), pct(x.share)]) } }) },
  { id: "multiple-products", name: "Multiple Products Calculator",
    fields: [rowsOf("items", "Products", "Add product", [text("name", "Product", 80), num("qty", "Quantity", true), num("cost", "Cost price (each)", true), num("sell", "Selling price (each)", true)], 3)],
    run: (v) => call("multipleProducts", rowsIn(v.items)),
    describe: (r) => ({ rows: [[(r.totalProfit as number) >= 0 ? "Total profit" : "Total loss", money(Math.abs(r.totalProfit as number)), (r.totalProfit as number) >= 0 ? "good" : "bad"], ["Total cost", money(r.totalCost)], ["Total sales", money(r.totalSales)], ["Overall profit margin", pct(r.margin)], ["Total units", int(r.units)]],
      table: { head: ["Product", "Qty", "Cost", "Sales", "Profit"], body: ((r.items as { name: string; qty: number; cost: number; sales: number; profit: number }[]) ?? []).map((x) => [x.name, plain(x.qty), money(x.cost), money(x.sales), money(x.profit)]) } }) },
  { id: "loan", name: "Loan Calculator",
    fields: [num("principal", "Loan amount"), num("rate", "Annual interest rate (%)"), num("term", "Loan duration"), sel("unit", "Duration in", UNIT)],
    run: (v) => call("loan", { principal: N(v.principal), rate: N(v.rate), term: N(v.term), unit: S(v.unit), freq: "monthly" }),
    describe: (r) => loanDescribe(r, "Monthly payment") },
  { id: "loan-repayment", name: "Loan Repayment Calculator",
    fields: [num("principal", "Principal (loan amount)"), num("rate", "Annual interest rate (%)"), num("term", "Loan term"), sel("unit", "Term in", UNIT), sel("freq", "Payment frequency", FREQ)],
    run: (v) => call("loan", { principal: N(v.principal), rate: N(v.rate), term: N(v.term), unit: S(v.unit), freq: S(v.freq) }),
    describe: (r) => loanDescribe(r, "Payment amount") },
  { id: "handwork-pricing", name: "Handwork & Service Pricing Calculator",
    fields: [
      rowsOf("materials", "Materials (leave empty if you use none)", "Add material", [text("name", "Material", 80), num("qty", "Quantity", true), num("cost", "Cost each", true)], 2),
      sel("labourMode", "How do you count your labour?", [["total", "One total amount"], ["hourly", "Hours x rate per hour"]]),
      num("labour", "Total labour cost", true, { key: "labourMode", value: "total" }), num("hours", "Labour hours", true, { key: "labourMode", value: "hourly" }), num("rate", "Labour rate per hour", true, { key: "labourMode", value: "hourly" }),
      num("transport", "Transport", true), num("fuel", "Electricity/fuel", true), num("packaging", "Packaging", true), num("other", "Other expenses", true), num("wastage", "Wastage/other cost", true),
      sel("method", "How do you want to set your profit?", [["amount", "A fixed profit amount"], ["markup", "Markup (% on top of total cost)"], ["margin", "Profit margin (% of the selling price)"]]),
      num("amount", "Profit you want to make", false, { key: "method", value: "amount" }), num("markup", "Markup (%)", false, { key: "method", value: "markup" }), num("margin", "Profit margin (%)", false, { key: "method", value: "margin" }),
      num("discount", "Discount to offer (%)", true),
    ],
    run: (v) => call("handwork", { materials: rowsIn(v.materials), labourMode: S(v.labourMode), labour: O(v.labour), hours: O(v.hours), rate: O(v.rate), transport: O(v.transport), fuel: O(v.fuel), packaging: O(v.packaging), other: O(v.other), wastage: O(v.wastage), method: S(v.method), amount: N(v.amount), markup: N(v.markup), margin: N(v.margin), discount: O(v.discount) }),
    describe: (r) => ({ rows: ([["Recommended selling price", money(r.price)], ["Total material cost", money(r.materials)], ["Labour cost", money(r.labour)], ["Other costs", money(r.other)], ["Total cost", money(r.total)], ["Expected profit", money(r.profit), (r.profit as number) >= 0 ? "good" : "bad"], ["Profit margin (of selling price)", pct(r.margin)], ["Markup (on total cost)", pct(r.markup)], ["Break-even price", money(r.breakEven)]] as [string, string, Tone?][])
      .concat(r.hasDiscount ? [[`Price after ${plain(r.discount)}% discount`, money(r.after)], ["Profit after discount", money(r.profitAfter), tone(r.profitAfter)]] : []) }) },
];

// The 11 Free calculators that have no Free-tier cap: same numbers as the Free app (parity-tested), free to preview on any plan.
const FREE_BLURB = new Map(engine.registry.map((c) => [c.id, c.description]));
const CALCULATORS: Adapter[] = CORE.map((a) => ({ ...a, group: "calculator" as const, premium: false, blurb: FREE_BLURB.get(a.id) ?? "" }));
// Premium-only: advanced versions of the capped Free calculators, and the three estimators. Preview AND save need Premium.
const ADAPTERS: Adapter[] = [...CALCULATORS, ...ADVANCED_ADAPTERS, ...ESTIMATOR_ADAPTERS];

const BY_ID = new Map(ADAPTERS.map((a) => [a.id, a]));
/** Every calculation kind that can be saved (Free parity set + advanced + estimators). */
export const SAVEABLE_IDS: readonly string[] = ADAPTERS.map((a) => a.id);
/** The 11 Free calculators only (used by the parity tests). */
export const FREE_PARITY_IDS: readonly string[] = CALCULATORS.map((a) => a.id);
export const getAdapter = (id: unknown): Adapter | null => (typeof id === "string" ? BY_ID.get(id) ?? null : null);
export const listAdapters = (): Adapter[] => ADAPTERS;

// ---- normalising (keeps declared fields only, in a clean shape) ----
const cleanNum = (v: unknown) => S(v).trim().replace(/[,\s₦]/g, "").slice(0, 30);
const cleanText = (v: unknown, max: number) => { const s = S(v).trim(); return hasControlChars(s) ? null : s.slice(0, max); };
const visible = (f: { showIf?: { key: string; value: string } }, out: Record<string, unknown>) => !f.showIf || out[f.showIf.key] === f.showIf.value;

/**
 * UTF-8 bytes of the stored JSON. The database caps the jsonb at 30,000 bytes. Measured on PostgreSQL 16: jsonb is at most about
 * 1.6x the text size for rows of short values (and about 1.0x for long text), so 18,000 stays safely under the cap.
 */
export const MAX_INPUT_BYTES = 18000;
export type NormalizeResult = { ok: true; inputs: Inputs } | { ok: false; error: string };
export function normalizeInputs(calcId: string, raw: Inputs): NormalizeResult {
  const a = getAdapter(calcId);
  if (!a) return { ok: false, error: "This calculator cannot be saved yet." };
  const out: Record<string, unknown> = {};
  for (const f of a.fields) {
    if (f.kind === "select") {
      const v = S(raw[f.key]) || f.options[0]![0];
      if (!f.options.some(([o]) => o === v)) return { ok: false, error: `Choose a valid option for "${f.label}".` };
      out[f.key] = v;
    } else if (f.kind === "num") {
      if (visible(f, out)) out[f.key] = cleanNum(raw[f.key]);
    } else if (f.kind === "text") {
      const t = cleanText(raw[f.key], f.maxLen);
      if (t === null) return { ok: false, error: `"${f.label}" contains characters that are not allowed.` };
      out[f.key] = t;
    } else {
      const rows: Record<string, string>[] = [];
      for (const r of rowsIn(raw[f.key]).slice(0, f.maxRows)) {
        const row: Record<string, string> = {};
        for (const c of f.cols) {
          if (c.kind === "num") row[c.key] = cleanNum(r?.[c.key]);
          else { const t = cleanText(r?.[c.key], c.maxLen); if (t === null) return { ok: false, error: `"${c.label}" contains characters that are not allowed.` }; row[c.key] = t; }
        }
        if (Object.values(row).some((x) => x !== "")) rows.push(row);
      }
      out[f.key] = rows;
    }
  }
  // saved_calculations.inputs is capped at 30,000 bytes by the database: refuse early with a clear message, never a vague failure
  if (new TextEncoder().encode(JSON.stringify(out)).length > MAX_INPUT_BYTES) return { ok: false, error: "This calculation has too much text or too many rows to save. Remove some rows or shorten the descriptions." };
  return { ok: true, inputs: out };
}

/** Runs the shared engine on already-normalised inputs. */
export function runCalculation(calcId: string, inputs: Inputs): { ok: true; result: CalcResult; view: Described } | { ok: false; error: string } {
  const a = getAdapter(calcId);
  if (!a) return { ok: false, error: "This calculator cannot be opened yet." };
  let result: CalcResult;
  try { result = a.run(inputs); } catch { return { ok: false, error: "This calculation could not be completed." }; }
  if (!result.ok) return { ok: false, error: typeof result.error === "string" ? result.error : "Please check your numbers." };
  return { ok: true, result, view: a.describe(result, inputs) };
}

// ---- form <-> inputs (flat names: "cost", "items.0.name") ----
export function readFormInputs(calcId: string, get: (name: string) => string | undefined): Inputs {
  const a = getAdapter(calcId); const raw: Record<string, unknown> = {};
  if (!a) return raw;
  for (const f of a.fields) {
    if (f.kind !== "rows") { raw[f.key] = get(f.key) ?? ""; continue; }
    const rows: Record<string, string>[] = [];
    for (let i = 0; i < f.maxRows; i++) {
      const row: Record<string, string> = {}; let any = false;
      for (const c of f.cols) { const v = get(`${f.key}.${i}.${c.key}`); if (v !== undefined) any = true; row[c.key] = v ?? ""; }
      if (!any && i >= f.blankRows) break;
      rows.push(row);
    }
    raw[f.key] = rows;
  }
  return raw;
}
export function flattenInputs(calcId: string, inputs: Inputs): Record<string, string> {
  const a = getAdapter(calcId); const flat: Record<string, string> = {};
  if (!a) return flat;
  for (const f of a.fields) {
    if (f.kind !== "rows") { if (inputs[f.key] !== undefined) flat[f.key] = S(inputs[f.key]); continue; }
    rowsIn(inputs[f.key]).forEach((r, i) => f.cols.forEach((c) => { flat[`${f.key}.${i}.${c.key}`] = S(r?.[c.key]); }));
  }
  return flat;
}
