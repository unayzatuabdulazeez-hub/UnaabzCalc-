/** Paystack signature, webhook parsing, verification decisions, price and configuration, ads rule. No network. */
import test from "node:test";
import assert from "node:assert/strict";
import { signBody, verifyPaystackSignature } from "../src/lib/payments/signature";
import { MAX_WEBHOOK_BYTES, parseWebhook } from "../src/lib/payments/events";
import { decideCharge, parseVerifyResponse } from "../src/lib/payments/verify";
import { formatPrice, newReference, parsePremiumPrice, planMatchesPrice } from "../src/lib/payments/price";
import { readPaystackConfig, readServiceRoleKey } from "../src/lib/config/paystack";
import { EnvError } from "../src/lib/config/env";
import { shouldShowAds, adsenseSlotId } from "../src/lib/ads";
import { adsensePublisherId } from "../src/lib/config/env";
import { REFERENCE_RE } from "../src/lib/payments/events";

const SECRET = "sk_test_abcdefghij1234";
const BODY = '{"event":"charge.success","data":{"reference":"UC-abc12345"}}';
const KNOWN = "4e83870edd19134c4ee6d49c5a7250a95119000b9ea12008917cab97429a311219c75f9de63773b9fd17d035c58ea43e9934de993bef982578abe0776f136245"; // computed independently with Python hmac/hashlib

// ---------- signature ----------
test("signature: matches an independently computed HMAC-SHA512 value", () => {
  assert.equal(signBody(BODY, SECRET), KNOWN);
  assert.equal(verifyPaystackSignature(BODY, KNOWN, SECRET), true);
  assert.equal(verifyPaystackSignature(BODY, KNOWN.toUpperCase(), SECRET), true, "hex case does not matter");
});
test("signature: any change to the body, the secret or the header is rejected", () => {
  assert.equal(verifyPaystackSignature(BODY + " ", KNOWN, SECRET), false);
  assert.equal(verifyPaystackSignature(BODY.replace("UC-abc12345", "UC-abc12346"), KNOWN, SECRET), false);
  assert.equal(verifyPaystackSignature(BODY, KNOWN, SECRET + "x"), false);
  assert.equal(verifyPaystackSignature(BODY, KNOWN.slice(0, -1) + "0", SECRET), false);
  assert.equal(verifyPaystackSignature(BODY, KNOWN.slice(0, 64), SECRET), false, "truncated");
  assert.equal(verifyPaystackSignature(BODY, KNOWN + "00", SECRET), false, "too long");
});
test("signature: missing or malformed header, empty secret and non-hex garbage never validate", () => {
  for (const h of [null, undefined, "", " ", "zzzz", "0".repeat(128), "g".repeat(128)]) assert.equal(verifyPaystackSignature(BODY, h as string, SECRET), false, String(h));
  assert.equal(verifyPaystackSignature(BODY, signBody(BODY, ""), ""), false, "an empty secret is never accepted");
});
test("signature: the raw text is what is signed (re-serialised JSON would not verify)", () => {
  const spaced = '{ "event": "charge.success", "data": { "reference": "UC-abc12345" } }';
  assert.equal(verifyPaystackSignature(spaced, KNOWN, SECRET), false);
  assert.equal(verifyPaystackSignature(spaced, signBody(spaced, SECRET), SECRET), true);
});
test("signature: non-ASCII bodies are hashed as UTF-8", () => {
  const b = '{"event":"x","data":{"name":"Ọlá ₦"}}';
  assert.equal(verifyPaystackSignature(b, signBody(b, SECRET), SECRET), true);
});

// ---------- webhook parsing ----------
const hook = (event: string, data: unknown) => JSON.stringify({ event, data });
test("webhook: charge.success reads the reference, customer and plan; the amount is deliberately NOT read from the webhook", () => {
  const r = parseWebhook(hook("charge.success", { id: 99, reference: "UC-abc12345", amount: 1, status: "success", customer: { customer_code: "CUS_x1y2z3", email: "a@b.ng" }, plan: { plan_code: "PLN_abc12345" } }));
  assert.ok(r.ok); const e = r.event;
  assert.deepEqual([e.type, e.reference, e.customerCode, e.email, e.planCode], ["charge_success", "UC-abc12345", "CUS_x1y2z3", "a@b.ng", "PLN_abc12345"]);
  assert.ok(!("amountKobo" in e));
});
test("webhook: an empty plan object or null plan means no plan", () => {
  for (const plan of [{}, null, undefined]) { const r = parseWebhook(hook("charge.success", { reference: "RN-12345678", plan })); assert.ok(r.ok && r.event.planCode === undefined); }
});
test("webhook: subscription events carry the subscription code from either place", () => {
  const a = parseWebhook(hook("subscription.disable", { subscription_code: "SUB_abc123", customer: { customer_code: "CUS_x1y2z3" } }));
  const b = parseWebhook(hook("invoice.payment_failed", { subscription: { subscription_code: "SUB_def456" }, customer: { customer_code: "CUS_x1y2z3" } }));
  assert.ok(a.ok && a.event.type === "subscription_disable" && a.event.subscriptionCode === "SUB_abc123");
  assert.ok(b.ok && b.event.type === "invoice_payment_failed" && b.event.subscriptionCode === "SUB_def456");
  assert.equal((parseWebhook(hook("subscription.not_renew", { subscription_code: "SUB_abc123" })) as { event: { type: string } }).event.type, "subscription_not_renew");
  assert.equal((parseWebhook(hook("subscription.create", { subscription_code: "SUB_abc123", customer: { customer_code: "CUS_a1b2", email: "x@y.ng" }, plan: { plan_code: "PLN_abc12345" } })) as { event: { type: string } }).event.type, "subscription_create");
});
test("webhook: unknown events are accepted as 'other'; bad shapes are refused; nothing throws", () => {
  assert.deepEqual(parseWebhook(hook("transfer.success", { x: 1 })), { ok: true, event: { type: "other", name: "transfer.success" } });
  for (const bad of ["", "not json", "[]", "null", "123", '{"event":5,"data":{}}', '{"event":"charge.success"}', '{"event":"charge.success","data":[]}', JSON.stringify({ event: "e".repeat(200), data: {} })]) {
    assert.equal(parseWebhook(bad).ok, false, bad.slice(0, 30));
  }
  assert.equal(parseWebhook("x".repeat(MAX_WEBHOOK_BYTES + 1)).ok, false, "oversize");
});
test("webhook: hostile values are dropped, not passed on", () => {
  const r = parseWebhook(hook("charge.success", { reference: "UC-1'; drop table payments;--", customer: { customer_code: "CUS x", email: "not an email" }, plan: { plan_code: "PLN_<script>" } }));
  assert.ok(r.ok && r.event.reference === undefined && r.event.customerCode === undefined && r.event.email === undefined && r.event.planCode === undefined);
});

// ---------- verify response + decision ----------
const VERIFY = (o: Record<string, unknown> = {}) => ({ status: true, message: "Verification successful", data: { id: 4099260516, status: "success", reference: "UC-abc12345", amount: 499900, currency: "NGN", paid_at: "2026-10-11T08:00:00.000Z", customer: { customer_code: "CUS_x1y2z3", email: "a@b.ng" }, plan: { plan_code: "PLN_abc12345" }, authorization: { last4: "4081" }, ...o } });
test("verify: a good response is read into exact values", () => {
  const r = parseVerifyResponse(VERIFY(), "UC-abc12345"); assert.ok(r.ok);
  assert.deepEqual([r.tx.txId, r.tx.amountKobo, r.tx.currency, r.tx.paidAt, r.tx.customerCode, r.tx.planCode], ["4099260516", 499900, "NGN", "2026-10-11T08:00:00.000Z", "CUS_x1y2z3", "PLN_abc12345"]);
});
test("verify: not successful, wrong reference, bad amount or currency are all refused", () => {
  const bad = (o: Record<string, unknown>, ref = "UC-abc12345") => parseVerifyResponse(VERIFY(o), ref).ok;
  assert.equal(bad({ status: "failed" }), false); assert.equal(bad({ status: "abandoned" }), false);
  assert.equal(bad({}, "UC-other0000"), false, "reference must match the one we asked about");
  for (const amount of [0, -1, 1.5, "499900", null, Number.MAX_SAFE_INTEGER + 2]) assert.equal(bad({ amount }), false, String(amount));
  for (const currency of [undefined, "ngn", "NG", 5]) assert.equal(bad({ currency }), false, String(currency));
  assert.equal(bad({ id: undefined }), false);
  assert.equal(parseVerifyResponse({ status: false, message: "Transaction reference not found" }, "UC-abc12345").ok, false);
  assert.equal(parseVerifyResponse(null, "UC-abc12345").ok, false); assert.equal(parseVerifyResponse("x", "UC-abc12345").ok, false);
  assert.equal(parseVerifyResponse(VERIFY(), "bad ref").ok, false);
});
test("verify: a missing plan is read as null; a string plan is accepted", () => {
  const a = parseVerifyResponse(VERIFY({ plan: null }), "UC-abc12345"); assert.ok(a.ok && a.tx.planCode === null);
  const b = parseVerifyResponse(VERIFY({ plan: "PLN_abc12345" }), "UC-abc12345"); assert.ok(b.ok && b.tx.planCode === "PLN_abc12345");
});
test("decision: only NGN payments on OUR plan (or our own UC- checkouts) are accepted", () => {
  const tx = (o: Record<string, unknown>) => { const r = parseVerifyResponse(VERIFY(o), String((o.reference as string) ?? "UC-abc12345")); assert.ok(r.ok, JSON.stringify(o)); return r.tx; };
  assert.equal(decideCharge(tx({}), "PLN_abc12345").ok, true);
  assert.equal(decideCharge(tx({ currency: "USD" }), "PLN_abc12345").ok, false);
  assert.equal(decideCharge(tx({ plan: { plan_code: "PLN_someoneelse" } }), "PLN_abc12345").ok, false, "a payment on another plan (another product on the same Paystack account) never grants");
  assert.equal(decideCharge(tx({ plan: null }), "PLN_abc12345").ok, true, "our own checkout reference without plan data is accepted");
  assert.equal(decideCharge(tx({ plan: null, reference: "T123456789012" }), "PLN_abc12345").ok, false, "a renewal-looking payment with no plan is NOT accepted");
  assert.equal(decideCharge(tx({ plan: {}, reference: "T123456789012" }), "PLN_abc12345").ok, false);
});

// ---------- price ----------
test("price: read from the setting, validated, formatted; the plan must match it exactly", () => {
  const p = parsePremiumPrice({ amount_kobo: 499900, currency: "NGN", interval: "monthly" })!;
  assert.equal(formatPrice(p), "₦4,999 per month");
  assert.equal(formatPrice(parsePremiumPrice({ amount_kobo: 499950, currency: "NGN", interval: "monthly" })!), "₦4,999.50 per month");
  for (const bad of [null, "x", {}, { amount_kobo: 5, currency: "NGN", interval: "monthly" }, { amount_kobo: 499900.5, currency: "NGN", interval: "monthly" }, { amount_kobo: 499900, currency: "USD", interval: "monthly" }, { amount_kobo: 499900, currency: "NGN", interval: "yearly" }, { amount_kobo: "499900", currency: "NGN", interval: "monthly" }, { amount_kobo: 1e12, currency: "NGN", interval: "monthly" }]) assert.equal(parsePremiumPrice(bad), null, JSON.stringify(bad));
  assert.equal(planMatchesPrice({ amount: 499900, currency: "NGN", interval: "monthly" }, p), true);
  for (const bad of [{ amount: 500000, currency: "NGN", interval: "monthly" }, { amount: 499900, currency: "USD", interval: "monthly" }, { amount: 499900, currency: "NGN", interval: "weekly" }, { amount: "499900", currency: "NGN", interval: "monthly" }]) assert.equal(planMatchesPrice(bad, p), false, JSON.stringify(bad));
});
test("references: ours always satisfy Paystack's allowed characters", () => {
  assert.ok(REFERENCE_RE.test(newReference("a1b2c3d4e5f6a7b8c9d0e1f2")));
  assert.ok(newReference("0".repeat(24)).startsWith("UC-"));
});

// ---------- configuration ----------
test("config: payments are OFF unless both the key and the plan are set; bad values name the variable but never show it", () => {
  assert.equal(readPaystackConfig({}), null);
  assert.equal(readPaystackConfig({ PAYSTACK_SECRET_KEY: "  ", PAYSTACK_PLAN_CODE: "" }), null);
  const c = readPaystackConfig({ PAYSTACK_SECRET_KEY: "sk_test_abcdefghij1234", PAYSTACK_PLAN_CODE: "PLN_abc12345" })!;
  assert.deepEqual([c.mode, c.planCode], ["test", "PLN_abc12345"]);
  assert.equal(readPaystackConfig({ PAYSTACK_SECRET_KEY: "sk_live_abcdefghij1234", PAYSTACK_PLAN_CODE: "PLN_abc12345" })!.mode, "live");
  const msg = (src: Record<string, string>) => { try { readPaystackConfig(src); return ""; } catch (e) { assert.ok(e instanceof EnvError); return (e as EnvError).message; } };
  assert.match(msg({ PAYSTACK_SECRET_KEY: "sk_test_abcdefghij1234" }), /PAYSTACK_PLAN_CODE is missing/);
  assert.match(msg({ PAYSTACK_PLAN_CODE: "PLN_abc12345" }), /PAYSTACK_SECRET_KEY is missing/);
  const leak = "pk_test_SECRETSHOULDNOTSHOW123";
  const m = msg({ PAYSTACK_SECRET_KEY: leak, PAYSTACK_PLAN_CODE: "PLN_abc12345" });
  assert.match(m, /must start with sk_test_ or sk_live_/); assert.ok(!m.includes(leak), "the value is never echoed");
  assert.match(msg({ PAYSTACK_SECRET_KEY: "sk_test_abcdefghij1234", PAYSTACK_PLAN_CODE: "abc" }), /PLN_/);
});
test("config: the service-role key must be present and not a placeholder", () => {
  assert.throws(() => readServiceRoleKey({}), EnvError);
  assert.throws(() => readServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: "your-service-role-key" }), EnvError);
  assert.equal(readServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: " abc.def.ghi " }), "abc.def.ghi");
});

// ---------- ads ----------
test("ads: only Free users, on content pages, with a real publisher id and slot id", () => {
  const base = { hasPremium: false, publisherId: "ca-pub-1234567890123456", slotId: "1234567890", page: "content" as const };
  assert.equal(shouldShowAds(base), true);
  assert.equal(shouldShowAds({ ...base, hasPremium: true }), false, "Premium never sees ads");
  assert.equal(shouldShowAds({ ...base, publisherId: null }), false, "no publisher id = ads off");
  assert.equal(shouldShowAds({ ...base, slotId: null }), false);
  assert.equal(shouldShowAds({ ...base, slotId: "abc" }), false);
  for (const page of ["form", "billing", "export"] as const) assert.equal(shouldShowAds({ ...base, page }), false, page);
  assert.equal(adsensePublisherId({ ADSENSE_PUBLISHER_ID: "ca-pub-1234567890123456" }), "ca-pub-1234567890123456");
  assert.equal(adsensePublisherId({ ADSENSE_PUBLISHER_ID: "ca-pub-xxxx" }), null);
  assert.equal(adsenseSlotId({ ADSENSE_SLOT_ID: "1234567890" }), "1234567890"); assert.equal(adsenseSlotId({}), null);
});

// ---------- bounded body reading ----------
import { readLimitedText } from "../src/lib/payments/read-body";
test("read-body: reads normal bodies, refuses oversized ones even when no length header is sent, handles empty and multi-byte text", async () => {
  const mk = (b: BodyInit | null) => new Request("http://x.test/", { method: "POST", body: b });
  assert.equal(await readLimitedText(mk("hello ₦"), 100), "hello ₦");
  assert.equal(await readLimitedText(mk(null), 100), "");
  assert.equal(await readLimitedText(mk("x".repeat(101)), 100), null);
  assert.equal(await readLimitedText(mk("x".repeat(100)), 100), "x".repeat(100), "exactly the limit is allowed");
  const chunked = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(40)); } }); // never ends
  assert.equal(await readLimitedText({ body: chunked }, 100), null, "an endless stream is cut off");
});
