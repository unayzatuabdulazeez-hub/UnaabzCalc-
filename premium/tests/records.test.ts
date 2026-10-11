import test from "node:test";
import assert from "node:assert/strict";
import { validateCustomer, validateProduct, validateJob, JOB_STATUSES } from "../src/lib/validation/records";
import { isUuid, likeEscape, parseMoney } from "../src/lib/validation/common";
import { MESSAGES } from "../src/app/messages";

const U = "a1000000-0000-4000-8000-000000000001";
test("customer: trims, lowercases email, nulls empty optionals", () => {
  const r = validateCustomer({ name: "  Mrs Ade ", email: " ADE@Example.com ", phone: "", address: "", notes: "" });
  assert.ok(r.ok && r.value.name === "Mrs Ade" && r.value.email === "ade@example.com" && r.value.phone === null);
});
test("customer: rejects bad name, phone, email, long notes, control chars", () => {
  for (const f of [{ name: "" }, { name: "x".repeat(121) }, { name: "A\u0000" }, { name: "A", phone: "abc" }, { name: "A", email: "nope" }, { name: "A", notes: "x".repeat(1001) }]) assert.equal(validateCustomer(f).ok, false, JSON.stringify(f).slice(0, 40));
});
test("customer: multi-line notes and special characters are accepted as plain text", () => {
  assert.equal(validateCustomer({ name: "Ọlá & Sons <b>'x'</b>", notes: "line1\nline2" }).ok, true);
});
test("money: exact decimal strings, commas and naira sign accepted", () => {
  const e: Record<string, string> = {};
  assert.equal(parseMoney("12,000.50", "f", "F", e), "12000.50");
  assert.equal(parseMoney("₦ 2500", "f", "F", e), "2500");
  assert.equal(parseMoney("", "f", "F", e), null);
  assert.deepEqual(e, {});
});
test("money: rejects negatives, 3 decimals, letters, exponent, too large", () => {
  for (const v of ["-1", "1.234", "abc", "1e5", "1000000000000", "1..2", "NaN", "Infinity"]) { const e: Record<string, string> = {}; parseMoney(v, "f", "F", e); assert.ok(e.f, v); }
});
test("product: valid with decimals, invalid with bad price", () => {
  const r = validateProduct({ name: "Ankara", unit: "piece", cost_price: "8,000", selling_price: "12000.5" });
  assert.ok(r.ok && r.value.cost_price === "8000" && r.value.selling_price === "12000.5");
  const bad = validateProduct({ name: "A", cost_price: "-5" }); assert.ok(!bad.ok && "cost_price" in bad.errors);
  assert.equal(validateProduct({ name: "" }).ok, false);
});
test("job: defaults to quote; all statuses accepted; unknown rejected", () => {
  const r = validateJob({ title: "Wedding" }); assert.ok(r.ok && r.value.status === "quote");
  for (const s of JOB_STATUSES) assert.equal(validateJob({ title: "T", status: s }).ok, true, s);
  assert.equal(validateJob({ title: "T", status: "shipped" }).ok, false);
});
test("job: due date must be a real calendar date", () => {
  assert.equal(validateJob({ title: "T", due_date: "2026-12-31" }).ok, true);
  for (const d of ["2026-02-30", "2026-13-01", "31/12/2026", "tomorrow", "2026-1-1"]) assert.equal(validateJob({ title: "T", due_date: d }).ok, false, d);
});
test("job: customer id must be a UUID; amount must be money", () => {
  assert.equal(validateJob({ title: "T", customer_id: U }).ok, true);
  assert.equal(validateJob({ title: "T", customer_id: "1; drop table customers" }).ok, false);
  assert.equal(validateJob({ title: "T", agreed_amount: "250,000" }).ok, true);
  assert.equal(validateJob({ title: "T", agreed_amount: "-1" }).ok, false);
  assert.equal(validateJob({ title: "" }).ok, false);
});
test("isUuid and likeEscape", () => {
  assert.ok(isUuid(U)); assert.ok(!isUuid("abc")); assert.ok(!isUuid(undefined));
  assert.equal(likeEscape("50%_off\\"), "50\\%\\_off\\\\");
});
test("every message code the record pages can raise exists", () => {
  for (const c of ["premium_required", "saved", "archived", "restored", "unit", "notes", "cost_price", "selling_price", "title", "description", "status", "due_date", "agreed_amount", "customer_id", "name", "phone", "email", "address", "failed"]) assert.ok(MESSAGES[c], c);
});
