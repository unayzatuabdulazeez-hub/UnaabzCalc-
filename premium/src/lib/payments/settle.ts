/**
 * Settling a charge and handling a webhook. Dependencies are injected so the whole flow is tested with fakes.
 * Rule that never bends: a webhook only says WHICH reference to look at. Access is granted from Paystack's own verify answer.
 */
import { createHash } from "node:crypto";
import { MAX_WEBHOOK_BYTES, parseWebhook } from "./events";
import { decideCharge, parseVerifyResponse } from "./verify";
import { verifyPaystackSignature } from "./signature";

export interface Rpc { (fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }
export interface Deps { secretKey: string; planCode: string; verify(reference: string): Promise<unknown>; rpc: Rpc }

/** Verify with Paystack, decide, and record. Throws on a network or database failure (so the webhook can answer 500 and Paystack retries). */
export async function settleCharge(reference: string, deps: Pick<Deps, "planCode" | "verify" | "rpc">): Promise<{ outcome: string; detail?: string }> {
  const parsed = parseVerifyResponse(await deps.verify(reference), reference);
  if (!parsed.ok) return { outcome: "not_verified", detail: parsed.reason };
  const d = decideCharge(parsed.tx, deps.planCode);
  if (!d.ok) return { outcome: "rejected", detail: d.reason };
  const t = parsed.tx;
  const { data, error } = await deps.rpc("apply_paystack_charge", {
    p_reference: t.reference, p_tx_id: t.txId, p_amount_kobo: t.amountKobo, p_currency: t.currency, p_paid_at: t.paidAt,
    p_customer_code: t.customerCode, p_subscription_code: t.subscriptionCode, p_plan_code: t.planCode,
  });
  if (error || typeof data !== "string") throw new Error("database refused the payment record");
  return { outcome: data };
}

export async function handleWebhook(raw: string, signature: string | null, deps: Deps): Promise<{ status: number; body: string }> {
  if (Buffer.byteLength(raw, "utf8") > MAX_WEBHOOK_BYTES) return { status: 413, body: "too large" };
  if (!verifyPaystackSignature(raw, signature, deps.secretKey)) return { status: 401, body: "bad signature" };
  const p = parseWebhook(raw);
  if (!p.ok) return { status: 400, body: "bad body" };
  const ev = p.event, hash = createHash("sha256").update(raw).digest("hex");
  const claim = await deps.rpc("claim_webhook_event", { p_hash: hash, p_event: ev.name });
  if (claim.error) return { status: 500, body: "try again" };
  if (claim.data !== true) return { status: 200, body: "already handled" };
  const finish = (outcome: string, detail?: string) => deps.rpc("finish_webhook_event", { p_hash: hash, p_outcome: outcome, p_detail: detail ?? null });
  try {
    let outcome = "ignored", detail: string | undefined;
    if (ev.type === "charge_success") {
      if (!ev.reference) outcome = "no_reference";
      else ({ outcome, detail } = await settleCharge(ev.reference, deps));
    } else if (ev.type === "subscription_create" || ev.type === "subscription_not_renew" || ev.type === "subscription_disable") {
      const kind = ev.type === "subscription_create" ? "create" : ev.type === "subscription_not_renew" ? "not_renew" : "disable";
      const r = await deps.rpc("apply_paystack_subscription_event", { p_kind: kind, p_customer_code: ev.customerCode ?? null, p_subscription_code: ev.subscriptionCode ?? null, p_email: ev.email ?? null });
      if (r.error || typeof r.data !== "string") throw new Error("database refused the subscription event");
      outcome = r.data;
    } else if (ev.type === "invoice_payment_failed") outcome = "logged"; // access simply continues to subscription_end
    await finish(outcome, detail);
    return { status: 200, body: "ok" };
  } catch (e) {
    await finish("error", (e as Error).message.slice(0, 200)).catch(() => undefined);
    return { status: 500, body: "try again" };
  }
}
