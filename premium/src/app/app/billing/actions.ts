"use server";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { paystack } from "@/lib/payments/paystack-client";
import { loadPrice, paymentsConfig } from "@/lib/payments/load-price";
import { newReference, planMatchesPrice } from "@/lib/payments/price";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { publicEnv } from "@/lib/config/env";

const ENT = "status,trial_start,trial_end,subscription_start,subscription_end,payment_status,cancellation_status";

/** Start a Premium checkout. The amount is the price setting; Paystack's plan must charge exactly that or we refuse. */
export async function startCheckout() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");
  const cfg = paymentsConfig();
  if (!cfg) redirect("/app/upgrade?m=payments_off");
  const [price, { data: ent }] = await Promise.all([loadPrice(), supabase.from("entitlements").select(ENT).eq("user_id", user.id).maybeSingle()]);
  if (!price) redirect("/app/upgrade?m=price_unavailable");
  const plan = resolveEntitlement(ent);
  if (plan.effective === "premium" || plan.effective === "founding_member") redirect("/app/billing?m=already_premium");
  let url: string;
  try {
    const api = paystack(cfg);
    if (!planMatchesPrice(await api.fetchPlan(cfg.planCode), price)) redirect("/app/upgrade?m=plan_mismatch"); // redirect() throws, so it must not be caught below
    const reference = newReference(randomBytes(12).toString("hex"));
    const { error } = await adminClient().rpc("create_checkout_payment", { p_user: user.id, p_reference: reference, p_expected_kobo: price.amountKobo, p_plan_code: cfg.planCode });
    if (error) throw new Error("could not record the checkout");
    url = await api.initialize({ email: user.email, amountKobo: price.amountKobo, planCode: cfg.planCode, reference, callbackUrl: `${publicEnv().appUrl}/billing/callback`, userId: user.id });
  } catch (e) {
    if (isRedirect(e)) throw e;
    redirect("/app/upgrade?m=checkout_failed");
  }
  redirect(url);
}
const isRedirect = (e: unknown) => typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");

/** Send the owner to Paystack's own page for managing or cancelling their subscription. */
export async function openManageLink() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const cfg = paymentsConfig();
  if (!cfg) redirect("/app/billing?m=payments_off");
  const { data: ent } = await supabase.from("entitlements").select("paystack_subscription_code").eq("user_id", user.id).maybeSingle();
  const code = ent?.paystack_subscription_code;
  if (!code) redirect("/app/billing?m=no_subscription");
  let url: string;
  try { url = await paystack(cfg).manageLink(code); } catch { redirect("/app/billing?m=manage_failed"); }
  redirect(url);
}
