/**
 * The five advanced Premium calculators. They replace the Free-capped Import, Poultry and Fish starters (no limits) and add
 * multi-product Retail Pricing and multi-line Handwork pricing. The maths lives in premium-engine.ts; this file only maps
 * form fields to it and formats the answer. Preview and save need Premium.
 */
import { advancedFish, advancedHandwork, advancedImport, advancedPoultry, advancedRetail } from "./premium-engine";
import { N, O, S, money, num, pct, int, plain, rowsIn, rowsOf, sel, text, tone, type Adapter, type Described, type Tone } from "./kit";
import type { CalcResult } from "./engine";

type Row = [string, string, Tone?];
const R = (r: CalcResult, k: string) => r[k] as number;
const arr = <T,>(r: CalcResult, k: string) => (r[k] as T[]) ?? [];
const opt = (n: unknown, f: (x: number) => string) => (typeof n === "number" ? f(n) : "—");
const NOTE_ESTIMATE = "Every figure comes from the numbers you entered. Prices and rates are yours; nothing is built in.";

const importAdapter: Adapter = {
  id: "advanced-import", name: "Advanced Import / Landed Cost", group: "advanced", premium: true,
  blurb: "Several products, duty, shared shipping costs, selling prices and a second exchange rate. No shipment limit.",
  fields: [
    num("rate", "Exchange rate (₦ per unit of foreign currency; use 1 if you pay in naira)"),
    num("rate2", "Second exchange rate to compare (optional)", true),
    sel("basis", "Share shipping and other costs between products by", [["value", "Value of the goods"], ["quantity", "Number of units"], ["weight", "Weight"], ["cbm", "Volume (CBM)"]]),
    num("shipping", "Shipping / freight (₦)", true), num("clearing", "Clearing / agent fee (₦)", true), num("transport", "Local transportation (₦)", true), num("bank", "Bank / payment charges (₦)", true), num("other", "Other expenses (₦)", true),
    rowsOf("rows", "Products", "Add product", [text("name", "Product", 80), num("qty", "Quantity", true), num("cost", "Supplier cost each (foreign currency)", true), num("weight", "Weight each (kg, if sharing by weight)", true), num("cbm", "Volume each (CBM, if sharing by volume)", true), num("duty", "Duty / tax on goods (%)", true), num("price", "Selling price each (₦, optional)", true)], 2, 30),
  ],
  run: (v) => advancedImport({ rate: N(v.rate), rate2: O(v.rate2), basis: S(v.basis), shipping: O(v.shipping), clearing: O(v.clearing), transport: O(v.transport), bank: O(v.bank), other: O(v.other), rows: rowsIn(v.rows) }),
  describe: (r): Described => {
    const lines = arr<{ name: string; qty: number; value: number; duty: number; alloc: number; landed: number; perUnit: number; profit: number | null }>(r, "lines");
    const rows: Row[] = [["Value of goods", money(R(r, "productValue"))], ["Duty / tax on goods", money(R(r, "duties"))], ["Shipping and other costs", money(R(r, "shared"))], ["Total landed cost", money(R(r, "landed"))], ["Total units", int(R(r, "units"))]];
    if (r.hasPrice) rows.push(["Expected sales", money(R(r, "revenue"))], ["Expected profit", money(R(r, "profit")), tone(r.profit)], ["Profit margin", opt(r.margin, pct)]);
    const sc = r.scenario as { rate: number; landed: number; profit: number | null; landedDiff: number } | null;
    if (sc) rows.push([`At exchange rate ${plain(sc.rate)}: landed cost`, money(sc.landed)], ["Difference in landed cost", money(sc.landedDiff), sc.landedDiff > 0 ? "bad" : sc.landedDiff < 0 ? "good" : ""], ...(sc.profit === null ? [] : [[`At exchange rate ${plain(sc.rate)}: profit`, money(sc.profit), tone(sc.profit)] as Row]));
    return { rows, note: "Foreign-currency costs are multiplied by the exchange rate you entered. " + NOTE_ESTIMATE,
      table: { head: ["Product", "Qty", "Goods", "Duty", "Shared costs", "Landed cost", "Landed each", "Profit"], body: lines.map((l) => [l.name, plain(l.qty), money(l.value), money(l.duty), money(l.alloc), money(l.landed), money(l.perUnit), opt(l.profit, money)]) } };
  },
};

const MODE: [string, string][] = [["markup", "Markup (% added on top of cost)"], ["margin", "Profit margin (% of selling price)"]];
const retailAdapter: Adapter = {
  id: "advanced-retail-pricing", name: "Advanced Retail Pricing", group: "advanced", premium: true,
  blurb: "Price many products at once, with your own markup or margin per product, tax, discount and rounded prices.",
  fields: [
    sel("mode", "Set prices by", MODE), num("value", "Default markup or margin (%)"), num("tax", "Tax added to the shelf price (%, optional)", true), num("discount", "Discount to offer (%, optional)", true),
    sel("step", "Round shelf prices up to the nearest", [["0", "No rounding"], ["10", "₦10"], ["50", "₦50"], ["100", "₦100"], ["500", "₦500"]]),
    rowsOf("rows", "Products", "Add product", [text("name", "Product", 80), num("cost", "Cost", true), num("expenses", "Extra expenses each", true), num("own", "Own markup/margin (%) instead of the default", true)], 3, 60),
  ],
  run: (v) => advancedRetail({ mode: S(v.mode), value: N(v.value), tax: O(v.tax), discount: O(v.discount), step: O(v.step), rows: rowsIn(v.rows) }),
  describe: (r): Described => {
    const lines = arr<{ name: string; base: number; price: number; profit: number; margin: number; markup: number; after: number | null; profitAfter: number | null; own: boolean }>(r, "lines");
    const disc = !!r.hasDiscount;
    return {
      rows: [["Products priced", int(R(r, "count"))], ["Total cost", money(R(r, "totalCost"))], ["Total of shelf prices", money(R(r, "totalPrice"))], ["Total profit if each sells once", money(R(r, "totalProfit"), ), tone(R(r, "totalProfit"))]],
      note: `Shelf prices are rounded up so your target is never lost. Profit is worked out on the price you actually receive${R(r, "tax") > 0 ? " (shelf price without tax)" : ""}.`,
      table: { head: ["Product", "Cost", "Shelf price", "Profit", "Margin", "Markup", ...(disc ? ["After discount", "Profit after discount"] : [])],
        body: lines.map((l) => [l.name + (l.own ? " *" : ""), money(l.base), money(l.price), money(l.profit), pct(l.margin), pct(l.markup), ...(disc ? [opt(l.after, money), opt(l.profitAfter, money)] : [])]) },
    };
  },
};

const WHATIF = (): ReturnType<typeof num>[] => [num("whatIfFeed", "What if feed costs rise by (%)? (optional)", true), num("whatIfPrice", "What if the selling price falls by (%)? (optional)", true), num("whatIfMortality", "What if mortality were (%)? (optional)", true)];
type PCore = { survivors: number; mortality: number; total: number; revenue: number; profit: number; margin: number | null };
const whatIfRows = (r: CalcResult): Row[] => {
  const s = r.scenario as PCore | null; if (!s) return [];
  return [["What-if: survivors", int(s.survivors)], ["What-if: total revenue", money(s.revenue)], ["What-if: total cost", money(s.total)], ["What-if: profit", money(s.profit), tone(s.profit)], ["Change in profit", money(s.profit - R(r, "profit")), tone(s.profit - R(r, "profit"))]];
};
const poultryAdapter: Adapter = {
  id: "advanced-poultry", name: "Advanced Poultry Planner", group: "advanced", premium: true,
  blurb: "Broilers or egg layers, any flock size, mortality, several cycles a year and a what-if scenario.",
  fields: [
    sel("kind", "What are you raising?", [["broiler", "Broilers (meat)"], ["layer", "Layers (eggs)"]]),
    num("count", "Number of birds"), num("chickPrice", "Price per chick (₦)"), num("feed", "Total feed cost for the batch (₦)"), num("med", "Medication / vaccination (₦)", true), num("bedding", "Bedding / litter (₦)", true), num("utilities", "Water / electricity (₦)", true), num("labour", "Labour (₦)", true), num("transport", "Transportation (₦)", true), num("other", "Other expenses (₦)", true),
    num("mortality", "Expected mortality (%)", true),
    num("price", "Selling price per bird (broilers) or per crate of eggs (layers) (₦)"),
    num("weeks", "Weeks of laying", false, { key: "kind", value: "layer" }), num("layingRate", "Average laying rate (%)", false, { key: "kind", value: "layer" }), num("eggsPerCrate", "Eggs per crate", false, { key: "kind", value: "layer" }), num("spentPrice", "Selling price per spent hen (₦)", true, { key: "kind", value: "layer" }),
    num("cycles", "Batches per year"), ...WHATIF(),
  ],
  run: (v) => advancedPoultry({ kind: S(v.kind), count: N(v.count), chickPrice: N(v.chickPrice), feed: N(v.feed), med: O(v.med), bedding: O(v.bedding), utilities: O(v.utilities), labour: O(v.labour), transport: O(v.transport), other: O(v.other), mortality: O(v.mortality), price: N(v.price), cycles: N(v.cycles), weeks: N(v.weeks), layingRate: N(v.layingRate), eggsPerCrate: N(v.eggsPerCrate), spentPrice: O(v.spentPrice), whatIfFeed: O(v.whatIfFeed), whatIfPrice: O(v.whatIfPrice), whatIfMortality: S(v.whatIfMortality) }),
  describe: (r): Described => {
    const layer = r.kind === "layer";
    const rows: Row[] = [["Birds bought", int(R(r, "count"))], ["Birds expected to survive", int(R(r, "survivors"))], ["Chick purchase", money(R(r, "purchase"))], ["Feed", money(R(r, "feed"))], ["Medication and other costs", money(R(r, "other"))], ["Total cost", money(R(r, "total"))], ["Cost per surviving bird", money(R(r, "costPer"))]];
    if (layer) rows.push(["Eggs expected", int(R(r, "eggs"))], ["Crates expected", plain(Math.round(R(r, "crates") * 100) / 100)], ["Egg sales", money(R(r, "eggRevenue"))], ["Spent hen sales", money(R(r, "spent"))], ["Break-even price per crate", money(R(r, "breakEven"))]);
    else rows.push(["Break-even price per bird", money(R(r, "breakEven"))]);
    rows.push(["Total revenue", money(R(r, "revenue"))], [R(r, "profit") >= 0 ? "Profit for this batch" : "Loss for this batch", money(Math.abs(R(r, "profit"))), tone(r.profit)], ["Profit margin", opt(r.margin, pct)], [`Estimated yearly profit (${plain(R(r, "cycles"))} batches)`, money(R(r, "yearlyProfit")), tone(r.yearlyProfit)], ...whatIfRows(r));
    return { rows, note: "A forecast from your own numbers, not a promise. Feed cost is the total for the batch." };
  },
};

const fishAdapter: Adapter = {
  id: "advanced-fish", name: "Advanced Fish Farm Planner", group: "advanced", premium: true,
  blurb: "Several ponds, any number of fish, mortality, harvest weight and a what-if scenario.",
  fields: [
    num("ponds", "Number of ponds"), num("perPond", "Fish per pond"), num("fingerlingPrice", "Price per fingerling (₦)"), num("feed", "Total feed cost (₦)"), num("med", "Medication / treatment (₦)", true), num("pond", "Pond preparation (₦)", true), num("water", "Water (₦)", true), num("power", "Electricity / pumping (₦)", true), num("labour", "Labour (₦)", true), num("transport", "Transportation (₦)", true), num("other", "Other expenses (₦)", true),
    num("mortality", "Expected mortality (%)", true), num("avgKg", "Average harvest weight per fish (kg)"), num("priceKg", "Selling price per kg (₦)"), ...WHATIF(),
  ],
  run: (v) => advancedFish({ ponds: N(v.ponds), perPond: N(v.perPond), fingerlingPrice: N(v.fingerlingPrice), feed: N(v.feed), med: O(v.med), pond: O(v.pond), water: O(v.water), power: O(v.power), labour: O(v.labour), transport: O(v.transport), other: O(v.other), mortality: O(v.mortality), avgKg: N(v.avgKg), priceKg: N(v.priceKg), whatIfFeed: O(v.whatIfFeed), whatIfPrice: O(v.whatIfPrice), whatIfMortality: S(v.whatIfMortality) }),
  describe: (r): Described => ({
    rows: [["Fish stocked", int(R(r, "fish"))], ["Fish expected to survive", int(R(r, "survivors"))], ["Fingerling purchase", money(R(r, "purchase"))], ["Feed", money(R(r, "feed"))], ["Medication and other costs", money(R(r, "other"))], ["Total cost", money(R(r, "total"))], ["Expected harvest (kg)", plain(Math.round(R(r, "kg") * 100) / 100)], ["Cost per kg", money(R(r, "costPerKg"))], ["Total revenue", money(R(r, "revenue"))],
      [R(r, "profit") >= 0 ? "Profit" : "Loss", money(Math.abs(R(r, "profit"))), tone(r.profit)], ["Profit per pond", money(R(r, "profitPerPond")), tone(r.profitPerPond)], ["Profit margin", opt(r.margin, pct)], ...whatIfRows(r)],
    note: "A forecast from your own numbers, not a promise. Feed cost is the total for the harvest.",
  }),
};

const handworkAdapter: Adapter = {
  id: "advanced-handwork", name: "Advanced Handwork & Service Pricing", group: "advanced", premium: true,
  blurb: "Several materials, workers and costs, wastage and overhead, a deposit and monthly income from repeat jobs.",
  fields: [
    rowsOf("materials", "Materials", "Add material", [text("name", "Material", 80), num("qty", "Quantity", true), num("cost", "Cost each (₦)", true)], 2, 40),
    rowsOf("labour", "Labour (each worker or task)", "Add labour", [text("name", "Worker or task", 80), num("hours", "Hours", true), num("rate", "Rate per hour (₦)", true)], 1, 20),
    rowsOf("extras", "Other costs (transport, fuel, packaging...)", "Add cost", [text("name", "Cost", 80), num("amount", "Amount (₦)", true)], 2, 30),
    num("wastage", "Wastage on materials (%)", true), num("overhead", "Overhead on total direct cost (%)", true),
    sel("method", "How do you want to set your profit?", [["amount", "A fixed profit amount"], ["markup", "Markup (% on top of total cost)"], ["margin", "Profit margin (% of the selling price)"]]),
    num("amount", "Profit you want to make (₦)", false, { key: "method", value: "amount" }), num("markup", "Markup (%)", false, { key: "method", value: "markup" }), num("margin", "Profit margin (%)", false, { key: "method", value: "margin" }),
    num("discount", "Discount to offer (%, optional)", true), num("deposit", "Deposit to collect up front (%, optional)", true), num("sessions", "Jobs like this per month (optional)", true),
  ],
  run: (v) => advancedHandwork({ materials: rowsIn(v.materials), labour: rowsIn(v.labour), extras: rowsIn(v.extras), wastage: O(v.wastage), overhead: O(v.overhead), method: S(v.method), amount: N(v.amount), markup: N(v.markup), margin: N(v.margin), discount: O(v.discount), deposit: O(v.deposit), sessions: O(v.sessions) }),
  describe: (r): Described => {
    const rows: Row[] = [["Recommended selling price", money(R(r, "price"))], ["Materials", money(R(r, "materials"))], ["Wastage", money(R(r, "wastage"))], ["Labour", money(R(r, "labour"))], ["Other costs", money(R(r, "extras"))], ["Overhead", money(R(r, "overhead"))], ["Total cost (break-even price)", money(R(r, "total"))], ["Expected profit", money(R(r, "profit")), tone(r.profit)], ["Profit margin (of selling price)", pct(R(r, "margin"))], ["Markup (on total cost)", pct(R(r, "markup"))]];
    if (r.hasDiscount) rows.push([`Price after ${plain(R(r, "discount"))}% discount`, money(R(r, "after"))], ["Profit after discount", money(R(r, "profitAfter")), tone(r.profitAfter)]);
    if (r.hasDeposit) rows.push(["Deposit to collect", money(R(r, "deposit"))], ["Balance due", money(R(r, "balance"))]);
    if (r.hasSessions) rows.push([`Monthly revenue (${plain(R(r, "sessions"))} jobs)`, money(R(r, "monthlyRevenue"))], ["Monthly cost", money(R(r, "monthlyCost"))], ["Monthly profit", money(R(r, "monthlyProfit")), tone(r.monthlyProfit)]);
    return { rows };
  },
};

export const ADVANCED_ADAPTERS: Adapter[] = [importAdapter, retailAdapter, poultryAdapter, fishAdapter, handworkAdapter];
