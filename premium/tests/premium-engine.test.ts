/**
 * Phase 5: advanced calculators and estimators. Expected numbers were worked out by hand (comments show the working),
 * not by calling the code under test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getAdapter, normalizeInputs, runCalculation, type Inputs } from "../src/lib/calc/adapters";
import { SAMPLES } from "../tests/samples";

const norm = (id: string, raw: Inputs): Inputs => { const n = normalizeInputs(id, raw); assert.ok(n.ok, JSON.stringify(n)); return (n as { inputs: Inputs }).inputs; };
const res = (id: string, raw: Inputs = SAMPLES[id]!) => { const r = runCalculation(id, norm(id, raw)); assert.ok(r.ok, `${id}: ${JSON.stringify(r)}`); return (r as unknown as { result: Record<string, any>; view: { rows: [string, string][] } }); };
const err = (id: string, raw: Inputs) => { const n = normalizeInputs(id, raw); if (!n.ok) return n.error; const r = runCalculation(id, n.inputs); assert.ok(!r.ok, `${id} should fail`); return (r as { error: string }).error; };
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const row = (r: { view: { rows: [string, string][] } }, label: string) => r.view.rows.find((x) => x[0] === label)?.[1];

test("import: goods 300,000 + 375,000; shared 180,000 split by value; landed 903,750; profit 296,250", () => {
  const { result: r } = res("advanced-import");
  assert.equal(r.productValue, 675000); assert.equal(r.duties, 48750); // 10% of 300,000 + 5% of 375,000
  assert.equal(r.shared, 180000);
  near(r.lines[0].alloc, 80000); near(r.lines[1].alloc, 100000);
  assert.equal(r.landed, 903750); assert.equal(r.revenue, 1200000); assert.equal(r.profit, 296250);
  near(r.margin, 296250 / 1200000 * 100);
  // second rate 1600: goods 320,000 + 400,000 = 720,000, duty 32,000+20,000, shared 180,000 => 952,000
  assert.equal(r.scenario.landed, 952000); assert.equal(r.scenario.landedDiff, 952000 - 903750);
});
test("import: sharing by quantity, weight and volume; blank price means no profit figure; bad input is refused", () => {
  const base = SAMPLES["advanced-import"] as { rows: Record<string, string>[] };
  const q = res("advanced-import", { ...SAMPLES["advanced-import"], basis: "quantity" }).result; // 150 units: 100 -> 120,000; 50 -> 60,000
  near(q.lines[0].alloc, 120000); near(q.lines[1].alloc, 60000);
  const w = res("advanced-import", { ...SAMPLES["advanced-import"], basis: "weight", rows: base.rows.map((x, i) => ({ ...x, weight: i ? "4" : "1" })) }).result; // 100*1=100 vs 50*4=200
  near(w.lines[0].alloc, 60000); near(w.lines[1].alloc, 120000);
  const np = res("advanced-import", { ...SAMPLES["advanced-import"], rows: base.rows.map((x) => ({ ...x, price: "" })) }).result;
  assert.equal(np.profit, null); assert.equal(np.hasPrice, false);
  assert.match(err("advanced-import", { ...SAMPLES["advanced-import"], basis: "weight" }), /weight/);
  assert.match(err("advanced-import", { ...SAMPLES["advanced-import"], rate: "0" }), /greater than 0/);
  assert.match(err("advanced-import", { ...SAMPLES["advanced-import"], rows: [] }), /at least one product/);
  assert.match(err("advanced-import", { ...SAMPLES["advanced-import"], rate: "-5" }), /cannot be negative|greater than/);
});
test("import: allows a shipment far above the Free limit of 500,000", () => {
  const r = res("advanced-import", { ...SAMPLES["advanced-import"], rate: "1", rows: [{ name: "Bulk", qty: "1000", cost: "50000", weight: "", cbm: "", duty: "", price: "" }] }).result;
  assert.equal(r.productValue, 50_000_000);
});

test("retail: shirt 2,100 cost +30% = 2,730; +7.5% tax = 2,934.75; rounds UP to 2,950", () => {
  const { result: r } = res("advanced-retail-pricing");
  const s = r.lines[0]; assert.equal(s.base, 2100); assert.equal(s.price, 2950);
  near(s.profit, 2950 / 1.075 - 2100);
  // shoes: own markup 40% => 7,000 * 1.075 = 7,525 -> up to 7,550
  assert.equal(r.lines[1].price, 7550); assert.equal(r.lines[1].own, true);
  near(r.lines[0].after, 2950 * 0.9); near(r.lines[0].profitAfter, 2950 * 0.9 / 1.075 - 2100);
  assert.equal(r.totalPrice, 2950 + 7550);
});
test("retail: rounding step always goes UP, never to the nearest (2,934.75 with step 100 is 3,000, not 2,900)", () => {
  const r = res("advanced-retail-pricing", { mode: "markup", value: "30", tax: "7.5", discount: "", step: "100", rows: [{ name: "Shirt", cost: "2000", expenses: "100", own: "" }] }).result;
  assert.equal(r.lines[0].price, 3000);
  assert.ok(r.lines[0].margin >= 0, "profit is never below the target because of rounding");
  assert.equal(res("advanced-retail-pricing", { mode: "markup", value: "30", tax: "7.5", discount: "", step: "0", rows: [{ name: "Shirt", cost: "2000", expenses: "100", own: "" }] }).result.lines[0].price, 2934.75);
});
test("retail: margin mode, 100% margin and negative values are refused; blank rows are skipped", () => {
  const m = res("advanced-retail-pricing", { mode: "margin", value: "20", tax: "", discount: "", step: "0", rows: [{ name: "A", cost: "800", expenses: "", own: "" }, { name: "", cost: "", expenses: "", own: "" }] }).result;
  assert.equal(m.count, 1); near(m.lines[0].price, 1000); near(m.lines[0].margin, 20);
  assert.match(err("advanced-retail-pricing", { mode: "margin", value: "100", rows: [{ name: "A", cost: "800" }] }), /cannot be more than/);
  assert.match(err("advanced-retail-pricing", { mode: "markup", value: "-1", rows: [{ name: "A", cost: "800" }] }), /negative/);
  assert.match(err("advanced-retail-pricing", { mode: "markup", value: "10", rows: [{ name: "A", cost: "0" }] }), /greater than 0/);
});

test("poultry broiler: 475 survive; cost 1,660,000; revenue 2,137,500; profit 477,500; 4 batches 1,910,000", () => {
  const { result: r } = res("advanced-poultry", { ...SAMPLES["advanced-poultry"], whatIfFeed: "" });
  assert.equal(r.survivors, 475); assert.equal(r.total, 1660000); assert.equal(r.revenue, 2137500); assert.equal(r.profit, 477500); assert.equal(r.yearlyProfit, 1910000);
  near(r.breakEven, 1660000 / 475); assert.equal(r.scenario, null);
});
test("poultry what-if: feed +10% => feed 1,320,000, total 1,780,000, profit 357,500; real result unchanged", () => {
  const { result: r } = res("advanced-poultry");
  assert.equal(r.profit, 477500); assert.equal(r.scenario.total, 1780000); assert.equal(r.scenario.profit, 357500);
  const p = res("advanced-poultry", { ...SAMPLES["advanced-poultry"], whatIfFeed: "", whatIfPrice: "10" }).result; // revenue 2,137,500 * 0.9
  near(p.scenario.revenue, 2137500 * 0.9);
  const m = res("advanced-poultry", { ...SAMPLES["advanced-poultry"], whatIfFeed: "", whatIfMortality: "20" }).result; // 400 survive
  assert.equal(m.scenario.survivors, 400);
});
test("poultry layers: eggs, crates and spent hens", () => {
  const lay = { kind: "layer", count: "200", chickPrice: "1500", feed: "3000000", med: "", bedding: "", utilities: "", labour: "", transport: "", other: "", mortality: "10", price: "2500", cycles: "1", weeks: "50", layingRate: "80", eggsPerCrate: "30", spentPrice: "3000", whatIfFeed: "", whatIfPrice: "", whatIfMortality: "" };
  const { result: r } = res("advanced-poultry", lay);
  // 180 hens x 50 weeks x 7 days x 80% = 50,400 eggs = 1,680 crates; egg sales 4,200,000; spent 540,000; cost 300,000 + 3,000,000
  assert.equal(r.eggs, 50400); assert.equal(r.crates, 1680); assert.equal(r.eggRevenue, 4200000); assert.equal(r.spent, 540000);
  assert.equal(r.total, 3300000); assert.equal(r.profit, 4740000 - 3300000);
  near(r.breakEven, (3300000 - 540000) / 1680);
  assert.match(err("advanced-poultry", { ...lay, layingRate: "101" }), /cannot be more than 100/);
});
test("poultry: bad input and absurd mortality are refused; flock sizes above the Free limit are allowed", () => {
  const b = SAMPLES["advanced-poultry"]!;
  assert.match(err("advanced-poultry", { ...b, count: "0" }), /greater than 0/);
  assert.match(err("advanced-poultry", { ...b, count: "10.5" }), /whole number/);
  assert.match(err("advanced-poultry", { ...b, mortality: "100" }), /cannot be more than 99/);
  assert.match(err("advanced-poultry", { ...b, count: "1", mortality: "99" }), /no surviving/);
  assert.match(err("advanced-poultry", { ...b, cycles: "13" }), /more than 12/);
  assert.equal(res("advanced-poultry", { ...b, count: "100000", feed: "1", whatIfFeed: "" }).result.count, 100000);
});

test("fish: 1,000 stocked, 900 survive; cost 1,030,000; 900 kg; revenue 2,250,000; profit 1,220,000", () => {
  const { result: r } = res("advanced-fish", { ...SAMPLES["advanced-fish"], whatIfPrice: "" });
  assert.equal(r.fish, 1000); assert.equal(r.survivors, 900); assert.equal(r.total, 1030000); assert.equal(r.kg, 900);
  assert.equal(r.revenue, 2250000); assert.equal(r.profit, 1220000); assert.equal(r.profitPerPond, 610000); near(r.costPerKg, 1030000 / 900);
});
test("fish what-if: price -20% => revenue 1,800,000, profit 770,000; mortality what-if; refusals", () => {
  const { result: r } = res("advanced-fish");
  assert.equal(r.scenario.revenue, 1800000); assert.equal(r.scenario.profit, 770000); assert.equal(r.profit, 1220000);
  assert.equal(res("advanced-fish", { ...SAMPLES["advanced-fish"], whatIfPrice: "", whatIfMortality: "50" }).result.scenario.survivors, 500);
  assert.match(err("advanced-fish", { ...SAMPLES["advanced-fish"], whatIfPrice: "101" }), /cannot be more than 100/);
  assert.match(err("advanced-fish", { ...SAMPLES["advanced-fish"], ponds: "0" }), /greater than 0/);
  assert.match(err("advanced-fish", { ...SAMPLES["advanced-fish"], avgKg: "" }), /valid/);
});

test("handwork: direct 22,600 (+5% overhead = 23,730); 30% margin => 33,900; deposit 50%; 8 jobs", () => {
  const { result: r } = res("advanced-handwork");
  assert.equal(r.materials, 6000); assert.equal(r.wastage, 600); assert.equal(r.labour, 15000); assert.equal(r.extras, 1000);
  assert.equal(r.direct, 22600); near(r.overhead, 1130); near(r.total, 23730); near(r.price, 33900);
  near(r.profit, 10170); near(r.margin, 30); near(r.deposit, 16950); near(r.balance, 16950);
  near(r.monthlyRevenue, 33900 * 8); near(r.monthlyProfit, 10170 * 8);
});
test("handwork: fixed amount and markup methods; refusals", () => {
  const b = SAMPLES["advanced-handwork"] as Record<string, unknown>;
  near(res("advanced-handwork", { ...b, method: "amount", amount: "5000" }).result.price, 23730 + 5000);
  near(res("advanced-handwork", { ...b, method: "markup", markup: "50" }).result.price, 23730 * 1.5);
  assert.match(err("advanced-handwork", { ...b, method: "margin", margin: "100" }), /cannot be more than/);
  assert.match(err("advanced-handwork", { ...b, sessions: "2.5" }), /whole number/);
  assert.match(err("advanced-handwork", { materials: [], labour: [], extras: [], method: "amount", amount: "0" }), /at least one cost/);
  assert.match(err("advanced-handwork", { ...b, labour: [{ name: "x", hours: "-1", rate: "10" }] }), /greater than 0|negative/);
});

test("general estimate: subtotal 160,000; -5% = 152,000; +2,000 = 154,000; +7.5% tax = 165,550; deposit 82,775", () => {
  const { result: r } = res("general-estimate");
  assert.equal(r.subtotal, 160000); assert.equal(r.discount, 8000); assert.equal(r.net, 154000); near(r.tax, 11550); near(r.total, 165550); near(r.deposit, 82775); near(r.balance, 82775);
  assert.equal(r.cost, 20 * 4800 + 40000); assert.equal(r.profit, 154000 - 136000);
});
test("general estimate: cost is optional (all or nothing), blank rows skipped, refusals", () => {
  const b = SAMPLES["general-estimate"] as { rows: Record<string, string>[] };
  const some = res("general-estimate", { ...b, rows: [b.rows[0], { ...b.rows[1], cost: "" }, { desc: "", unit: "", qty: "", rate: "", cost: "" }] }).result;
  assert.equal(some.cost, null); assert.equal(some.profit, null); assert.equal(some.lines.length, 2);
  assert.match(err("general-estimate", { rows: [] }), /at least one item/);
  assert.match(err("general-estimate", { rows: [{ desc: "x", qty: "0", rate: "5" }] }), /greater than 0/);
  assert.match(err("general-estimate", { rows: [{ desc: "x", qty: "1", rate: "0" }] }), /total must be greater than 0/);
  assert.match(err("general-estimate", { ...b, deposit: "150" }), /cannot be more than 100/);
});

test("electrical: materials 220,000 +5% wastage; +10% contingency; +10% profit; 50/50 milestones add up exactly", () => {
  const { result: r } = res("electrical-estimator");
  assert.equal(r.materials, 190000 + 30000); assert.equal(r.wastage, 11000); assert.equal(r.direct, 220000 + 75000 + 11000);
  near(r.contingency, 30600); near(r.cost, 336600); near(r.profit, 33660); near(r.price, 370260); near(r.total, 370260);
  near(r.perM2, 3702.6); near(r.perWeek, 185130);
  assert.deepEqual(r.milestones.map((m: { amount: number }) => m.amount), [185130, 185130]);
});
test("building: milestones always add up to the total to the kobo; they must total 100%", () => {
  const { result: r } = res("building-estimator");
  const sumM = r.milestones.reduce((s: number, m: { amount: number }) => s + Math.round(m.amount * 100), 0);
  assert.equal(sumM, Math.round(r.total * 100));
  // materials 1,350,000 + 240,000 = 1,590,000; wastage 5% = 79,500; direct 2,469,500; contingency 5% = 123,475; overhead 10% of 2,592,975
  near(r.direct, 2469500); near(r.contingency, 123475); near(r.overhead, 259297.5); near(r.cost, 2852272.5);
  near(r.profit, 2852272.5 * 0.15); near(r.total, 2852272.5 * 1.15 * 1.075);
  const b = SAMPLES["building-estimator"] as Record<string, unknown>;
  assert.match(err("building-estimator", { ...b, milestones: [{ name: "a", pct: "50" }, { name: "b", pct: "40" }] }), /exactly 100%/);
  // an awkward split (three equal thirds) still adds up exactly
  const t = res("building-estimator", { ...b, milestones: [{ name: "a", pct: "33.33" }, { name: "b", pct: "33.33" }, { name: "c", pct: "33.34" }] }).result;
  assert.equal(t.milestones.reduce((s: number, m: { amount: number }) => s + Math.round(m.amount * 100), 0), Math.round(t.total * 100));
});
test("estimators: no built-in prices, empty estimate refused, weird text is plain data", () => {
  assert.match(err("electrical-estimator", { wiring: [], wastage: "5" }), /at least one item/);
  const hostile = res("general-estimate", { rows: [{ desc: "<img src=x onerror=alert(1)> =cmd|' /C calc'!A0", unit: "x", qty: "1", rate: "10", cost: "" }] });
  assert.equal(hostile.result.lines[0].desc, "<img src=x onerror=alert(1)> =cmd|' /C calc'!A0");
  assert.match(err("general-estimate", { rows: [{ desc: "bad\u0000char", qty: "1", rate: "1" }] }), /not allowed/);
});

test("every Premium-only calculator refuses NaN, Infinity and huge numbers instead of showing them", () => {
  for (const id of ["advanced-import", "advanced-retail-pricing", "advanced-poultry", "advanced-fish", "advanced-handwork", "general-estimate", "electrical-estimator", "building-estimator"]) {
    const s = JSON.stringify(SAMPLES[id]);
    for (const bad of ["Infinity", "NaN", "1e400"]) {
      const mutated = JSON.parse(s.replace(/"(\d[\d,.]*)"/, `"${bad}"`)) as Inputs; // replace the first number
      const n = normalizeInputs(id, mutated); if (!n.ok) continue;
      const r = runCalculation(id, n.inputs);
      if (r.ok) assert.ok(r.view.rows.every(([, v]) => !/NaN|Infinity/.test(v)), `${id} ${bad}`);
    }
    const huge = JSON.parse(s.replace(/"(\d[\d,.]*)"/, '"99999999999999999999"')) as Inputs;
    const n = normalizeInputs(id, huge); if (n.ok) { const r = runCalculation(id, n.inputs); if (r.ok) assert.ok(r.view.rows.every(([, v]) => !/NaN|Infinity/.test(v)), id); }
  }
});
test("adapters: Premium calculators are flagged premium; the 11 Free parity calculators are not", () => {
  assert.equal(getAdapter("advanced-poultry")!.premium, true); assert.equal(getAdapter("profit")!.premium, false);
});

test("saved inputs are capped below the database limit with a clear message", () => {
  const big = Array.from({ length: 30 }, () => ({ item: "₦".repeat(100), unit: "u", qty: "1", rate: "1" }));
  const n = normalizeInputs("building-estimator", { ...SAMPLES["building-estimator"], walls: big, finish: big, site: big, roof: big });
  assert.ok(!n.ok && /too much text|too many rows/.test((n as { error: string }).error));
  assert.ok(normalizeInputs("general-estimate", SAMPLES["general-estimate"]!).ok);
  for (const id of Object.keys(SAMPLES)) assert.ok(new TextEncoder().encode(JSON.stringify(norm(id, SAMPLES[id]!))).length < 3000, id);
});
