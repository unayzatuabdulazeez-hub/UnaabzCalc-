/** The whole webhook and settle flow with a fake Paystack and a fake database. No network. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { handleWebhook, settleCharge, type Rpc } from "../src/lib/payments/settle";
import { signBody } from "../src/lib/payments/signature";
import { paystack, PaystackError } from "../src/lib/payments/paystack-client";

const SECRET = "sk_test_abcdefghij1234", PLAN = "PLN_abcdef123";
const ok = (o: object = {}) => ({ status: true, data: { id: 555, status: "success", reference: "UC-abcdef123456", amount: 499900, currency: "NGN", paid_at: "2026-10-01T10:00:00Z", customer: { customer_code: "CUS_x1", email: "a@b.co" }, plan: { plan_code: PLAN }, ...o } });
function world(verifyAnswer: unknown, rpcImpl?: (fn: string, a: Record<string, unknown>) => unknown) {
  const calls: { fn: string; a: Record<string, unknown> }[] = [], seen = new Set<string>();
  const rpc: Rpc = async (fn, a) => {
    calls.push({ fn, a });
    if (rpcImpl) { const r = rpcImpl(fn, a); if (r !== undefined) return r as { data: unknown; error: unknown }; }
    if (fn === "claim_webhook_event") { const n = !seen.has(String(a.p_hash)); seen.add(String(a.p_hash)); return { data: n, error: null }; }
    if (fn === "apply_paystack_charge") return { data: "granted", error: null };
    if (fn === "apply_paystack_subscription_event") return { data: "updated", error: null };
    return { data: null, error: null };
  };
  const verified: string[] = [];
  const deps = { secretKey: SECRET, planCode: PLAN, rpc, verify: async (r: string) => { verified.push(r); if (verifyAnswer instanceof Error) throw verifyAnswer; return verifyAnswer; } };
  return { calls, verified, deps };
}
const body = (ev: string, data: object) => JSON.stringify({ event: ev, data });
const send = (raw: string, w: ReturnType<typeof world>, sig = signBody(raw, SECRET)) => handleWebhook(raw, sig, w.deps);
const charge = body("charge.success", { reference: "UC-abcdef123456", amount: 1, plan: {} }); // the webhook's own amount is a lie on purpose

test("bad or missing signature: 401, nothing verified, nothing recorded", async () => {
  for (const sig of [null, "", "abc", signBody(charge, "sk_test_otherotherother")]) {
    const w = world(ok()); const r = await send(charge, w, sig as string);
    assert.equal(r.status, 401); assert.equal(w.calls.length, 0); assert.equal(w.verified.length, 0);
  }
});
test("oversized body: 413 before anything else", async () => {
  const w = world(ok()); const r = await send("x".repeat(100_001), w); assert.equal(r.status, 413); assert.equal(w.calls.length, 0);
});
test("signed but malformed body: 400", async () => { const w = world(ok()); assert.equal((await send("not json", w)).status, 400); });
test("charge.success: verified with Paystack, amount comes from VERIFY not from the webhook, claim and finish recorded", async () => {
  const w = world(ok()); const r = await send(charge, w);
  assert.equal(r.status, 200); assert.deepEqual(w.verified, ["UC-abcdef123456"]);
  const c = w.calls.find((x) => x.fn === "apply_paystack_charge")!;
  assert.equal(c.a.p_amount_kobo, 499900); assert.equal(c.a.p_tx_id, "555"); assert.equal(c.a.p_customer_code, "CUS_x1");
  assert.equal(w.calls[0]!.fn, "claim_webhook_event"); assert.equal(w.calls[0]!.a.p_hash, createHash("sha256").update(charge).digest("hex"));
  const f = w.calls.at(-1)!; assert.equal(f.fn, "finish_webhook_event"); assert.equal(f.a.p_outcome, "granted");
});
test("a repeated delivery is acknowledged and not processed twice", async () => {
  const w = world(ok()); await send(charge, w); const r = await send(charge, w);
  assert.equal(r.status, 200); assert.equal(w.verified.length, 1); assert.equal(w.calls.filter((x) => x.fn === "apply_paystack_charge").length, 1);
});
test("Paystack unreachable: 500 so Paystack retries, event marked error, nothing granted", async () => {
  const w = world(new PaystackError("Could not reach Paystack")); const r = await send(charge, w);
  assert.equal(r.status, 500); assert.equal(w.calls.some((x) => x.fn === "apply_paystack_charge"), false);
  assert.equal(w.calls.at(-1)!.a.p_outcome, "error");
});
test("database error on the grant: 500 so Paystack retries", async () => {
  const w = world(ok(), (fn) => (fn === "apply_paystack_charge" ? { data: null, error: { message: "x" } } : undefined));
  assert.equal((await send(charge, w)).status, 500);
});
test("verify says not successful, wrong currency, wrong plan, unknown reference shape: 200, no grant", async () => {
  const cases: [string, unknown, string][] = [
    ["failed", ok({ status: "failed" }), "not_verified"], ["usd", ok({ currency: "USD" }), "rejected"],
    ["other plan", ok({ plan: { plan_code: "PLN_other9999" } }), "rejected"], ["wrong ref", ok({ reference: "UC-zzzzzzzz9999" }), "not_verified"],
    ["no plan, foreign ref", ok({ plan: {}, reference: "UC-abcdef123456" }), "granted"],
  ];
  for (const [name, ans, outcome] of cases) {
    const w = world(ans); const r = await send(charge, w); assert.equal(r.status, 200, name);
    assert.equal(w.calls.at(-1)!.a.p_outcome, outcome, name);
    assert.equal(w.calls.some((x) => x.fn === "apply_paystack_charge"), outcome === "granted", name);
  }
});
test("charge.success without a usable reference is ignored", async () => {
  const w = world(ok()); const r = await send(body("charge.success", { reference: "x" }), w);
  assert.equal(r.status, 200); assert.equal(w.verified.length, 0);
});
test("subscription events map to the right database call and never grant", async () => {
  for (const [ev, kind] of [["subscription.create", "create"], ["subscription.not_renew", "not_renew"], ["subscription.disable", "disable"]] as const) {
    const w = world(ok()); const r = await send(body(ev, { subscription_code: "SUB_abc123", customer: { customer_code: "CUS_x1", email: "a@b.co" } }), w);
    assert.equal(r.status, 200); const c = w.calls.find((x) => x.fn === "apply_paystack_subscription_event")!;
    assert.equal(c.a.p_kind, kind); assert.equal(c.a.p_subscription_code, "SUB_abc123"); assert.equal(w.verified.length, 0);
    assert.equal(w.calls.some((x) => x.fn === "apply_paystack_charge"), false);
  }
});
test("invoice.payment_failed and unknown events: acknowledged, no database change", async () => {
  for (const ev of ["invoice.payment_failed", "transfer.success", "customeridentification.failed"]) {
    const w = world(ok()); const r = await send(body(ev, { customer: { customer_code: "CUS_x1" } }), w);
    assert.equal(r.status, 200); assert.equal(w.calls.some((x) => x.fn.startsWith("apply_")), false);
  }
});
test("settleCharge directly: not verified and rejected never reach the database", async () => {
  const w = world({ status: false }); assert.deepEqual(await settleCharge("UC-abcdef123456", w.deps), { outcome: "not_verified", detail: "Paystack could not confirm this transaction" });
  assert.equal(w.calls.length, 0);
});

// ---------- Paystack client with a fake fetch ----------
const fakeFetch = (status: number, json: unknown, capture?: (u: string, i: unknown) => void) => async (u: string, i: unknown) => { capture?.(u, i); return { ok: status < 400, status, json: async () => json }; };
test("client: sends the secret only as a bearer header, to api.paystack.co", async () => {
  let seen: { u: string; i: { headers: Record<string, string>; body?: string } } | null = null;
  const api = paystack({ secretKey: SECRET }, fakeFetch(200, { status: true, data: { authorization_url: "https://checkout.paystack.com/abc" } }, (u, i) => { seen = { u, i: i as never }; }) as never);
  const url = await api.initialize({ email: "a@b.co", amountKobo: 499900, planCode: PLAN, reference: "UC-abcdef123456", callbackUrl: "https://x.test/billing/callback", userId: "u1" });
  assert.equal(url, "https://checkout.paystack.com/abc"); assert.ok(seen!.u.startsWith("https://api.paystack.co/transaction/initialize"));
  assert.equal(seen!.i.headers.Authorization, `Bearer ${SECRET}`); assert.ok(!seen!.i.body!.includes(SECRET));
  assert.equal(JSON.parse(seen!.i.body!).amount, 499900);
});
test("client: refuses a checkout or manage address that is not on paystack.com", async () => {
  for (const bad of ["http://checkout.paystack.com/a", "https://evil.example/a", "https://paystack.com.evil.example/a", "javascript:alert(1)", ""]) {
    const api = paystack({ secretKey: SECRET }, fakeFetch(200, { status: true, data: { authorization_url: bad, link: bad } }) as never);
    await assert.rejects(api.initialize({ email: "a@b.co", amountKobo: 1, planCode: PLAN, reference: "UC-abcdef123456", callbackUrl: "https://x.test", userId: "u" }));
    await assert.rejects(api.manageLink("SUB_abc123"));
  }
});
test("client: HTTP errors and network failures raise PaystackError without leaking the key or the body", async () => {
  const api = paystack({ secretKey: SECRET }, fakeFetch(401, { message: `bad key ${SECRET}` }) as never);
  await assert.rejects(api.verify("UC-abcdef123456"), (e: Error) => e instanceof PaystackError && !e.message.includes(SECRET) && !e.message.includes("bad key"));
  const down = paystack({ secretKey: SECRET }, (async () => { throw new Error(`boom ${SECRET}`); }) as never);
  await assert.rejects(down.verify("UC-abcdef123456"), (e: Error) => e instanceof PaystackError && !e.message.includes(SECRET));
});
test("client: fetchPlan returns the fields planMatchesPrice needs", async () => {
  const api = paystack({ secretKey: SECRET }, fakeFetch(200, { status: true, data: { amount: 499900, currency: "NGN", interval: "monthly", plan_code: PLAN } }) as never);
  assert.deepEqual(await api.fetchPlan(PLAN), { amount: 499900, currency: "NGN", interval: "monthly" });
});
test("client: reference is URL-encoded in the verify path", async () => {
  let u = ""; const api = paystack({ secretKey: SECRET }, fakeFetch(200, {}, (x) => { u = x; }) as never);
  await api.verify("UC-a/../b"); assert.ok(!u.includes("/../")); 
});
