import { EnvError, type EnvSource } from "./env";

export interface PaystackConfig { secretKey: string; planCode: string; mode: "test" | "live" }
/**
 * Payments are OFF (null) unless BOTH a Paystack secret key and a plan code are set. A malformed value is an error that names the
 * variable, never the value. The mode comes from the key itself (sk_test_ / sk_live_), so it cannot disagree with it.
 */
export function readPaystackConfig(src: EnvSource): PaystackConfig | null {
  const key = (src.PAYSTACK_SECRET_KEY ?? "").trim(), plan = (src.PAYSTACK_PLAN_CODE ?? "").trim();
  if (!key && !plan) return null;
  const problems: string[] = [];
  if (!key) problems.push("PAYSTACK_SECRET_KEY is missing (PAYSTACK_PLAN_CODE is set)");
  else if (!/^sk_(test|live)_[A-Za-z0-9]{10,}$/.test(key)) problems.push("PAYSTACK_SECRET_KEY must start with sk_test_ or sk_live_ (never use a public key here)");
  if (!plan) problems.push("PAYSTACK_PLAN_CODE is missing (PAYSTACK_SECRET_KEY is set)");
  else if (!/^PLN_[A-Za-z0-9]{6,}$/.test(plan)) problems.push("PAYSTACK_PLAN_CODE must look like PLN_xxxxxxxx");
  if (problems.length) throw new EnvError(problems);
  return { secretKey: key, planCode: plan, mode: key.startsWith("sk_live_") ? "live" : "test" };
}
/** The Supabase service-role key. Only the payment code uses it, only on the server. */
export function readServiceRoleKey(src: EnvSource): string {
  const k = (src.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!k) throw new EnvError(["SUPABASE_SERVICE_ROLE_KEY is missing (needed to record payments)"]);
  if (/^your-/i.test(k)) throw new EnvError(["SUPABASE_SERVICE_ROLE_KEY still contains the .env.example placeholder"]);
  return k;
}
/** Whether a production build runs payments in test mode (shown to the owner on the billing page). */
export const isTestMode = (c: PaystackConfig | null) => c?.mode === "test";
