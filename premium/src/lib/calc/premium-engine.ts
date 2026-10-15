/**
 * Premium calculation engine: pure functions, no UI, no database, no network.
 * Used by the advanced calculators and the estimators (the 11 Free-parity calculators keep using the shared Free engine).
 *
 * Rules that hold for every function here:
 *  - every figure comes from the user (quantities, rates, costs, percentages); nothing is a built-in price or tax rate;
 *  - nothing is rounded until it is displayed (milestone payments are the one exception, see sectionEstimate);
 *  - bad input returns { ok: false, error } with a plain-language message; it never throws and never returns NaN.
 */
import type { CalcResult } from "./engine";
import { N, O, S } from "./kit";

type Row = Record<string, unknown>;
type Chk = [label: string, value: number, opts?: { gt?: number; max?: number }];

const bad = (error: string): CalcResult => ({ ok: false, error });
const ok = (d: Record<string, unknown>): CalcResult => ({ ok: true, ...d });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const CEIL = 1e15;

/** Same checks and wording as the Free engine: finite, not negative, optional greater-than / maximum, not absurdly large. */
function chk(items: Chk[]): string | null {
  for (const [l, v, o = {}] of items) {
    if (!Number.isFinite(v)) return `Please enter a valid ${l}.`;
    if (o.gt !== undefined && !(v > o.gt)) return `${cap(l)} must be greater than ${o.gt}.`;
    if (v < 0) return `${cap(l)} cannot be negative.`;
    if (o.max !== undefined && v > o.max) return `${cap(l)} cannot be more than ${o.max}.`;
    if (v > CEIL) return `${cap(l)} is too large.`;
  }
  return null;
}
const whole = (label: string, v: number) => (Number.isInteger(v) ? null : `${cap(label)} must be a whole number.`);
const blank = (v: unknown) => S(v).trim() === "";
const isBlankRow = (r: Row, keys: string[]) => keys.every((k) => blank(r[k]));
const nameOf = (r: Row, fallback: string) => S(r.name).trim() || S(r.item).trim() || S(r.desc).trim() || fallback;
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const guard = (n: number) => (Number.isFinite(n) && Math.abs(n) <= CEIL * 1000 ? null : "The result is too large to show. Please check your numbers.");
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// =====================================================================================================================
// Advanced Import / Landed Cost
// =====================================================================================================================
export interface ImportInput {
  rate: number; rate2: number; basis: string;
  shipping: number; clearing: number; transport: number; bank: number; other: number; rows: Row[];
}
export const IMPORT_BASES = ["value", "quantity", "weight", "cbm"] as const;

export function advancedImport(v: ImportInput): CalcResult {
  const e = chk([["exchange rate", v.rate, { gt: 0 }], ["alternative exchange rate", v.rate2], ["shipping fee", v.shipping], ["clearing/agent fee", v.clearing], ["local transportation", v.transport], ["bank/payment charges", v.bank], ["other expenses", v.other]]);
  if (e) return bad(e);
  if (!(IMPORT_BASES as readonly string[]).includes(v.basis)) return bad("Choose how to share the shipping and other costs.");
  type P = { name: string; qty: number; cost: number; weight: number; cbm: number; price: number; duty: number };
  const ps: P[] = [];
  v.rows.forEach((r, i) => {
    if (isBlankRow(r, ["name", "qty", "cost", "weight", "cbm", "price", "duty"])) return;
    ps.push({ name: nameOf(r, `Product ${i + 1}`), qty: N(r.qty), cost: N(r.cost), weight: O(r.weight), cbm: O(r.cbm), price: O(r.price), duty: O(r.duty) });
  });
  if (!ps.length) return bad("Add at least one product.");
  for (const p of ps) {
    const m = chk([[`quantity for ${p.name}`, p.qty, { gt: 0 }], [`supplier cost for ${p.name}`, p.cost, { gt: 0 }], [`weight for ${p.name}`, p.weight], [`volume (CBM) for ${p.name}`, p.cbm], [`selling price for ${p.name}`, p.price], [`duty rate for ${p.name}`, p.duty, { max: 500 }]]);
    if (m) return bad(m);
    if (v.basis === "weight" && !(p.weight > 0)) return bad(`Enter the weight per unit for ${p.name} to share costs by weight.`);
    if (v.basis === "cbm" && !(p.cbm > 0)) return bad(`Enter the volume (CBM) per unit for ${p.name} to share costs by volume.`);
  }
  const shared = v.shipping + v.clearing + v.transport + v.bank + v.other;
  const basisOf = (p: P, value: number) => (v.basis === "value" ? value : v.basis === "quantity" ? p.qty : v.basis === "weight" ? p.qty * p.weight : p.qty * p.cbm);
  const hasPrice = ps.every((p) => p.price > 0);
  const compute = (rate: number) => {
    const vals = ps.map((p) => p.qty * p.cost * rate);
    const basis = ps.map((p, i) => basisOf(p, vals[i]!));
    const tot = sum(basis, (b) => b);
    const lines = ps.map((p, i) => {
      const value = vals[i]!, duty = value * p.duty / 100, alloc = shared * basis[i]! / tot;
      const landed = value + duty + alloc, revenue = p.qty * p.price;
      return { name: p.name, qty: p.qty, value, duty, alloc, landed, perUnit: landed / p.qty, price: p.price, revenue, profit: hasPrice ? revenue - landed : null as number | null };
    });
    const landed = sum(lines, (l) => l.landed), revenue = hasPrice ? sum(lines, (l) => l.revenue) : null;
    return { lines, productValue: sum(lines, (l) => l.value), duties: sum(lines, (l) => l.duty), landed, revenue, profit: revenue === null ? null : revenue - landed };
  };
  const main = compute(v.rate);
  if (guard(main.landed)) return bad(guard(main.landed)!);
  const scenario = v.rate2 > 0 ? (() => { const s = compute(v.rate2); return { rate: v.rate2, landed: s.landed, profit: s.profit, landedDiff: s.landed - main.landed }; })() : null;
  return ok({
    ...main, rate: v.rate, basis: v.basis, shared, hasPrice, units: sum(ps, (p) => p.qty),
    margin: main.revenue && main.revenue > 0 && main.profit !== null ? main.profit / main.revenue * 100 : null,
    scenario,
  });
}

// =====================================================================================================================
// Advanced Retail Pricing (several products, optional own markup/margin per product, tax and price rounding)
// =====================================================================================================================
export interface RetailInput { mode: string; value: number; discount: number; tax: number; step: number; rows: Row[] }
export const ROUND_STEPS = ["0", "10", "50", "100", "500"] as const;

export function advancedRetail(v: RetailInput): CalcResult {
  const margin = v.mode === "margin";
  if (v.mode !== "margin" && v.mode !== "markup") return bad("Choose markup or profit margin.");
  const e = chk([[margin ? "profit margin" : "markup", v.value, { max: margin ? 99.99 : 100000 }], ["discount", v.discount, { max: 100 }], ["tax rate", v.tax, { max: 100 }], ["rounding step", v.step]]);
  if (e) return bad(e);
  const lines: { name: string; base: number; price: number; profit: number; margin: number; markup: number; after: number | null; profitAfter: number | null; own: boolean }[] = [];
  let i = 0;
  for (const r of v.rows) {
    i++;
    if (isBlankRow(r, ["name", "cost", "expenses", "own"])) continue;
    const name = nameOf(r, `Product ${i}`), cost = N(r.cost), exp = O(r.expenses), own = blank(r.own) ? null : N(r.own);
    const m = chk(([[`cost for ${name}`, cost], [`expenses for ${name}`, exp]] as Chk[]).concat(own === null ? [] : [[`own ${margin ? "margin" : "markup"} for ${name}`, own, { max: margin ? 99.99 : 100000 }] as Chk]) as Chk[]);
    if (m) return bad(m);
    const base = cost + exp;
    if (!(base > 0)) return bad(`The cost of ${name} must be greater than 0.`);
    const val = own ?? v.value;
    const net = margin ? base / (1 - val / 100) : base * (1 + val / 100);
    const k = 1 + v.tax / 100;
    let shelf = net * k;
    if (v.step > 0) shelf = Math.ceil(shelf / v.step - 1e-9) * v.step; // always round UP so the target margin is never lost
    const received = shelf / k, profit = received - base;
    const shelfAfter = shelf * (1 - v.discount / 100), receivedAfter = shelfAfter / k;
    lines.push({ name, base, price: shelf, profit, margin: profit / received * 100, markup: profit / base * 100, after: v.discount > 0 ? shelfAfter : null, profitAfter: v.discount > 0 ? receivedAfter - base : null, own: own !== null });
  }
  if (!lines.length) return bad("Add at least one product.");
  const g = guard(sum(lines, (l) => l.price));
  if (g) return bad(g);
  return ok({ lines, count: lines.length, totalCost: sum(lines, (l) => l.base), totalPrice: sum(lines, (l) => l.price), totalProfit: sum(lines, (l) => l.profit), hasDiscount: v.discount > 0, discount: v.discount, tax: v.tax, step: v.step });
}

// =====================================================================================================================
// Advanced Poultry and Fish (no bird/fish cap; broiler + layer; what-if scenario)
// =====================================================================================================================
export interface WhatIf { feedUp: number; priceDown: number; mortality: number | null }
const whatIfOf = (feedUp: number, priceDown: number, mortality: string | undefined): { w: WhatIf; active: boolean; err: string | null } => {
  const mort = blank(mortality) ? null : N(mortality);
  const err = chk(([["what-if feed increase", feedUp, { max: 1000 }], ["what-if price drop", priceDown, { max: 100 }]] as Chk[]).concat(mort === null ? [] : [["what-if mortality rate", mort, { max: 99 }] as Chk]) as Chk[]);
  return { w: { feedUp, priceDown, mortality: mort }, active: feedUp > 0 || priceDown > 0 || mort !== null, err };
};
export { whatIfOf };

export interface PoultryInput {
  kind: string; count: number; chickPrice: number; feed: number; med: number; bedding: number; utilities: number; labour: number; transport: number; other: number;
  mortality: number; price: number; cycles: number;
  weeks: number; layingRate: number; eggsPerCrate: number; spentPrice: number;
  whatIfFeed: number; whatIfPrice: number; whatIfMortality?: string;
}
function poultryCore(v: PoultryInput, w: WhatIf | null) {
  const mortality = w?.mortality ?? v.mortality, feed = v.feed * (1 + (w?.feedUp ?? 0) / 100), priceMult = 1 - (w?.priceDown ?? 0) / 100;
  const survivors = Math.floor(v.count * (100 - mortality) / 100 + 1e-9);
  if (survivors < 1) return { error: "That mortality rate leaves no surviving birds. Please lower it." };
  const layer = v.kind === "layer";
  const purchase = v.count * v.chickPrice, other = v.bedding + v.utilities + v.labour + v.transport + v.other, total = purchase + feed + v.med + other;
  let revenue: number, eggs = 0, crates = 0, eggRevenue = 0, spent = 0, breakEven: number;
  if (layer) {
    eggs = survivors * v.weeks * 7 * v.layingRate / 100; crates = eggs / v.eggsPerCrate;
    eggRevenue = crates * v.price * priceMult; spent = survivors * v.spentPrice * priceMult; revenue = eggRevenue + spent;
    breakEven = (total - spent) / crates; // price per crate that covers the cost after selling the spent hens
  } else { revenue = survivors * v.price * priceMult; breakEven = total / survivors; }
  const profit = revenue - total;
  return { survivors, mortality, purchase, feed, other, total, revenue, profit, margin: revenue > 0 ? profit / revenue * 100 : null, costPer: total / survivors, eggs, crates, eggRevenue, spent, breakEven };
}
export function advancedPoultry(v: PoultryInput): CalcResult {
  if (v.kind !== "broiler" && v.kind !== "layer") return bad("Choose broilers or layers.");
  const layer = v.kind === "layer";
  const e = chk([["number of birds", v.count, { gt: 0 }], ["price per chick", v.chickPrice], ["feed cost", v.feed], ["medication/vaccination cost", v.med], ["bedding/litter cost", v.bedding], ["water/electricity cost", v.utilities], ["labour cost", v.labour], ["transportation cost", v.transport], ["other expenses", v.other], ["mortality rate", v.mortality, { max: 99 }], ["cycles per year", v.cycles, { gt: 0, max: 12 }]]
    .concat(layer ? [["weeks of laying", v.weeks, { gt: 0, max: 200 }], ["laying rate", v.layingRate, { gt: 0, max: 100 }], ["eggs per crate", v.eggsPerCrate, { gt: 0 }], ["selling price per crate", v.price, { gt: 0 }], ["selling price per spent hen", v.spentPrice]] : [["selling price per bird", v.price, { gt: 0 }]]) as Chk[]);
  if (e) return bad(e);
  const w1 = whole("number of birds", v.count) ?? whole("cycles per year", v.cycles); if (w1) return bad(w1);
  const wi = whatIfOf(v.whatIfFeed, v.whatIfPrice, v.whatIfMortality); if (wi.err) return bad(wi.err);
  const base = poultryCore(v, null); if ("error" in base) return bad(base.error as string);
  const g = guard(base.total); if (g) return bad(g);
  let scenario: ReturnType<typeof poultryCore> | null = null;
  if (wi.active) { scenario = poultryCore(v, wi.w); if ("error" in scenario) return bad(`What-if: ${scenario.error as string}`); }
  return ok({ kind: v.kind, count: v.count, ...base, cycles: v.cycles, yearlyProfit: base.profit * v.cycles, scenario, whatIf: wi.active ? wi.w : null });
}

export interface FishInput {
  ponds: number; perPond: number; fingerlingPrice: number; feed: number; med: number; pond: number; water: number; power: number; labour: number; transport: number; other: number;
  mortality: number; avgKg: number; priceKg: number; whatIfFeed: number; whatIfPrice: number; whatIfMortality?: string;
}
function fishCore(v: FishInput, w: WhatIf | null) {
  const fish = v.ponds * v.perPond, mortality = w?.mortality ?? v.mortality, feed = v.feed * (1 + (w?.feedUp ?? 0) / 100), price = v.priceKg * (1 - (w?.priceDown ?? 0) / 100);
  const survivors = Math.floor(fish * (100 - mortality) / 100 + 1e-9);
  if (survivors < 1) return { error: "That mortality rate leaves no surviving fish. Please lower it." };
  const purchase = fish * v.fingerlingPrice, other = v.pond + v.water + v.power + v.labour + v.transport + v.other, total = purchase + feed + v.med + other;
  const kg = survivors * v.avgKg, revenue = kg * price, profit = revenue - total;
  return { fish, survivors, mortality, purchase, feed, other, total, kg, revenue, profit, margin: revenue > 0 ? profit / revenue * 100 : null, costPerKg: total / kg, profitPerPond: profit / v.ponds };
}
export function advancedFish(v: FishInput): CalcResult {
  const e = chk([["number of ponds", v.ponds, { gt: 0 }], ["fish per pond", v.perPond, { gt: 0 }], ["price per fingerling", v.fingerlingPrice], ["feed cost", v.feed], ["medication/treatment cost", v.med], ["pond preparation cost", v.pond], ["water cost", v.water], ["electricity/pumping cost", v.power], ["labour cost", v.labour], ["transportation cost", v.transport], ["other expenses", v.other], ["mortality rate", v.mortality, { max: 99 }], ["average harvest weight per fish (kg)", v.avgKg, { gt: 0 }], ["selling price per kg", v.priceKg, { gt: 0 }]]);
  if (e) return bad(e);
  const w1 = whole("number of ponds", v.ponds) ?? whole("fish per pond", v.perPond); if (w1) return bad(w1);
  const wi = whatIfOf(v.whatIfFeed, v.whatIfPrice, v.whatIfMortality); if (wi.err) return bad(wi.err);
  const base = fishCore(v, null); if ("error" in base) return bad(base.error as string);
  const g = guard(base.total); if (g) return bad(g);
  let scenario: ReturnType<typeof fishCore> | null = null;
  if (wi.active) { scenario = fishCore(v, wi.w); if ("error" in scenario) return bad(`What-if: ${scenario.error as string}`); }
  return ok({ ponds: v.ponds, ...base, scenario, whatIf: wi.active ? wi.w : null });
}

// =====================================================================================================================
// Advanced Handwork & Service pricing (several labour lines, wastage %, overhead %, deposit, recurring service)
// =====================================================================================================================
export interface HandworkInput {
  materials: Row[]; labour: Row[]; extras: Row[]; wastage: number; overhead: number;
  method: string; amount: number; markup: number; margin: number; discount: number; deposit: number; sessions: number;
}
export function advancedHandwork(v: HandworkInput): CalcResult {
  let materials = 0, labour = 0, extras = 0;
  let i = 0;
  for (const r of v.materials) { i++; if (isBlankRow(r, ["name", "qty", "cost"])) continue; const n = nameOf(r, `Material ${i}`), q = N(r.qty), c = N(r.cost); const m = chk([[`quantity for ${n}`, q, { gt: 0 }], [`cost for ${n}`, c]]); if (m) return bad(m); materials += q * c; }
  i = 0;
  for (const r of v.labour) { i++; if (isBlankRow(r, ["name", "hours", "rate"])) continue; const n = nameOf(r, `Worker ${i}`), h = N(r.hours), c = N(r.rate); const m = chk([[`hours for ${n}`, h, { gt: 0 }], [`rate per hour for ${n}`, c]]); if (m) return bad(m); labour += h * c; }
  i = 0;
  for (const r of v.extras) { i++; if (isBlankRow(r, ["name", "amount"])) continue; const n = nameOf(r, `Cost ${i}`), a = N(r.amount); const m = chk([[`amount for ${n}`, a]]); if (m) return bad(m); extras += a; }
  const method = v.method === "markup" || v.method === "margin" ? v.method : "amount";
  const val = method === "margin" ? v.margin : method === "markup" ? v.markup : v.amount;
  const e = chk([["wastage", v.wastage, { max: 1000 }], ["overhead", v.overhead, { max: 1000 }], [method === "margin" ? "desired profit margin" : method === "markup" ? "desired markup" : "desired profit amount", val, { max: method === "margin" ? 99.99 : method === "markup" ? 100000 : CEIL }], ["discount", v.discount, { max: 100 }], ["deposit", v.deposit, { max: 100 }], ["sessions per month", v.sessions, { max: 1000 }]]);
  if (e) return bad(e);
  const w1 = whole("sessions per month", v.sessions); if (w1) return bad(w1);
  const wastage = materials * v.wastage / 100, direct = materials + wastage + labour + extras, overhead = direct * v.overhead / 100, total = direct + overhead;
  if (!(total > 0)) return bad("Enter at least one cost: materials, labour or other costs.");
  const price = method === "margin" ? total / (1 - val / 100) : method === "markup" ? total * (1 + val / 100) : total + val;
  const profit = price - total, after = price * (1 - v.discount / 100), profitAfter = after - total;
  const g = guard(price); if (g) return bad(g);
  const depositAmt = after * v.deposit / 100;
  return ok({
    materials, wastage, labour, extras, direct, overhead, total, price, profit, margin: profit / price * 100, markup: profit / total * 100, breakEven: total,
    hasDiscount: v.discount > 0, discount: v.discount, after, profitAfter,
    hasDeposit: v.deposit > 0, deposit: depositAmt, balance: after - depositAmt,
    hasSessions: v.sessions > 0, sessions: v.sessions, monthlyRevenue: after * v.sessions, monthlyCost: total * v.sessions, monthlyProfit: profitAfter * v.sessions,
  });
}

// =====================================================================================================================
// Estimators. Every quantity and rate is typed in by the user. There are no built-in prices, tax rates or standards.
// =====================================================================================================================
export interface GeneralInput { rows: Row[]; discount: number; charges: number; tax: number; deposit: number }
export function generalEstimate(v: GeneralInput): CalcResult {
  const lines: { desc: string; unit: string; qty: number; rate: number; amount: number; cost: number | null }[] = [];
  let i = 0;
  for (const r of v.rows) {
    i++;
    if (isBlankRow(r, ["desc", "unit", "qty", "rate", "cost"])) continue;
    const desc = S(r.desc).trim() || `Item ${i}`, qty = N(r.qty), rate = N(r.rate), cost = blank(r.cost) ? null : N(r.cost);
    const m = chk(([[`quantity for ${desc}`, qty, { gt: 0 }], [`rate for ${desc}`, rate]] as Chk[]).concat(cost === null ? [] : [[`cost for ${desc}`, cost] as Chk]) as Chk[]);
    if (m) return bad(m);
    lines.push({ desc, unit: S(r.unit).trim(), qty, rate, amount: qty * rate, cost });
  }
  if (!lines.length) return bad("Add at least one item.");
  const e = chk([["discount", v.discount, { max: 100 }], ["extra charges", v.charges], ["tax rate", v.tax, { max: 100 }], ["deposit", v.deposit, { max: 100 }]]);
  if (e) return bad(e);
  const subtotal = sum(lines, (l) => l.amount);
  if (!(subtotal > 0)) return bad("The estimate total must be greater than 0.");
  const discount = subtotal * v.discount / 100, net = subtotal - discount + v.charges, tax = net * v.tax / 100, total = net + tax, deposit = total * v.deposit / 100;
  const g = guard(total); if (g) return bad(g);
  const hasCosts = lines.every((l) => l.cost !== null);
  const cost = hasCosts ? sum(lines, (l) => l.qty * (l.cost as number)) : null;
  return ok({ lines, subtotal, discount, charges: v.charges, net, tax, total, deposit, balance: total - deposit, hasDeposit: v.deposit > 0, hasDiscount: v.discount > 0, hasTax: v.tax > 0, cost, profit: cost === null ? null : net - cost, margin: cost === null || net <= 0 ? null : (net - cost) / net * 100 });
}

export interface SectionDef { key: string; label: string; materials: boolean; rows: Row[] }
export interface SectionInput {
  sections: SectionDef[]; wastage: number; contingency: number; overhead: number; profit: number; tax: number; deposit: number;
  milestones: Row[]; area: number; weeks: number;
}
export function sectionEstimate(v: SectionInput): CalcResult {
  const lines: { section: string; item: string; unit: string; qty: number; rate: number; amount: number }[] = [];
  const subs: { label: string; count: number; amount: number; materials: boolean }[] = [];
  for (const s of v.sections) {
    let count = 0, amount = 0, i = 0;
    for (const r of s.rows) {
      i++;
      if (isBlankRow(r, ["item", "unit", "qty", "rate"])) continue;
      const item = S(r.item).trim() || `${s.label} ${i}`, qty = N(r.qty), rate = N(r.rate);
      const m = chk([[`quantity for ${item}`, qty, { gt: 0 }], [`rate for ${item}`, rate]]);
      if (m) return bad(m);
      lines.push({ section: s.label, item, unit: S(r.unit).trim(), qty, rate, amount: qty * rate }); count++; amount += qty * rate;
    }
    subs.push({ label: s.label, count, amount, materials: s.materials });
  }
  if (!lines.length) return bad("Add at least one item.");
  const e = chk([["wastage", v.wastage, { max: 1000 }], ["contingency", v.contingency, { max: 1000 }], ["overhead", v.overhead, { max: 1000 }], ["profit", v.profit, { max: 100000 }], ["tax rate", v.tax, { max: 100 }], ["deposit", v.deposit, { max: 100 }], ["floor area", v.area], ["project length (weeks)", v.weeks]]);
  if (e) return bad(e);
  const materials = sum(subs.filter((s) => s.materials), (s) => s.amount), wastage = materials * v.wastage / 100;
  const direct = sum(subs, (s) => s.amount) + wastage, contingency = direct * v.contingency / 100, overhead = (direct + contingency) * v.overhead / 100;
  const cost = direct + contingency + overhead;
  if (!(cost > 0)) return bad("The estimate total must be greater than 0.");
  const profit = cost * v.profit / 100, price = cost + profit, tax = price * v.tax / 100, total = price + tax, deposit = total * v.deposit / 100;
  const g = guard(total); if (g) return bad(g);
  // payment milestones: amounts are rounded to the kobo and the LAST one absorbs the rounding, so they add up to the total exactly
  const ms: { name: string; percent: number; amount: number }[] = [];
  let j = 0;
  for (const r of v.milestones) {
    j++;
    if (isBlankRow(r, ["name", "pct"])) continue;
    const name = S(r.name).trim() || `Payment ${j}`, p = N(r.pct);
    const m = chk([[`percentage for ${name}`, p, { gt: 0, max: 100 }]]); if (m) return bad(m);
    ms.push({ name, percent: p, amount: 0 });
  }
  if (ms.length) {
    const tp = sum(ms, (x) => x.percent);
    if (Math.abs(tp - 100) > 1e-9) return bad(`The payment milestones add up to ${Math.round(tp * 1e6) / 1e6}%. They must add up to exactly 100%.`);
    const T = round2(total); let run = 0;
    ms.forEach((x, k) => { x.amount = k === ms.length - 1 ? round2(T - run) : round2(total * x.percent / 100); run = round2(run + x.amount); });
  }
  return ok({ lines, subs, materials, wastage, direct, contingency, overhead, cost, profit, margin: profit / price * 100, price, tax, total, deposit, balance: total - deposit, hasDeposit: v.deposit > 0, hasTax: v.tax > 0, milestones: ms, area: v.area, perM2: v.area > 0 ? total / v.area : null, weeks: v.weeks, perWeek: v.weeks > 0 ? total / v.weeks : null });
}
