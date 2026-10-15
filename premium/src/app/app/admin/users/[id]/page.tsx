import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/app/notice";
import { requireAdmin } from "@/lib/server/admin";
import { isUuid } from "@/lib/validation/common";
import { lagosDateTime } from "@/lib/admin/stats";
import { koboMoney } from "@/app/money";
import { endPaidAccess, grantComplimentary, revokeComplimentary } from "../../actions";
import type { SearchParams } from "@/lib/server/context";

export const dynamic = "force-dynamic";
interface Payment { reference: string; kind: string; status: string; amount_kobo: number | null; expected_amount_kobo: number | null; currency: string | null; paid_at: string | null; created_at: string; note: string | null }
interface Detail { user_id: string; email: string | null; full_name: string | null; signed_up: string; status: string; premium_now: boolean; subscription_start: string | null; subscription_end: string | null; trial_end: string | null; payment_status: string; cancellation_status: string; paystack_customer_code: string | null; paystack_subscription_code: string | null; grant_reason: string | null; payments: Payment[]; history: { at: string; action: string; details: Record<string, unknown> }[] }
const ACTION: Record<string, string> = { grant_complimentary: "Gave free Premium", revoke_complimentary: "Ended free Premium", end_paid_access: "Ended paid access", admin_view_user: "Admin opened this page", paystack_payment: "Paystack payment recorded" };

export default async function UserDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_user_detail", { p_user: id });
  if (error || !data) notFound();
  const d = data as Detail;
  const grant = grantComplimentary.bind(null, id), revoke = revokeComplimentary.bind(null, id), end = endPaidAccess.bind(null, id);
  return (
    <>
      <p><Link href="/app/admin/users">All users</Link></p>
      <h1 style={{ overflowWrap: "anywhere" }}>{d.email ?? "Account"}</h1>
      <Notice code={sp.m} />
      <div className="card">
        {d.full_name && <div className="row"><span>Name</span><b className="wrapv">{d.full_name}</b></div>}
        <div className="row"><span>Joined</span><b>{lagosDateTime(d.signed_up)}</b></div>
        <div className="row"><span>Plan</span><b>{d.status.replace("_", " ")}{d.cancellation_status === "scheduled" ? " (won't renew)" : ""}</b></div>
        <div className="row"><span>Has Premium now</span><b className={d.premium_now ? "good" : ""}>{d.premium_now ? "Yes" : "No"}</b></div>
        <div className="row"><span>Paid until (Lagos)</span><b>{lagosDateTime(d.subscription_end) || "n/a"}</b></div>
        <div className="row"><span>Payment status</span><b>{d.payment_status}</b></div>
        {d.grant_reason && <div className="row"><span>Last admin note</span><b className="wrapv">{d.grant_reason}</b></div>}
        <div className="row"><span>Paystack customer</span><b className="wrapv">{d.paystack_customer_code ?? "not linked"}</b></div>
        <div className="row"><span>Paystack subscription</span><b className="wrapv">{d.paystack_subscription_code ?? "none"}</b></div>
      </div>
      <p className="hint">Admins see account, plan and payment details only. A person&apos;s customers, jobs, products and saved calculations are not available here.</p>

      <h2>Payments</h2>
      {d.payments.length === 0 ? <p className="muted">No payments.</p> : (
        <div className="tablewrap"><table><thead><tr><th>When (Lagos)</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>
          {d.payments.map((p) => (<tr key={p.reference}><td>{lagosDateTime(p.paid_at ?? p.created_at)}</td>
            <td>{p.amount_kobo != null ? (p.currency && p.currency !== "NGN" ? `${p.amount_kobo / 100} ${p.currency}` : koboMoney(p.amount_kobo)) : ""}</td>
            <td className={p.status === "mismatch" ? "bad" : ""}>{p.status}{p.kind === "renewal" ? " (renewal)" : ""}</td>
            <td>{p.reference}{p.note ? <div className="hint">{p.note}</div> : null}</td></tr>))}
        </tbody></table></div>
      )}

      <h2>What admins have done</h2>
      {d.history.length === 0 ? <p className="muted">Nothing yet.</p> : d.history.map((h, i) => (
        <div className="row" key={i}><span>{lagosDateTime(h.at)} · {ACTION[h.action] ?? h.action}{typeof h.details?.reason === "string" ? `: ${h.details.reason}` : ""}</span></div>
      ))}

      <h2>Actions</h2>
      <p className="hint">Every action needs a written reason and is saved in the audit log with your name.</p>
      {(d.status === "free" || d.status === "expired" || d.status === "trial" || d.status === "cancelled") && (
        <form action={grant} className="card"><h3>Give free Premium (complimentary)</h3>
          <label htmlFor="days">For how many days (1 to 365)</label><input id="days" name="days" inputMode="numeric" defaultValue="30" maxLength={3} required />
          <label htmlFor="r1">Reason</label><input id="r1" name="reason" maxLength={500} required />
          <button type="submit">Give free Premium</button></form>
      )}
      {d.status === "complimentary" && (
        <form action={revoke} className="card"><h3>End free Premium</h3>
          <label htmlFor="r2">Reason</label><input id="r2" name="reason" maxLength={500} required />
          <button type="submit">End free Premium</button></form>
      )}
      {(d.status === "premium" || d.status === "cancelled" || d.status === "trial") && (
        <form action={end} className="card"><h3>End paid access after a refund</h3>
          <p className="hint">Do the refund in Paystack first. This only stops access here and marks the account as refunded.</p>
          <label htmlFor="r3">Reason (for example, the refund reference)</label><input id="r3" name="reason" maxLength={500} required />
          <button type="submit">End access now</button></form>
      )}
    </>
  );
}
