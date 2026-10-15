/** Reads Paystack's "verify transaction" response. Pure. The webhook only tells us WHICH reference to check; the amount, currency and plan we act on come from here. */
import { REFERENCE_RE } from "./events";

export interface VerifiedTransaction {
  reference: string; txId: string; amountKobo: number; currency: string; paidAt: string;
  customerCode: string | null; email: string | null; subscriptionCode: string | null; planCode: string | null;
}
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const code = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_.-]{3,100}$/.test(v) ? v : null);

export function parseVerifyResponse(json: unknown, expectedReference: string): { ok: true; tx: VerifiedTransaction } | { ok: false; reason: string } {
  if (!isObj(json) || json.status !== true || !isObj(json.data)) return { ok: false, reason: "Paystack could not confirm this transaction" };
  const d = json.data;
  if (d.status !== "success") return { ok: false, reason: `transaction status is ${typeof d.status === "string" ? d.status.slice(0, 30) : "unknown"}` };
  if (d.reference !== expectedReference || !REFERENCE_RE.test(expectedReference)) return { ok: false, reason: "reference does not match" };
  if (typeof d.amount !== "number" || !Number.isSafeInteger(d.amount) || d.amount <= 0) return { ok: false, reason: "amount is not a positive whole number of kobo" };
  if (typeof d.currency !== "string" || !/^[A-Z]{3}$/.test(d.currency)) return { ok: false, reason: "currency is missing" };
  const id = typeof d.id === "number" && Number.isSafeInteger(d.id) ? String(d.id) : typeof d.id === "string" && /^\d{1,20}$/.test(d.id) ? d.id : null;
  if (!id) return { ok: false, reason: "transaction id is missing" };
  const paid = typeof d.paid_at === "string" && !Number.isNaN(Date.parse(d.paid_at)) ? new Date(d.paid_at).toISOString() : new Date().toISOString();
  const customer = isObj(d.customer) ? d.customer : {};
  const plan = isObj(d.plan) ? d.plan : typeof d.plan === "string" ? { plan_code: d.plan } : {};
  const sub = isObj(d.subscription) ? d.subscription : {};
  return { ok: true, tx: {
    reference: expectedReference, txId: id, amountKobo: d.amount, currency: d.currency, paidAt: paid,
    customerCode: code(customer.customer_code), email: typeof customer.email === "string" ? customer.email : null,
    subscriptionCode: code(d.subscription_code) ?? code(sub.subscription_code), planCode: code(plan.plan_code),
  } };
}

/** Our own checkouts are created with a "UC-" reference and the Premium plan; renewals are created by Paystack and must carry our plan code. */
export const OUR_REFERENCE_PREFIX = "UC-";
export function decideCharge(tx: VerifiedTransaction, ourPlanCode: string): { ok: true } | { ok: false; reason: string } {
  if (tx.currency !== "NGN") return { ok: false, reason: "currency is not NGN" };
  if (tx.planCode !== null) return tx.planCode === ourPlanCode ? { ok: true } : { ok: false, reason: "payment is for a different plan" };
  return tx.reference.startsWith(OUR_REFERENCE_PREFIX) ? { ok: true } : { ok: false, reason: "payment has no plan and is not one of our checkouts" };
}
