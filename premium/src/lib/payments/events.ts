/**
 * Reads a Paystack webhook body into a small, strictly validated shape. Pure: no network, no database.
 * Anything unexpected becomes type "other" (acknowledged and ignored), never an exception and never a grant.
 */
export type WebhookType = "charge_success" | "subscription_create" | "subscription_not_renew" | "subscription_disable" | "invoice_payment_failed" | "other";
export interface WebhookEvent {
  type: WebhookType; name: string;
  reference?: string; customerCode?: string; email?: string; subscriptionCode?: string; planCode?: string;
}
export const REFERENCE_RE = /^[A-Za-z0-9.=-]{8,100}$/;
const CODE_RE = /^[A-Za-z0-9_.-]{3,100}$/;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, re: RegExp): string | undefined => (typeof v === "string" && re.test(v) ? v : undefined);
const emailOf = (v: unknown): string | undefined => (typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(v) ? v : undefined);
/** Paystack sends `plan` as an object (or an empty object / null when there is no plan); some payloads carry a plain string. */
const planOf = (v: unknown): string | undefined => (typeof v === "string" ? str(v, CODE_RE) : isObj(v) ? str(v.plan_code, CODE_RE) : undefined);

export const MAX_WEBHOOK_BYTES = 100_000;

export function parseWebhook(raw: string): { ok: true; event: WebhookEvent } | { ok: false; reason: string } {
  if (raw.length === 0 || Buffer.byteLength(raw, "utf8") > MAX_WEBHOOK_BYTES) return { ok: false, reason: "empty or too large" };
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return { ok: false, reason: "not JSON" }; }
  if (!isObj(j) || typeof j.event !== "string" || j.event.length > 100 || !isObj(j.data)) return { ok: false, reason: "unexpected shape" };
  const d = j.data, name = j.event;
  const customer = isObj(d.customer) ? d.customer : {};
  const sub = isObj(d.subscription) ? d.subscription : {};
  const common = {
    customerCode: str(customer.customer_code, CODE_RE), email: emailOf(customer.email),
    subscriptionCode: str(d.subscription_code, CODE_RE) ?? str(sub.subscription_code, CODE_RE),
  };
  switch (name) {
    case "charge.success": return { ok: true, event: { type: "charge_success", name, reference: str(d.reference, REFERENCE_RE), planCode: planOf(d.plan), ...common } };
    case "subscription.create": return { ok: true, event: { type: "subscription_create", name, planCode: planOf(d.plan), ...common } };
    case "subscription.not_renew": return { ok: true, event: { type: "subscription_not_renew", name, ...common } };
    case "subscription.disable": return { ok: true, event: { type: "subscription_disable", name, ...common } };
    case "invoice.payment_failed": return { ok: true, event: { type: "invoice_payment_failed", name, ...common } };
    default: return { ok: true, event: { type: "other", name } };
  }
}
