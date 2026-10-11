import test from "node:test";
import assert from "node:assert/strict";
import { prepareCalculation } from "../src/lib/calc/prepare";

const form = (o: Record<string, string>) => (n: string) => o[n];
const U = "a1000000-0000-4000-8000-000000000001";

test("valid profit calculation is accepted with defaults", () => {
  const r = prepareCalculation("profit", form({ cost: "800", sell: "1,000" }));
  assert.ok(r.ok);
  if (r.ok) { assert.deepEqual(r.inputs, { cost: "800", sell: "1000" }); assert.equal(r.meta.title, "Profit Calculator"); }
});
test("invalid numbers are refused (never saved)", () => {
  for (const f of [{ cost: "", sell: "1000" }, { cost: "abc", sell: "1000" }, { cost: "-5", sell: "1000" }]) { const r = prepareCalculation("profit", form(f)); assert.ok(!r.ok && r.code === "bad_inputs", JSON.stringify(f)); }
});
test("unknown or non-saveable calculators are refused", () => {
  for (const id of ["nope", "import-landed-cost", "poultry-starter", "fish-starter", "__proto__", ""]) assert.ok(!prepareCalculation(id, form({})).ok, id);
});
test("a browser-supplied result field is ignored", () => {
  const r = prepareCalculation("profit", form({ cost: "800", sell: "1000", result: "999999", profit: "1" }));
  assert.ok(r.ok && !("result" in r.inputs) && !("profit" in r.inputs));
});
test("metadata errors are reported by field", () => {
  const r = prepareCalculation("profit", form({ cost: "1", sell: "2", customer_id: "x'; drop table customers;--" }));
  assert.ok(!r.ok && r.code === "customer_id");
  assert.ok(!prepareCalculation("profit", form({ cost: "1", sell: "2", title: "x".repeat(200) })).ok);
});
test("links and notes pass through", () => {
  const r = prepareCalculation("profit", form({ cost: "1", sell: "2", title: "Ankara", notes: "n", customer_id: U, job_id: U, product_id: U }));
  assert.ok(r.ok && r.meta.title === "Ankara" && r.meta.customer_id === U && r.meta.notes === "n");
});
test("row calculators read posted rows and drop empty ones", () => {
  const r = prepareCalculation("business-expenses", form({ "items.0.name": "Rent", "items.0.amount": "50,000", "items.1.name": "", "items.1.amount": "", "items.2.name": "Transport", "items.2.amount": "12000" }));
  assert.ok(r.ok && (r.inputs.items as unknown[]).length === 2);
});
test("a calculation whose engine result is an error is refused (loan with zero principal)", () => {
  assert.ok(!prepareCalculation("loan", form({ principal: "0", rate: "10", term: "12", unit: "months" })).ok);
});
