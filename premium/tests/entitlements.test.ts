import test from "node:test";
import assert from "node:assert/strict";
import { resolveEntitlement, ENTITLEMENT_STATUSES, type EntitlementRow } from "../src/lib/entitlements/resolve";
import { canStartTrial, TRIAL_OFFERS_ENABLED } from "../src/lib/config/features";

const NOW = new Date("2026-10-09T12:00:00Z");
const d = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();
const row = (o: Partial<EntitlementRow>): EntitlementRow => ({
  status: "free", trial_start: null, trial_end: null, subscription_start: null, subscription_end: null, payment_status: "none", ...o,
});
const r = (o: Partial<EntitlementRow>) => resolveEntitlement(row(o), NOW);

test("no row fails closed", () => { const x = resolveEntitlement(null, NOW); assert.equal(x.hasPremium, false); assert.equal(x.showAds, true); });
test("undefined row fails closed", () => assert.equal(resolveEntitlement(undefined, NOW).hasPremium, false));
test("unknown status fails closed", () => assert.equal(r({ status: "admin" }).hasPremium, false));
test("free has no premium and sees ads", () => { const x = r({}); assert.equal(x.hasPremium, false); assert.equal(x.showAds, true); });
test("expired has no premium", () => assert.equal(r({ status: "expired" }).hasPremium, false));

test("premium: paid + future end = premium, no ads", () => {
  const x = r({ status: "premium", payment_status: "paid", subscription_start: d(-10), subscription_end: d(20) });
  assert.equal(x.hasPremium, true); assert.equal(x.showAds, false); assert.equal(x.effective, "premium");
});
test("premium: unpaid status is NOT premium (browser/webhook lag cannot unlock)", () => {
  for (const p of ["none", "pending", "failed", "refunded"]) assert.equal(r({ status: "premium", payment_status: p, subscription_end: d(20) }).hasPremium, false, p);
});
test("premium: end date passed -> expired", () => {
  const x = r({ status: "premium", payment_status: "paid", subscription_end: d(-1) });
  assert.equal(x.hasPremium, false); assert.equal(x.effective, "expired");
});
test("premium: end exactly now -> expired (boundary)", () => assert.equal(r({ status: "premium", payment_status: "paid", subscription_end: NOW.toISOString() }).hasPremium, false));
test("premium: missing end date not honoured", () => assert.equal(r({ status: "premium", payment_status: "paid" }).hasPremium, false));
test("premium: not started yet not honoured", () => assert.equal(r({ status: "premium", payment_status: "paid", subscription_start: d(1), subscription_end: d(30) }).hasPremium, false));
test("premium: garbage end date not honoured", () => assert.equal(r({ status: "premium", payment_status: "paid", subscription_end: "not-a-date" }).hasPremium, false));

test("trial: active", () => { const x = r({ status: "trial", trial_start: d(-1), trial_end: d(2) }); assert.equal(x.hasPremium, true); assert.equal(x.showAds, false); });
test("trial: ended", () => { const x = r({ status: "trial", trial_start: d(-5), trial_end: d(-1) }); assert.equal(x.hasPremium, false); assert.equal(x.effective, "expired"); });
test("trial: no end date not honoured", () => assert.equal(r({ status: "trial", trial_start: d(-1) }).hasPremium, false));
test("trial: not started", () => assert.equal(r({ status: "trial", trial_start: d(1), trial_end: d(4) }).hasPremium, false));

test("founding_member: open-ended is premium", () => assert.equal(r({ status: "founding_member" }).hasPremium, true));
test("founding_member: with future end is premium, past end is not", () => {
  assert.equal(r({ status: "founding_member", subscription_end: d(5) }).hasPremium, true);
  assert.equal(r({ status: "founding_member", subscription_end: d(-5) }).hasPremium, false);
});
test("complimentary: open-ended and future-end are premium; past end is not", () => {
  assert.equal(r({ status: "complimentary" }).hasPremium, true);
  assert.equal(r({ status: "complimentary", subscription_end: d(30) }).hasPremium, true);
  assert.equal(r({ status: "complimentary", subscription_end: d(-1) }).hasPremium, false);
});
test("cancelled: keeps access until paid period ends, then loses it", () => {
  const during = r({ status: "cancelled", subscription_end: d(7) });
  assert.equal(during.hasPremium, true); assert.equal(during.effective, "cancelled");
  assert.equal(r({ status: "cancelled", subscription_end: d(-1) }).hasPremium, false);
  assert.equal(r({ status: "cancelled" }).hasPremium, false);
});
test("every declared status resolves without throwing", () => { for (const s of ENTITLEMENT_STATUSES) assert.doesNotThrow(() => r({ status: s })); });
test("showAds is exactly the inverse of hasPremium for every status/date combination", () => {
  for (const s of ENTITLEMENT_STATUSES) for (const e of [null, d(-1), d(5)]) for (const p of ["none", "paid"]) {
    const x = r({ status: s, subscription_end: e, trial_end: e, payment_status: p });
    assert.equal(x.showAds, !x.hasPremium, `${s}/${e}/${p}`);
  }
});
test("trials are OFF at launch but the ability is preserved", () => {
  assert.equal(TRIAL_OFFERS_ENABLED, false); assert.equal(canStartTrial(), false);
  assert.equal(r({ status: "trial", trial_start: d(-1), trial_end: d(2) }).hasPremium, true);
});
