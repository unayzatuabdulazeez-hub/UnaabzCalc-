import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "../notice";
import { createClient } from "@/lib/supabase/server";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { createBusiness, signOut } from "./actions";
import { isAdminUser } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: ent }, { data: businesses }] = await Promise.all([
    supabase.from("entitlements").select("status,trial_start,trial_end,subscription_start,subscription_end,payment_status,cancellation_status").eq("user_id", user.id).maybeSingle(),
    supabase.from("businesses").select("id,name,business_type,currency,archived_at").is("archived_at", null).order("created_at", { ascending: true }),
  ]);
  const admin = await isAdminUser(supabase); // only decides whether to SHOW the link; the admin pages check again
  const plan = resolveEntitlement(ent); // decided on the server from the database row

  return (
    <>
      <h1>Your workspace</h1>
      <Notice code={sp.m} />
      <div className="card">
        <strong>Plan:</strong> {plan.hasPremium ? "Premium" : "Free"} <span className="muted">({plan.effective}{plan.premiumUntil ? `, until ${plan.premiumUntil.toISOString().slice(0, 10)}` : ""})</span> · <Link href="/app/billing">Billing</Link>{!plan.hasPremium && <> · <Link href="/app/upgrade">Get Premium</Link></>}{admin && <> · <Link href="/app/admin">Admin</Link></>}
      </div>
      <h2>Your businesses</h2>
      {businesses && businesses.length > 0 ? (
        businesses.map((b) => (<div className="card" key={b.id}><Link href={`/app/b/${b.id}`}><strong>{b.name}</strong></Link> <span className="muted">{b.business_type ?? ""} {b.currency}</span></div>))
      ) : (<p className="muted">No business yet. Add your first one below.</p>)}
      <h2>Add a business</h2>
      <form action={createBusiness}>
        <label htmlFor="name">Business name</label>
        <input id="name" name="name" required maxLength={120} />
        <label htmlFor="business_type">Type of business (optional)</label>
        <input id="business_type" name="business_type" maxLength={80} />
        <label htmlFor="phone">Phone (optional)</label>
        <input id="phone" name="phone" type="tel" maxLength={30} />
        <label htmlFor="currency">Currency</label>
        <input id="currency" name="currency" defaultValue="NGN" maxLength={3} />
        <button type="submit">Save business</button>
      </form>
      <form action={signOut}><button className="link" type="submit">Sign out</button></form>
    </>
  );
}
