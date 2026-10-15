import test from "node:test";
import assert from "node:assert/strict";
import { validateCalcMeta, copyTitle } from "../src/lib/validation/calc-meta";
import { MESSAGES } from "../src/app/messages";

const U = "a1000000-0000-4000-8000-000000000001";
test("blank title falls back to the calculator name; notes trimmed to null", () => {
  const r = validateCalcMeta({ title: "  ", notes: " " }, "Profit Calculator");
  assert.ok(r.ok && r.value.title === "Profit Calculator" && r.value.notes === null && r.value.customer_id === null);
});
test("title and notes limits and control characters", () => {
  assert.equal(validateCalcMeta({ title: "x".repeat(161) }, "F").ok, false);
  assert.equal(validateCalcMeta({ title: "x".repeat(160) }, "F").ok, true);
  assert.equal(validateCalcMeta({ title: "A\u0000B" }, "F").ok, false);
  assert.equal(validateCalcMeta({ notes: "x".repeat(2001) }, "F").ok, false);
  assert.equal(validateCalcMeta({ notes: "line one\nline two" }, "F").ok, true);
});
test("links must be UUIDs and are reported by field", () => {
  const ok = validateCalcMeta({ customer_id: U, job_id: U, product_id: U }, "F"); assert.ok(ok.ok && ok.value.job_id === U);
  for (const k of ["customer_id", "job_id", "product_id"]) { const r = validateCalcMeta({ [k]: "1 or 1=1" }, "F"); assert.ok(!r.ok && k in r.errors, k); }
});
test("special characters are kept as plain text", () => assert.equal(validateCalcMeta({ title: "Ọlá & Sons <b>'x'</b>" }, "F").ok, true));
test("copyTitle respects the 160 limit", () => {
  assert.equal(copyTitle("Wedding"), "Copy of Wedding");
  assert.ok(copyTitle("x".repeat(160)).length <= 160);
});
test("message codes for calculation pages exist", () => {
  for (const c of ["saved", "archived", "restored", "deleted", "duplicated", "bad_inputs", "premium_required", "failed", "title", "notes", "customer_id", "job_id", "product_id"]) assert.ok(MESSAGES[c], c);
});
