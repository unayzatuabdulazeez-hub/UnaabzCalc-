import "server-only";
import { createClient } from "../supabase/server";
import { parsePremiumPrice, type PremiumPrice } from "./price";
import { readPaystackConfig, type PaystackConfig } from "../config/paystack";

/** The current Premium price from the app_settings table (public read). null if it is missing or malformed. */
export async function loadPrice(): Promise<PremiumPrice | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "premium_price").maybeSingle();
  return parsePremiumPrice(data?.value);
}
/** Paystack settings, or null when payments are off or badly configured (never throws into a page). */
export function paymentsConfig(): PaystackConfig | null {
  try { return readPaystackConfig({ PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY, PAYSTACK_PLAN_CODE: process.env.PAYSTACK_PLAN_CODE }); } catch { return null; }
}
