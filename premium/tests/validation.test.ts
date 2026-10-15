import test from "node:test";
import assert from "node:assert/strict";
import { validateRegister, validateLogin, validateEmail, validatePassword, PASSWORD_MIN } from "../src/lib/validation/auth";
import { validateBusiness } from "../src/lib/validation/business";

test("email: normalised to lowercase and trimmed", () => { const r = validateEmail("  Ada@Example.COM "); assert.ok(r.ok && r.value === "ada@example.com"); });
test("email: rejects invalid forms", () => { for (const e of ["", "x", "a@b", "a b@c.com", "a@b.c", "@x.com", 5, null, undefined, "a@b.com\nx@y.com", "a".repeat(250) + "@x.com"]) assert.equal(validateEmail(e).ok, false, String(e)); });
test("password: length bounds", () => {
  assert.equal(validatePassword("a".repeat(PASSWORD_MIN - 1)).ok, false);
  assert.equal(validatePassword("a".repeat(PASSWORD_MIN)).ok, true);
  assert.equal(validatePassword("a".repeat(72)).ok, true);
  assert.equal(validatePassword("a".repeat(73)).ok, false);
  assert.equal(validatePassword("é".repeat(40)).ok, false, "80 bytes must be rejected");
  assert.equal(validatePassword(" ".repeat(12)).ok, false);
  assert.equal(validatePassword(undefined).ok, false);
});
test("register: happy path and optional name", () => {
  const r = validateRegister({ email: "a@b.co", password: "correct-horse-1", fullName: "  Ada  " });
  assert.ok(r.ok); if (r.ok) { assert.equal(r.value.fullName, "Ada"); assert.equal(r.value.email, "a@b.co"); }
  const r2 = validateRegister({ email: "a@b.co", password: "correct-horse-1" }); assert.ok(r2.ok && r2.value.fullName === null);
});
test("register: reports every problem at once", () => { const r = validateRegister({ email: "bad", password: "short" }); assert.ok(!r.ok && "email" in r.errors && "password" in r.errors); });
test("register: rejects control characters in name and over-long name", () => {
  assert.equal(validateRegister({ email: "a@b.co", password: "correct-horse-1", fullName: "A\u0000B" }).ok, false);
  assert.equal(validateRegister({ email: "a@b.co", password: "correct-horse-1", fullName: "x".repeat(121) }).ok, false);
});
test("login: does not enforce password length (so old passwords still work) but requires one", () => {
  assert.equal(validateLogin({ email: "a@b.co", password: "x" }).ok, true);
  assert.equal(validateLogin({ email: "a@b.co", password: "" }).ok, false);
});
test("business: defaults currency to NGN and trims", () => {
  const r = validateBusiness({ name: "  Ada Fabrics ", currency: "" }); assert.ok(r.ok && r.value.name === "Ada Fabrics" && r.value.currency === "NGN");
});
test("business: name required, bounded, no control chars", () => {
  assert.equal(validateBusiness({ name: "   " }).ok, false);
  assert.equal(validateBusiness({ name: "x".repeat(121) }).ok, false);
  assert.equal(validateBusiness({ name: "A\u0007B" }).ok, false);
  assert.equal(validateBusiness({ name: "x".repeat(120) }).ok, true);
});
test("business: phone and currency checks", () => {
  assert.equal(validateBusiness({ name: "A", phone: "0803 123 4567" }).ok, true);
  assert.equal(validateBusiness({ name: "A", phone: "+234 803 123 4567" }).ok, true);
  assert.equal(validateBusiness({ name: "A", phone: "abc" }).ok, false);
  assert.equal(validateBusiness({ name: "A", currency: "naira" }).ok, false);
  const r = validateBusiness({ name: "A", currency: "ngn" }); assert.ok(r.ok && r.value.currency === "NGN");
});
test("business: special characters and unicode names are accepted as plain data", () => {
  assert.equal(validateBusiness({ name: "Ọlá & Sons <Fabrics> 'Ltd'" }).ok, true);
});
