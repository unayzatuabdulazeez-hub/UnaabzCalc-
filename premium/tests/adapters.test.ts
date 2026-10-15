import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { engine } from "../src/lib/calc/engine";
import { ENGINE_VERSION } from "../src/vendor/engine-version";
import { SAMPLES as SHARED } from "./samples";
import { SAVEABLE_IDS, FREE_PARITY_IDS, getAdapter, listAdapters, normalizeInputs, runCalculation, readFormInputs, flattenInputs, money, pct, int, type Inputs } from "../src/lib/calc/adapters";

const freePath = join(__dirname, "..", "..", "free", "calc-engine.js");
const free = createRequire(__filename)(freePath);

const SAMPLES: Record<string, Inputs> = {
  basic: { expression: "50+10%" },
  percentage: { mode: "change", a: "100", b: "125" },
  profit: { cost: "800", sell: "1000" },
  discount: { price: "10,000", pct: "15" },
  "retail-pricing": { cost: "1000", expenses: "", mode: "markup", value: "30", discount: "10" },
  "target-profit": { cost: "500", profit: "100000", fixed: "20000", units: "200", price: "" },
  "business-expenses": { items: [{ name: "Rent", amount: "50,000" }, { name: "Transport", amount: "12000" }] },
  "multiple-products": { items: [{ name: "A", qty: "10", cost: "100", sell: "150" }, { name: "B", qty: "5", cost: "200", sell: "180" }] },
  loan: { principal: "1,000,000", rate: "12", term: "12", unit: "months" },
  "loan-repayment": { principal: "500000", rate: "0", term: "1", unit: "years", freq: "monthly" },
  "handwork-pricing": { materials: [{ name: "Ankara", qty: "2", cost: "3000" }], labourMode: "total", labour: "8000", transport: "1000", fuel: "", packaging: "", other: "", wastage: "800", method: "margin", margin: "20", discount: "" },
};
for (const [id, v] of Object.entries(SHARED)) SAMPLES[id] ??= v; // Phase 5 samples live in samples.ts


test("Premium saves the 11 uncapped Free calculators plus 5 advanced calculators and 3 estimators (19)", () => {
  const capped = engine.registry.filter((c) => (c as { free_limit?: unknown }).free_limit).map((c) => c.id).sort();
  assert.deepEqual(capped, ["fish-starter", "import-landed-cost", "poultry-starter"]);
  const free = engine.registry.map((c) => c.id).filter((id) => !capped.includes(id)).sort();
  assert.deepEqual([...FREE_PARITY_IDS].sort(), free);
  assert.equal(SAVEABLE_IDS.length, 19);
  for (const id of capped) assert.equal(getAdapter(id), null, "the capped Free versions are replaced, never saved");
  const adv = listAdapters().filter((a) => a.group === "advanced").map((a) => a.id).sort();
  assert.deepEqual(adv, ["advanced-fish", "advanced-handwork", "advanced-import", "advanced-poultry", "advanced-retail-pricing"]);
  assert.deepEqual(listAdapters().filter((a) => a.group === "estimator").map((a) => a.id).sort(), ["building-estimator", "electrical-estimator", "general-estimate"]);
  for (const a of listAdapters()) assert.equal(a.premium, a.group !== "calculator", a.id);
});
test("every saveable calculator has a sample and runs through the shared engine", () => {
  for (const a of listAdapters()) {
    const n = normalizeInputs(a.id, SAMPLES[a.id]!); assert.ok(n.ok, a.id);
    const r = runCalculation(a.id, (n as { inputs: Inputs }).inputs); assert.ok(r.ok, `${a.id}: ${JSON.stringify(r)}`);
    assert.ok(r.ok && r.view.rows.length > 0, a.id);
  }
});
test("known results: profit, discount, retail price, loan, handwork, basic percent", () => {
  const run = (id: string) => { const n = normalizeInputs(id, SAMPLES[id]!) as { inputs: Inputs }; const r = runCalculation(id, n.inputs); assert.ok(r.ok); return (r as { ok: true; result: Record<string, number> }).result; };
  const p = run("profit"); assert.equal(p.profit, 200); assert.equal(p.margin, 20); assert.equal(p.markup, 25);
  assert.equal(run("discount").final, 8500);
  const rp = run("retail-pricing"); assert.equal(rp.price, 1300); assert.equal(rp.after, 1170);
  const L = run("loan"); const r = 0.12 / 12, expected = 1000000 * r / (1 - Math.pow(1 + r, -12));
  assert.ok(Math.abs(L.payment! - expected) < 1e-6, "payment matches the textbook amortisation formula");
  assert.equal(run("loan-repayment").interest, 0, "zero-interest loan has zero interest");
  const h = run("handwork-pricing"); assert.equal(h.total, 6000 + 8000 + 1000 + 800); assert.ok(Math.abs(h.price! - h.total! / 0.8) < 1e-9);
  assert.equal(run("basic").value, 55, "50+10% = 55 (percent of the left side)");
});
test("adapter output equals calling the FREE engine directly (parity)", () => {
  const direct: Record<string, () => unknown> = {
    profit: () => free.profit(800, 1000), discount: () => free.discount(10000, 15), basic: () => free.basic("50+10%"),
    percentage: () => free.percentage("change", 100, 125),
    loan: () => free.loan({ principal: 1000000, rate: 12, term: 12, unit: "months", freq: "monthly" }),
    "retail-pricing": () => free.retailPrice({ cost: 1000, expenses: 0, mode: "markup", value: 30, discount: 10 }),
  };
  for (const [id, fn] of Object.entries(direct)) {
    const n = normalizeInputs(id, SAMPLES[id]!) as { inputs: Inputs }; const r = runCalculation(id, n.inputs) as { ok: true; result: unknown };
    assert.deepEqual(r.result, fn(), id);
  }
});
test("bad numbers are reported with the engine's own message and are not saveable", () => {
  const blank = runCalculation("profit", (normalizeInputs("profit", { cost: "", sell: "5" }) as { inputs: Inputs }).inputs);
  assert.ok(!blank.ok && /cost price/i.test(blank.error));
  assert.ok(!runCalculation("profit", (normalizeInputs("profit", { cost: "-5", sell: "5" }) as { inputs: Inputs }).inputs).ok);
  assert.ok(!runCalculation("percentage", (normalizeInputs("percentage", { mode: "change", a: "0", b: "5" }) as { inputs: Inputs }).inputs).ok, "start value 0");
  assert.ok(!runCalculation("profit", (normalizeInputs("profit", { cost: "abc", sell: "5" }) as { inputs: Inputs }).inputs).ok);
  assert.ok(!runCalculation("discount", (normalizeInputs("discount", { price: "100", pct: "150" }) as { inputs: Inputs }).inputs).ok, "discount over 100");
  assert.ok(!runCalculation("loan", (normalizeInputs("loan", { principal: "0", rate: "5", term: "1", unit: "years" }) as { inputs: Inputs }).inputs).ok);
  assert.ok(!runCalculation("basic", (normalizeInputs("basic", { expression: "5/0" }) as { inputs: Inputs }).inputs).ok);
  assert.ok(!runCalculation("business-expenses", (normalizeInputs("business-expenses", { items: [] }) as { inputs: Inputs }).inputs).ok);
});
test("normalise: unknown keys dropped, commas and naira signs stripped, hidden fields not kept", () => {
  const n = normalizeInputs("handwork-pricing", { ...SAMPLES["handwork-pricing"], labour: "₦ 8,000", hours: "9", evil: "x", __proto__: { polluted: true }, margin: "20", markup: "99", amount: "5" }) as { ok: true; inputs: Record<string, unknown> };
  assert.ok(n.ok);
  assert.equal(n.inputs.labour, "8000");
  assert.ok(!("evil" in n.inputs) && !("hours" in n.inputs) && !("markup" in n.inputs) && !("amount" in n.inputs), "fields hidden by the other option are dropped");
  assert.equal(n.inputs.margin, "20");
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
test("normalise: select must be valid; text with control characters rejected; unknown calculator rejected", () => {
  assert.equal(normalizeInputs("percentage", { mode: "hack", a: "1", b: "2" }).ok, false);
  assert.equal(normalizeInputs("basic", { expression: "1+1\u0000" }).ok, false);
  assert.equal(normalizeInputs("business-expenses", { items: [{ name: "Rent\u0007", amount: "1" }] }).ok, false);
  assert.equal(normalizeInputs("import-landed-cost", {}).ok, false);
  assert.equal(normalizeInputs("nope", {}).ok, false);
});
test("normalise: row cap of 100, empty rows dropped, long text truncated", () => {
  const items = Array.from({ length: 250 }, (_, i) => ({ name: "x".repeat(200), amount: String(i + 1) }));
  const n = normalizeInputs("business-expenses", { items }) as { ok: true; inputs: { items: { name: string }[] } };
  assert.equal(n.inputs.items.length, 100); assert.equal(n.inputs.items[0]!.name.length, 80);
  const m = normalizeInputs("business-expenses", { items: [{ name: "", amount: "" }, { name: "Rent", amount: "5" }] }) as { ok: true; inputs: { items: unknown[] } };
  assert.equal(m.inputs.items.length, 1);
});
test("form fields round-trip: flatten -> read -> normalise gives the same inputs", () => {
  for (const a of listAdapters()) {
    const n = normalizeInputs(a.id, SAMPLES[a.id]!) as { inputs: Inputs };
    const flat = flattenInputs(a.id, n.inputs);
    const back = normalizeInputs(a.id, readFormInputs(a.id, (k) => flat[k])) as { inputs: Inputs };
    assert.deepEqual(back.inputs, n.inputs, a.id);
  }
});
test("special characters survive as plain data and are never interpreted", () => {
  const n = normalizeInputs("business-expenses", { items: [{ name: "<script>alert(1)</script> & Ọlá 'x'", amount: "100" }] }) as { ok: true; inputs: { items: { name: string }[] } };
  assert.equal(n.inputs.items[0]!.name, "<script>alert(1)</script> & Ọlá 'x'");
  const r = runCalculation("business-expenses", n.inputs) as { ok: true; view: { table: { body: string[][] } } };
  assert.equal(r.view.table.body[0]![0], "<script>alert(1)</script> & Ọlá 'x'");
});
test("large values and many decimals stay accurate", () => {
  const r = runCalculation("profit", (normalizeInputs("profit", { cost: "1000000000000", sell: "1000000000250.55" }) as { inputs: Inputs }).inputs) as { ok: true; view: { rows: string[][] } };
  assert.ok(r.ok); assert.equal(r.view.rows[0]![1], "₦250.55");
  assert.ok(!runCalculation("profit", (normalizeInputs("profit", { cost: "1e16", sell: "1" }) as { inputs: Inputs }).inputs).ok, "beyond the engine's 1e15 ceiling");
});
test("formatters: naira, negatives, null, percent, whole numbers", () => {
  assert.equal(money(1234567.891), "₦1,234,567.89"); assert.equal(money(-50), "-₦50.00"); assert.equal(money(null), "—"); assert.equal(money(NaN), "—");
  assert.equal(pct(20), "20.00%"); assert.equal(pct(null), "—"); assert.equal(int(1234.6), "1,235");
});
test("loan schedule: payments sum to principal and balance ends at 0", () => {
  const n = normalizeInputs("loan-repayment", SAMPLES["loan-repayment"]!) as { inputs: Inputs };
  const r = runCalculation("loan-repayment", n.inputs) as unknown as { ok: true; result: { schedule: { principal: number; balance: number }[] } };
  const sum = r.result.schedule.reduce((s, x) => s + x.principal, 0);
  assert.ok(Math.abs(sum - 500000) < 1e-6); assert.equal(r.result.schedule.at(-1)!.balance, 0); assert.equal(r.result.schedule.length, 12);
});
test("ENGINE_VERSION equals the hash of free/calc-engine.js", () => {
  assert.equal(ENGINE_VERSION, createHash("sha256").update(readFileSync(freePath)).digest("hex").slice(0, 12));
});
