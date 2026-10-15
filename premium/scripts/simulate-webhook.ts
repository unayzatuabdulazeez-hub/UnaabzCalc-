/**
 * Sends a signed test webhook to YOUR OWN running app, to check the plumbing (signature, 401 on a wrong signature, duplicates).
 *   PAYSTACK_SECRET_KEY=sk_test_... npx tsx scripts/simulate-webhook.ts http://localhost:3000/api/paystack/webhook charge.success UC-yourreference
 *   add  --bad-signature  to confirm the app answers 401.
 * A made-up charge.success is answered "not_verified" on purpose: the app asks Paystack, and Paystack has no such payment.
 * Only a real TEST-mode payment completes the whole path (see docs/PAYMENTS.md).
 */
import { signBody } from "../src/lib/payments/signature";
const [url, event = "charge.success", ref = "UC-simulated0001"]: (string | undefined)[] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
if (typeof url !== "string" || !url || !/^sk_test_/.test(secret)) { console.error("Usage: PAYSTACK_SECRET_KEY=sk_test_... tsx scripts/simulate-webhook.ts <webhook-url> [event] [reference]\nOnly a TEST key is accepted."); process.exit(2); }
if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url) && !process.argv.includes("--allow-remote")) { console.error("Refusing a non-local URL without --allow-remote."); process.exit(2); }
const target: string = url;
const body = JSON.stringify({ event, data: { reference: ref, customer: { customer_code: "CUS_simulated", email: "test@example.com" }, subscription_code: "SUB_simulated", plan: {} } });
const sig = process.argv.includes("--bad-signature") ? "0".repeat(128) : signBody(body, secret);
async function main() {
  const res = await fetch(target, { method: "POST", headers: { "content-type": "application/json", "x-paystack-signature": sig }, body });
  console.log(res.status, await res.text());
}
main().catch((e) => { console.error("Could not reach the app:", (e as Error).message); process.exit(1); });
