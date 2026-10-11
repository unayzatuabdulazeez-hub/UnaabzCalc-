/**
 * The three estimators. Every quantity and rate is typed in by the user: there are no built-in prices, tax rates or building
 * standards. The maths is in premium-engine.ts (generalEstimate, sectionEstimate). Preview and save need Premium.
 */
import { generalEstimate, sectionEstimate, type SectionDef } from "./premium-engine";
import { O, money, num, pct, plain, rowsIn, rowsOf, text, tone, type Adapter, type Described, type Field, type Tone } from "./kit";
import type { CalcResult } from "./engine";

type Row = [string, string, Tone?];
const R = (r: CalcResult, k: string) => r[k] as number;
const NOTE = "This is an estimate from the quantities and rates you entered, not a quotation or an engineering design. Check with a qualified professional before you build or order materials.";

const generalAdapter: Adapter = {
  id: "general-estimate", name: "General Estimate", group: "estimator", premium: true,
  blurb: "A priced list of items for any job: quantities, rates, discount, extra charges, tax and deposit.",
  fields: [
    rowsOf("rows", "Items", "Add item", [text("desc", "Description", 120), text("unit", "Unit", 20), num("qty", "Quantity", true), num("rate", "Rate each (₦)", true), num("cost", "Your cost each (₦, optional)", true)], 4, 60),
    num("discount", "Discount (%, optional)", true), num("charges", "Extra charges such as delivery (₦, optional)", true), num("tax", "Tax (%, optional)", true), num("deposit", "Deposit (%, optional)", true),
  ],
  run: (v) => generalEstimate({ rows: rowsIn(v.rows), discount: O(v.discount), charges: O(v.charges), tax: O(v.tax), deposit: O(v.deposit) }),
  describe: (r): Described => {
    const lines = (r.lines as { desc: string; unit: string; qty: number; rate: number; amount: number }[]) ?? [];
    const rows: Row[] = [["Subtotal", money(R(r, "subtotal"))]];
    if (r.hasDiscount) rows.push(["Discount", money(-R(r, "discount"))]);
    if (R(r, "charges") > 0) rows.push(["Extra charges", money(R(r, "charges"))]);
    if (r.hasTax) rows.push(["Tax", money(R(r, "tax"))]);
    rows.push(["Total", money(R(r, "total"))]);
    if (r.hasDeposit) rows.push(["Deposit", money(R(r, "deposit"))], ["Balance", money(R(r, "balance"))]);
    if (typeof r.cost === "number") rows.push(["Your total cost", money(r.cost)], ["Expected profit (before tax)", money(R(r, "profit")), tone(r.profit)], ["Profit margin", typeof r.margin === "number" ? pct(r.margin) : "—"]);
    return { rows, note: NOTE, table: { head: ["Item", "Unit", "Qty", "Rate", "Amount"], body: lines.map((l) => [l.desc, l.unit || "—", plain(l.qty), money(l.rate), money(l.amount)]) } };
  },
};

const sectionFields = (secs: { key: string; label: string }[]): Field[] => [
  ...secs.map((s) => rowsOf(s.key, s.label, "Add item", [text("item", "Item", 100), text("unit", "Unit", 20), num("qty", "Quantity", true), num("rate", "Rate each (₦)", true)], 2, 30)),
  num("wastage", "Wastage on materials (%, optional)", true), num("contingency", "Contingency (%, optional)", true), num("overhead", "Overhead (%, optional)", true), num("profit", "Profit on top of cost (%, optional)", true), num("tax", "Tax (%, optional)", true), num("deposit", "Deposit (%, optional)", true),
  num("area", "Floor or work area in m² (optional, to show cost per m²)", true), num("weeks", "Project length in weeks (optional)", true),
  rowsOf("milestones", "Payment milestones (optional; must add up to 100%)", "Add payment", [text("name", "Payment", 60), num("pct", "Percent of total", true)], 3, 12),
];

function sectionAdapter(id: string, name: string, blurb: string, secs: { key: string; label: string; materials: boolean }[]): Adapter {
  return {
    id, name, group: "estimator", premium: true, blurb, fields: sectionFields(secs),
    run: (v) => sectionEstimate({
      sections: secs.map((s): SectionDef => ({ key: s.key, label: s.label, materials: s.materials, rows: rowsIn(v[s.key]) })),
      wastage: O(v.wastage), contingency: O(v.contingency), overhead: O(v.overhead), profit: O(v.profit), tax: O(v.tax), deposit: O(v.deposit), area: O(v.area), weeks: O(v.weeks), milestones: rowsIn(v.milestones),
    }),
    describe: (r): Described => {
      const subs = (r.subs as { label: string; count: number; amount: number }[]) ?? [];
      const lines = (r.lines as { section: string; item: string; unit: string; qty: number; rate: number; amount: number }[]) ?? [];
      const ms = (r.milestones as { name: string; percent: number; amount: number }[]) ?? [];
      const rows: Row[] = subs.filter((s) => s.count > 0).map((s): Row => [s.label, money(s.amount)]);
      if (R(r, "wastage") > 0) rows.push(["Wastage allowance", money(R(r, "wastage"))]);
      if (R(r, "contingency") > 0) rows.push(["Contingency", money(R(r, "contingency"))]);
      if (R(r, "overhead") > 0) rows.push(["Overhead", money(R(r, "overhead"))]);
      rows.push(["Total cost", money(R(r, "cost"))]);
      if (R(r, "profit") > 0) rows.push(["Profit", money(R(r, "profit"))]);
      rows.push(["Price before tax", money(R(r, "price"))]);
      if (r.hasTax) rows.push(["Tax", money(R(r, "tax"))]);
      rows.push(["Total", money(R(r, "total"))]);
      if (r.hasDeposit) rows.push(["Deposit", money(R(r, "deposit"))], ["Balance", money(R(r, "balance"))]);
      if (typeof r.perM2 === "number") rows.push(["Cost per m²", money(r.perM2)]);
      if (typeof r.perWeek === "number") rows.push(["Cost per week", money(r.perWeek)]);
      for (const m of ms) rows.push([`${m.name} (${plain(m.percent)}%)`, money(m.amount)]);
      return { rows, note: NOTE, table: { head: ["Section", "Item", "Unit", "Qty", "Rate", "Amount"], body: lines.map((l) => [l.section, l.item, l.unit || "—", plain(l.qty), money(l.rate), money(l.amount)]) } };
    },
  };
}

const electrical = sectionAdapter("electrical-estimator", "Electrical Estimator", "Cables, conduit, points, boards and labour for a wiring job. Quantities and rates are yours.", [
  { key: "wiring", label: "Cables and wiring", materials: true }, { key: "conduit", label: "Conduit, trunking and fittings", materials: true },
  { key: "points", label: "Sockets, switches and light points", materials: true }, { key: "board", label: "Distribution board, breakers and earthing", materials: true },
  { key: "labour", label: "Labour", materials: false }, { key: "other", label: "Transport and other costs", materials: false },
]);
const building = sectionAdapter("building-estimator", "Building & Project Estimator", "Foundation to finishes with wastage, contingency, overhead, profit, tax and payment milestones.", [
  { key: "site", label: "Site preparation and foundation", materials: true }, { key: "walls", label: "Walling and structure", materials: true },
  { key: "roof", label: "Roofing and ceiling", materials: true }, { key: "finish", label: "Plastering, painting and finishes", materials: true },
  { key: "openings", label: "Doors and windows", materials: true }, { key: "services", label: "Plumbing and electrical", materials: true },
  { key: "labour", label: "Labour", materials: false }, { key: "other", label: "Transport, permits and other costs", materials: false },
]);

export const ESTIMATOR_ADAPTERS: Adapter[] = [generalAdapter, electrical, building];

