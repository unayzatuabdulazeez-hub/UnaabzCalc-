import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin";
import { parseAdminStats, lagosDateTime } from "@/lib/admin/stats";
import { koboMoney } from "@/app/money";

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = { free: "Free", trial: "Trial", premium: "Premium (paid)", founding_member: "Founding member", complimentary: "Complimentary", expired: "Expired", cancelled: "Cancelled (still paid up)" };

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_stats");
  if (error) return (<><h1>Admin overview</h1><p role="alert" className="err">The statistics could not be loaded. Try again.</p></>);
  const s = parseAdminStats(data);
  const tile = (label: string, value: string | number, hint?: string, href?: string, bad = false) => (
    <div className="card"><p className="hint">{label}</p><p><b className={bad ? "bad" : ""}>{href ? <Link href={href}>{value}</Link> : value}</b></p>{hint && <p className="hint">{hint}</p>}</div>
  );
  return (
    <>
      <h1>Admin overview</h1>
      <p className="hint">Updated {lagosDateTime(s.generatedAt)} (Lagos time). Only account, plan and payment figures are shown here, never anyone's business records.</p>
      <h2>People</h2>
      <div className="grid2">
        {tile("All accounts", s.users_total, undefined, "/app/admin/users")}
        {tile("Has Premium now", s.premium_now, "paid, trial, complimentary and founding", "/app/admin/users?filter=premium_now")}
        {tile("Paying now", s.paying_now, "paid and not yet ended", "/app/admin/users?filter=paying")}
        {tile("Ends within 7 days", s.expiring_7d, undefined, "/app/admin/users?filter=expiring_soon")}
        {tile("Will not renew", s.will_not_renew, "cancelled, still paid up")}
        {tile("New in 7 days", s.signups_7d, `${s.signups_30d} in 30 days`)}
      </div>
      <h2>Money (verified naira payments)</h2>
      <div className="grid2">
        {tile("This month", koboMoney(s.revenue_kobo_this_month))}
        {tile("Last 30 days", koboMoney(s.revenue_kobo_30d))}
        {tile("All time", koboMoney(s.revenue_kobo_all), `${s.payments_success} successful payments`)}
        {tile("Mismatched payments", s.payments_mismatch, "no access was given", "/app/admin/payments?filter=mismatch", s.payments_mismatch > 0)}
        {tile("Pending over 1 hour", s.payments_pending_over_1h, "started but never confirmed", "/app/admin/payments?filter=pending", s.payments_pending_over_1h > 0)}
      </div>
      <p className="hint">These are payments Paystack confirmed. Paystack&apos;s fees are not taken off, and refunds you make in Paystack are not subtracted.</p>
      {s.revenueByMonth.length > 0 && (<div className="tablewrap"><table><thead><tr><th>Month</th><th>Confirmed payments</th></tr></thead><tbody>{s.revenueByMonth.map((r) => <tr key={r.month}><td>{r.month}</td><td>{koboMoney(r.amountKobo)}</td></tr>)}</tbody></table></div>)}
      <h2>Payment messages from Paystack (last 24 hours)</h2>
      <div className="grid2">
        {tile("Received", s.webhooks_24h)}
        {tile("Problems", s.webhook_problems_24h, "errors, unverified or stuck", "/app/admin/webhooks", s.webhook_problems_24h > 0)}
      </div>
      <h2>Accounts by plan</h2>
      <div className="card">{Object.entries(s.byStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div className="row" key={k}><span>{LABEL[k] ?? k}</span><b>{v}</b></div>)}</div>
    </>
  );
}
