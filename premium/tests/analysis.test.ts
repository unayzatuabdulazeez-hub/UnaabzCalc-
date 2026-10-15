/** Business analysis. Expected numbers were worked out by hand (see comments). Money is compared in whole kobo. */
import test from "node:test";
import assert from "node:assert/strict";
import { analyse, kobo, lagosDay, lagosMonth, type AnalysisInput, type JobRow } from "../src/lib/analysis/business";

const NOW = new Date("2026-10-10T19:00:00Z"); // 20:00 in Lagos, same day
const job = (id: string, o: Partial<JobRow>): JobRow => ({ id, title: id, status: "quote", due_date: null, agreed_amount: null, customer_id: null, created_at: "2026-10-01T09:00:00Z", archived_at: null, ...o });
const DATA: AnalysisInput = {
  now: NOW,
  customers: [{ id: "A", name: "Ade", archived_at: null }, { id: "B", name: "Bola", archived_at: null }, { id: "C", name: "Chi", archived_at: null }, { id: "D", name: "Old", archived_at: "2026-01-01T00:00:00Z" }],
  jobs: [
    job("J1", { status: "quote", agreed_amount: 100000.1, due_date: "2026-10-09", customer_id: "A", created_at: "2026-10-02T09:00:00Z" }),
    job("J2", { status: "quote", agreed_amount: "50000.20", due_date: "2026-10-12", customer_id: "A", created_at: "2026-10-05T09:00:00Z" }),
    job("J3", { status: "in_progress", agreed_amount: 200000, due_date: "2026-10-10", customer_id: "B", created_at: "2026-09-15T09:00:00Z" }),
    job("J4", { status: "completed", agreed_amount: 300000.3, customer_id: "B", created_at: "2026-08-31T23:30:00Z" }), // 00:30 on 1 Sep in Lagos
    job("J5", { status: "cancelled", agreed_amount: 999999, customer_id: "A" }),
    job("J6", { status: "in_progress" }),
    job("J7", { status: "quote", agreed_amount: 77, archived_at: "2026-10-01T00:00:00Z" }),
    job("J8", { status: "quote", agreed_amount: 1, due_date: "2026-10-18" }),
    job("J9", { status: "completed", due_date: "2026-01-01", created_at: "2026-01-02T09:00:00Z" }),
  ],
  products: [
    { id: "P1", name: "Good", cost_price: 600, selling_price: 1000, archived_at: null },
    { id: "P2", name: "Loss", cost_price: 1200, selling_price: 1000, archived_at: null },
    { id: "P3", name: "NoCost", cost_price: null, selling_price: 500, archived_at: null },
    { id: "P4", name: "NoPrice", cost_price: 10, selling_price: 0, archived_at: null },
    { id: "P5", name: "Gone", cost_price: 1, selling_price: 2, archived_at: "2026-01-01T00:00:00Z" },
  ],
  calculations: [
    { id: "c1", calculator_id: "profit", title: "a", created_at: "2026-10-03T09:00:00Z", archived_at: null },
    { id: "c2", calculator_id: "profit", title: "b", created_at: "2026-09-03T09:00:00Z", archived_at: null },
    { id: "c3", calculator_id: "profit", title: "c", created_at: "2026-09-04T09:00:00Z", archived_at: null },
    { id: "c4", calculator_id: "loan", title: "d", created_at: "2026-10-04T09:00:00Z", archived_at: null },
    { id: "c5", calculator_id: "profit", title: "e", created_at: "2026-10-04T09:00:00Z", archived_at: "2026-10-05T00:00:00Z" },
  ],
};
const A = analyse(DATA);

test("Lagos days and months: UTC evening rolls into the next Lagos day", () => {
  assert.equal(lagosDay(new Date("2026-10-10T22:59:59Z")), "2026-10-10");
  assert.equal(lagosDay(new Date("2026-10-10T23:00:00Z")), "2026-10-11");
  assert.equal(lagosMonth("2026-08-31T23:30:00Z"), "2026-09");
  assert.equal(analyse({ ...DATA, now: new Date("2026-10-10T23:30:00Z") }).today, "2026-10-11");
});
test("kobo: exact integers from numbers and strings; junk is null", () => {
  assert.equal(kobo(100000.1), 10000010); assert.equal(kobo("50000.20"), 5000020); assert.equal(kobo(0.1 + 0.2), 30); assert.equal(kobo(null), null); assert.equal(kobo("abc"), null); assert.equal(kobo(""), null); assert.equal(kobo(Infinity), null);
});
test("counts ignore archived rows and report how many are archived", () => {
  assert.deepEqual(A.counts, { customers: 3, products: 4, jobs: 8, calculations: 4, archivedJobs: 1, archivedCustomers: 1, archivedProducts: 1, archivedCalculations: 1 });
});
test("values by status are exact: quotes 150,001.30; in progress 200,000.00; completed 300,000.30; cancelled kept apart", () => {
  assert.equal(A.quoteValueKobo, 15000130); assert.equal(A.inProgressValueKobo, 20000000); assert.equal(A.completedValueKobo, 30000030); assert.equal(A.openValueKobo, 35000130);
  const c = A.byStatus.find((s) => s.status === "cancelled")!; assert.equal(c.count, 1); assert.equal(c.valueKobo, 99999900);
  const ip = A.byStatus.find((s) => s.status === "in_progress")!; assert.equal(ip.count, 2); assert.equal(ip.withAmount, 1);
});
test("overdue, due soon, no due date: only OPEN jobs count; today is due soon; 8 days away is neither", () => {
  assert.deepEqual(A.overdue.map((d) => [d.id, d.days]), [["J1", -1]]);
  assert.deepEqual(A.dueSoon.map((d) => [d.id, d.days]), [["J3", 0], ["J2", 2]]);
  assert.equal(A.noDueDate, 1); // J6 (J8 has a due date; completed J9 is not open)
  assert.equal(analyse({ ...DATA, now: new Date("2026-10-10T23:30:00Z") }).overdue.length, 2, "on 11 Oct (Lagos) J3 is also overdue");
});
test("jobs without an amount or a customer are counted, never treated as zero value in averages", () => {
  assert.equal(A.jobsWithoutAmount, 2); assert.equal(A.jobsWithoutCustomer, 3);
});
test("top customers by value of non-cancelled jobs; customers with no jobs; archived customers excluded", () => {
  assert.deepEqual(A.topCustomers.map((c) => [c.name, c.jobs, c.valueKobo]), [["Bola", 2, 50000030], ["Ade", 2, 15000030]]);
  assert.equal(A.customersWithoutJobs, 1);
});
test("products: margin on selling price, markup on cost; below cost; unpriced; averages", () => {
  const p = A.products;
  assert.equal(p.priced, 2); assert.equal(p.unpriced, 2);
  assert.deepEqual(p.belowCost.map((x) => x.name), ["Loss"]);
  assert.equal(p.lowest[0]!.marginPct, -20); assert.ok(Math.abs(p.lowest[0]!.markupPct - (-200 / 12)) < 1e-9);
  assert.ok(Math.abs(p.lowest[1]!.marginPct - 40) < 1e-9); assert.ok(Math.abs(p.lowest[1]!.markupPct - 200 / 3) < 1e-9);
  assert.ok(Math.abs(p.averageMarginPct! - 10) < 1e-9);
});
test("no priced products: averages are null, not 0 or NaN", () => {
  const r = analyse({ ...DATA, products: [] }).products; assert.equal(r.averageMarginPct, null); assert.equal(r.averageMarkupPct, null);
});
test("calculations by type ignore archived ones", () => { assert.deepEqual(A.calculationsByType, [{ calculator_id: "profit", count: 3 }, { calculator_id: "loan", count: 1 }]); });
test("last six Lagos months, oldest first, empty months included; month boundary uses Lagos time", () => {
  assert.deepEqual(A.months.map((m) => m.month), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  const sep = A.months[4]!, oct = A.months[5]!;
  assert.deepEqual([sep.jobs, sep.valueKobo, sep.calculations], [2, 50000030, 2]); // J3 + J4 (J4 is 1 Sep in Lagos)
  assert.deepEqual([oct.jobs, oct.valueKobo, oct.calculations], [4, 15000130, 2]);  // J1, J2, J6, J8; cancelled/archived excluded
  assert.equal(A.months[3]!.jobs, 0);
});
test("empty business: everything is zero or empty and nothing is NaN", () => {
  const E = analyse({ jobs: [], customers: [], products: [], calculations: [], now: NOW });
  assert.equal(E.openValueKobo, 0); assert.equal(E.overdue.length, 0); assert.equal(E.topCustomers.length, 0); assert.equal(E.months.length, 6);
  assert.ok(!/NaN/.test(JSON.stringify(E)));
});
test("year boundary: January looks back into the previous year", () => {
  const J = analyse({ ...DATA, now: new Date("2027-01-15T10:00:00Z") });
  assert.deepEqual(J.months.map((m) => m.month), ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
});
