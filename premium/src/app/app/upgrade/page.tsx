import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/app/notice";
import { createClient } from "@/lib/supabase/server";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { loadPrice, paymentsConfig } from "@/lib/payments/load-price";
import { formatPrice } from "@/lib/payments/price";
import { startCheckout } from "../billing/actions";

export const dynamic = "force-dynamic";
export default async function Upgrade({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [price, { data: ent }] = await Promise.all([loadPrice(), supabase.from("entitlements").select("status,trial_start,trial_end,subscription_start,subscription_end,payment_status,cancellation_status").eq("user_id", user.id).maybeSingle()]);
  const plan = resolveEntitlement(ent), cfg = paymentsConfig();
  return (
    <>
      <p><Link href="/app">Back</Link></p>
      <h1>Premium</h1>
      <Notice code={sp.m} />
      {plan.effective === "premium" || plan.effective === "founding_member" ? (
        <p className="card">You already have Premium. <Link href="/app/billing">Billing</Link></p>
      ) : (
        <div className="card">
          <h2>{price ? formatPrice(price) : "Price unavailable"}</h2>
          <ul><li>Save, reopen and export your calculations</li><li>Customers, products and jobs</li><li>Dashboard and analysis</li><li>Advanced calculators and estimators</li><li>No ads</li></ul>
          <p className="hint">You pay {price ? formatPrice(price) : "the monthly price"} through Paystack. It renews each month until you stop it. You keep Premium until the end of the month you paid for.</p>
          {cfg && price ? (
            <form action={startCheckout}><button type="submit">Pay with Paystack</button></form>
          ) : (<p className="hint">Online payment is not switched on yet.</p>)}
          {cfg?.mode === "test" && <p className="hint" role="note">Test mode: no real money is charged.</p>}
        </div>
      )}
    </>
  );
}
