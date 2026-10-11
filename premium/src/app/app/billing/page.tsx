import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/app/notice";
import { createClient } from "@/lib/supabase/server";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { paymentsConfig } from "@/lib/payments/load-price";
import { koboMoney } from "@/app/money";
import { openManageLink } from "./actions";

export const dynamic = "force-dynamic";
const day = (v: string | null) => (v ? new Date(new Date(v).getTime() + 3600_000).toISOString().slice(0, 10) : ""); // Africa/Lagos is UTC+1, no daylight saving

export default async function Billing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: ent }, { data: pays }] = await Promise.all([
    supabase.from("entitlements").select("status,trial_start,trial_end,subscription_start,subscription_end,payment_status,cancellation_status,paystack_subscription_code").eq("user_id", user.id).maybeSingle(),
    supabase.from("payments").select("reference,kind,status,amount_kobo,paid_at,created_at,note").order("created_at", { ascending: false }).limit(50),
  ]);
  const plan = resolveEntitlement(ent), cfg = paymentsConfig();
  return (
    <>
      <p><Link href="/app">Back</Link></p>
      <h1>Billing</h1>
      <Notice code={sp.m} />
      {cfg?.mode === "test" && <p className="card" role="note">Payments are in test mode. No real money is charged.</p>}
      <div className="card">
        <p><strong>Plan:</strong> {plan.hasPremium ? "Premium" : "Free"} <span className="muted">({plan.effective})</span></p>
        {plan.premiumUntil && <p>Premium until <b>{day(plan.premiumUntil.toISOString())}</b>{ent?.cancellation_status === "scheduled" || ent?.status === "cancelled" ? ". It will not renew after that." : ""}</p>}
        {!plan.hasPremium && <p><Link className="btn" href="/app/upgrade">Get Premium</Link></p>}
        {ent?.paystack_subscription_code && cfg && <form action={openManageLink}><button type="submit">Manage or cancel subscription</button></form>}
      </div>
      <h2>Payments</h2>
      {pays && pays.length > 0 ? (
        <div className="tablewrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>
          {pays.map((p) => (<tr key={p.reference}><td>{day(p.paid_at ?? p.created_at)}</td><td>{p.amount_kobo != null ? koboMoney(p.amount_kobo) : ""}</td><td>{p.status}</td><td>{p.reference}</td></tr>))}
        </tbody></table></div>
      ) : <p className="muted">No payments yet.</p>}
      <p className="hint">Refunds and payment problems are handled by contacting support with the reference above.</p>
    </>
  );
}
