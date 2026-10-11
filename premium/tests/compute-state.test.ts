import test from "node:test";
import assert from "node:assert/strict";
import { computeFromForm, computeState } from "../src/lib/calc/prepare";

const form = (o: Record<string, string>) => (n: string) => o[n];
test("good numbers give ok + a view whose totals match the engine", () => {
  const s = computeFromForm("profit", form({ cost: "800", sell: "1,000" }));
  assert.equal(s.status, "ok");
  if (s.status === "ok") { assert.deepEqual(s.flat, { cost: "800", sell: "1000" }); assert.equal(s.view.rows[0]![0], "Profit"); assert.equal(s.view.rows[0]![1], "₦200.00"); }
});
test("bad numbers give an error and keep what the user typed", () => {
  const s = computeFromForm("profit", form({ cost: "abc", sell: "1000" }));
  assert.equal(s.status, "error");
  assert.equal(s.flat.cost, "abc");
  assert.ok(s.status === "error" && s.error.length > 0);
});
test("unknown calculator is an error, not a crash", () => assert.equal(computeFromForm("nope", form({})).status, "error"));
test("stored inputs can be recomputed (reopen)", () => {
  const s = computeState("loan", { principal: "500000", rate: "12", term: "12", unit: "months" });
  assert.equal(s.status, "ok");
});
test("state is JSON-serialisable (it is sent to the browser)", () => {
  const s = computeFromForm("loan-repayment", form({ principal: "500000", rate: "12", term: "12", unit: "months", freq: "monthly" }));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});
