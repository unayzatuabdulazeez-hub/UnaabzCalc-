import type { Inputs } from "../src/lib/calc/adapters";
/** One valid input set for every saveable calculator (used by the export tests and the sample-file generator). */
export const SAMPLES: Record<string, Inputs> = {
  basic: { expression: "50+10%" },
  percentage: { mode: "change", a: "100", b: "125" },
  profit: { cost: "800", sell: "1000" },
  discount: { price: "10,000", pct: "15" },
  "retail-pricing": { cost: "1000", expenses: "", mode: "markup", value: "30", discount: "10" },
  "target-profit": { cost: "500", profit: "100000", fixed: "20000", units: "200", price: "" },
  "business-expenses": { items: [{ name: "Rent", amount: "50,000" }, { name: "Transport", amount: "12000" }, { name: "=HYPERLINK(\"http://evil.test\",\"x\")", amount: "1500.50" }] },
  "multiple-products": { items: [{ name: "A", qty: "10", cost: "100", sell: "150" }, { name: "B", qty: "5", cost: "200", sell: "180" }] },
  loan: { principal: "1,000,000", rate: "12", term: "12", unit: "months" },
  "loan-repayment": { principal: "500000", rate: "0", term: "1", unit: "years", freq: "monthly" },
  "handwork-pricing": { materials: [{ name: "Ankara", qty: "2", cost: "3000" }], labourMode: "total", labour: "8000", transport: "1000", fuel: "", packaging: "", other: "", wastage: "800", method: "margin", margin: "20", discount: "" },
  "advanced-import": { rate: "1500", rate2: "1600", basis: "value", shipping: "100000", clearing: "50000", transport: "20000", bank: "5000", other: "5000",
    rows: [{ name: "Phone cases", qty: "100", cost: "2", weight: "", cbm: "", duty: "10", price: "6000" }, { name: "Chargers", qty: "50", cost: "5", weight: "", cbm: "", duty: "5", price: "12000" }] },
  "advanced-retail-pricing": { mode: "markup", value: "30", tax: "7.5", discount: "10", step: "50", rows: [{ name: "Shirt", cost: "2000", expenses: "100", own: "" }, { name: "Shoes", cost: "5000", expenses: "", own: "40" }] },
  "advanced-poultry": { kind: "broiler", count: "500", chickPrice: "600", feed: "1,200,000", med: "50000", bedding: "20000", utilities: "15000", labour: "60000", transport: "10000", other: "5000", mortality: "5", price: "4500", cycles: "4", whatIfFeed: "10", whatIfPrice: "", whatIfMortality: "" },
  "advanced-fish": { ponds: "2", perPond: "500", fingerlingPrice: "40", feed: "800000", med: "20000", pond: "30000", water: "10000", power: "40000", labour: "60000", transport: "20000", other: "10000", mortality: "10", avgKg: "1", priceKg: "2500", whatIfFeed: "", whatIfPrice: "20", whatIfMortality: "" },
  "advanced-handwork": { materials: [{ name: "Ankara", qty: "2", cost: "3000" }], labour: [{ name: "Tailor", hours: "10", rate: "1500" }], extras: [{ name: "Transport", amount: "1000" }], wastage: "10", overhead: "5", method: "margin", margin: "30", discount: "", deposit: "50", sessions: "8" },
  "general-estimate": { rows: [{ desc: "Cement", unit: "bag", qty: "20", rate: "5500", cost: "4800" }, { desc: "Labour", unit: "job", qty: "1", rate: "50000", cost: "40000" }], discount: "5", charges: "2000", tax: "7.5", deposit: "50" },
  "electrical-estimator": { wiring: [{ item: "2.5mm cable", unit: "roll", qty: "5", rate: "38000" }], conduit: [], points: [{ item: "Socket", unit: "pc", qty: "20", rate: "1500" }], board: [], labour: [{ item: "Electrician", unit: "day", qty: "5", rate: "15000" }], other: [], wastage: "5", contingency: "10", overhead: "", profit: "10", tax: "", deposit: "30", area: "100", weeks: "2", milestones: [{ name: "Start", pct: "50" }, { name: "Completion", pct: "50" }] },
  "building-estimator": { site: [], walls: [{ item: "Blocks", unit: "pc", qty: "3000", rate: "450" }], roof: [], finish: [{ item: "Paint", unit: "bucket", qty: "20", rate: "12000" }], openings: [], services: [], labour: [{ item: "Mason", unit: "lot", qty: "1", rate: "800000" }], other: [], wastage: "5", contingency: "5", overhead: "10", profit: "15", tax: "7.5", deposit: "20", area: "80", weeks: "12", milestones: [{ name: "Start", pct: "40" }, { name: "Roofing", pct: "30" }, { name: "Handover", pct: "30" }] },
};
