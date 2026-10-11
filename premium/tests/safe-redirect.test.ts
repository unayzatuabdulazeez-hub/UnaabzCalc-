import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../src/lib/safe-redirect";
import { MESSAGES } from "../src/app/messages";

test("safeNext allows same-site relative paths", () => { assert.equal(safeNext("/app"), "/app"); assert.equal(safeNext("/reset-password"), "/reset-password"); });
test("safeNext blocks open-redirect attempts", () => {
  for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "evil.test", "", null, undefined, 5, "/ok\nSet-Cookie: x=1"]) assert.equal(safeNext(bad), "/app", String(bad));
});
test("safeNext uses the supplied fallback", () => assert.equal(safeNext("//x", "/login"), "/login"));
test("every message code used by the pages exists", () => {
  for (const c of ["email", "password", "fullName", "credentials", "failed", "check_email", "reset_sent", "password_updated", "link_invalid", "name", "business_type", "phone", "address", "currency", "business_created"]) assert.ok(MESSAGES[c], c);
});
