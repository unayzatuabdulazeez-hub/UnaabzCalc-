import test from "node:test";
import assert from "node:assert/strict";
import { PAGE_SIZE, USER_FILTERS, WEBHOOK_FILTERS, listHref, pageInfo, parseListParams, validateAdminAction } from "../src/lib/admin/params";
import { lagosDateTime, lagosDay, parseAdminStats } from "../src/lib/admin/stats";

test("list params: defaults", () => {
  assert.deepEqual(parseListParams({}, USER_FILTERS), { q: "", filter: "all", page: 1, offset: 0, limit: PAGE_SIZE });
  assert.equal(parseListParams({}, WEBHOOK_FILTERS).filter, "problems", "the first filter of each list is its default");
});
test("list params: filter must be on the fixed list", () => {
  for (const bad of ["; drop table", "ALL", "premium_now ", "", "__proto__", ["x"], undefined]) assert.equal(parseListParams({ filter: bad as never }, USER_FILTERS).filter, "all", String(bad));
  assert.equal(parseListParams({ filter: "paying" }, USER_FILTERS).filter, "paying");
  assert.equal(parseListParams({ filter: ["paying", "free"] }, USER_FILTERS).filter, "paying", "first value wins");
});
test("list params: search text is trimmed, capped at 100, control characters removed", () => {
  assert.equal(parseListParams({ q: "  ann  " }, USER_FILTERS).q, "ann");
  assert.equal(parseListParams({ q: "x".repeat(500) }, USER_FILTERS).q.length, 100);
  assert.equal(parseListParams({ q: "a\u0000b\nc\u007fd" }, USER_FILTERS).q, "a b c d");
  assert.equal(parseListParams({ q: ["a", "b"] }, USER_FILTERS).q, "a");
});
test("list params: page must be a plain whole number from 1 to 10,000", () => {
  const pg = (v: unknown) => parseListParams({ page: v as never }, USER_FILTERS);
  assert.equal(pg("3").page, 3); assert.equal(pg("3").offset, 2 * PAGE_SIZE);
  for (const bad of ["0", "-1", "1.5", "abc", "1e3", " 2", "2 ", "99999999", "", undefined, "0x10", "+3"]) assert.equal(pg(bad).page === 1 || pg(bad).page === 10_000, true, String(bad));
  assert.equal(pg("0").page, 1); assert.equal(pg("-1").page, 1); assert.equal(pg("1.5").page, 1); assert.equal(pg("1e3").page, 1);
  assert.equal(pg("99999").page, 10_000);
  assert.equal(pg("99999999").page, 1, "more than 5 digits is treated as invalid, never as a huge offset");
});
test("page info", () => {
  assert.deepEqual(pageInfo(0, 1), { total: 0, pages: 1, from: 0, to: 0, hasPrev: false, hasNext: false });
  assert.deepEqual(pageInfo(26, 1), { total: 26, pages: 2, from: 1, to: 25, hasPrev: false, hasNext: true });
  assert.deepEqual(pageInfo(26, 2), { total: 26, pages: 2, from: 26, to: 26, hasPrev: true, hasNext: false });
  assert.deepEqual(pageInfo(25, 1), { total: 25, pages: 1, from: 1, to: 25, hasPrev: false, hasNext: false });
  assert.equal(pageInfo(Number.NaN, 1).total, 0); assert.equal(pageInfo(-5, 1).total, 0);
  assert.equal(pageInfo(10, 9).from <= 10, true, "a page beyond the end never reports a from past the total");
});
test("links keep search and filter, and leave defaults out", () => {
  assert.equal(listHref("/app/admin/users", {}, "all"), "/app/admin/users");
  assert.equal(listHref("/app/admin/users", { q: "ann o'neil&x=1", filter: "paying", page: 3 }, "all"), "/app/admin/users?q=ann+o%27neil%26x%3D1&filter=paying&page=3");
  assert.equal(listHref("/app/admin/users", { filter: "all", page: 1 }, "all"), "/app/admin/users");
  assert.ok(!listHref("/p", { q: "<script>" }, "all").includes("<"), "special characters are encoded");
});
test("admin actions: a reason is always required", () => {
  for (const kind of ["grant", "revoke", "end"] as const) {
    for (const bad of [{}, { reason: "" }, { reason: "  " }, { reason: "ab" }, { reason: "x".repeat(501) }, { reason: 5 }, { reason: null }]) assert.deepEqual(validateAdminAction(kind, { ...bad, days: "30" }), { ok: false, code: "admin_reason" }, kind + JSON.stringify(bad).slice(0, 30));
    assert.equal(validateAdminAction(kind, { reason: "Refunded, ticket 41", days: "30" }).ok, true);
  }
  assert.equal((validateAdminAction("end", { reason: "a\u0000b\nc" }) as { reason: string }).reason, "a b c");
});
test("admin actions: grant needs a whole number of days from 1 to 365", () => {
  for (const bad of [undefined, "", "0", "366", "-5", "1.5", "abc", "1e2", "5 5", "9999", 30]) assert.deepEqual(validateAdminAction("grant", { reason: "gift", days: bad }), { ok: false, code: "admin_days" }, String(bad));
  assert.deepEqual(validateAdminAction("grant", { reason: "gift", days: "1" }), { ok: true, reason: "gift", days: 1 });
  assert.deepEqual(validateAdminAction("grant", { reason: "gift", days: "365" }), { ok: true, reason: "gift", days: 365 });
  assert.equal("days" in (validateAdminAction("revoke", { reason: "gift", days: "30" }) as object), false, "days only matter for a grant");
});
test("stats: reads good data and never produces NaN from bad data", () => {
  const s = parseAdminStats({ users_total: 9, premium_now: "4", revenue_kobo_all: 1499700, by_status: { free: 4, "bad key!": 2, premium: "x" }, revenue_by_month: [{ month: "2026-10", amount_kobo: 499900 }, { month: "oops", amount_kobo: 1 }, null], generated_at: "2026-10-11T10:00:00Z" });
  assert.equal(s.users_total, 9); assert.equal(s.premium_now, 4); assert.equal(s.revenue_kobo_all, 1499700); assert.equal(s.signups_7d, 0);
  assert.deepEqual(s.byStatus, { free: 4, premium: 0 }); assert.deepEqual(s.revenueByMonth, [{ month: "2026-10", amountKobo: 499900 }]);
  assert.equal(s.generatedAt, "2026-10-11T10:00:00Z");
  for (const junk of [null, undefined, 5, "x", [], { users_total: Number.NaN, premium_now: Infinity, paying_now: -0 }]) { const t = parseAdminStats(junk); for (const v of Object.values(t)) if (typeof v === "number") assert.ok(Number.isFinite(v)); }
  assert.equal(parseAdminStats({ generated_at: "not a date" }).generatedAt, null);
});
test("Lagos dates: UTC+1 all year", () => {
  assert.equal(lagosDay("2026-10-11T23:30:00Z"), "2026-10-12", "23:30 UTC is already the next day in Lagos");
  assert.equal(lagosDay("2026-10-11T22:59:59Z"), "2026-10-11");
  assert.equal(lagosDateTime("2026-01-01T00:00:00Z"), "2026-01-01 01:00");
  assert.equal(lagosDay(null), ""); assert.equal(lagosDay("junk"), ""); assert.equal(lagosDateTime(undefined), "");
});
