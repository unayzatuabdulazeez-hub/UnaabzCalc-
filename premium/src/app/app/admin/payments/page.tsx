import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin";
import { PAGE_SIZE, PAYMENT_FILTERS, listHref, pageInfo, parseListParams } from "@/lib/admin/params";
import { lagosDateTime } from "@/lib/admin/stats";
import { koboMoney } from "@/app/money";
import type { SearchParams } from "@/lib/server/context";

export const dynamic = "force-dynamic";
const BASE = "/app/admin/payments";
interface Row { reference: string; email: string | null; kind: string; status: string; amount_kobo: number | null; expected_amount_kobo: number | null; currency: string | null; paid_at: string | null; created_at: string; note: string | null; user_id: string; total: number | string }

export default async function Payments({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await requireAdmin();
  const p = parseListParams(await searchParams, PAYMENT_FILTERS);
  const { data, error } = await supabase.rpc("admin_list_payments", { p_search: p.q || null, p_status: p.filter, p_limit: p.limit, p_offset: p.offset });
  const rows = (data ?? []) as Row[];
  const info = pageInfo(rows.length ? Number(rows[0]!.total) : 0, p.page);
  return (
    <>
      <h1>Payments</h1>
      <form method="get">
        <label htmlFor="q">Search by reference or e-mail</label><input id="q" name="q" defaultValue={p.q} maxLength={100} />
        <label htmlFor="filter">Show</label>
        <select id="filter" name="filter" defaultValue={p.filter}>{PAYMENT_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="submit">Search</button>
      </form>
      {error && <p role="alert" className="err">The list could not be loaded. Try again.</p>}
      <p className="hint">{info.total === 0 ? "No payments match." : `Showing ${info.from} to ${info.to} of ${info.total}`}</p>
      <div className="tablewrap"><table><thead><tr><th>When (Lagos)</th><th>Person</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.reference}>
          <td>{lagosDateTime(r.paid_at ?? r.created_at)}</td>
          <td><Link href={`/app/admin/users/${r.user_id}`}>{r.email ?? "(deleted account)"}</Link></td>
          <td>{r.amount_kobo != null ? (r.currency && r.currency !== "NGN" ? `${r.amount_kobo / 100} ${r.currency}` : koboMoney(r.amount_kobo)) : ""}{r.status === "mismatch" && r.expected_amount_kobo != null ? <span className="hint"> expected {koboMoney(r.expected_amount_kobo)}</span> : null}</td>
          <td className={r.status === "mismatch" ? "bad" : ""}>{r.status}{r.kind === "renewal" ? " (renewal)" : ""}</td>
          <td>{r.reference}{r.note ? <div className="hint">{r.note}</div> : null}</td>
        </tr>))}
      </tbody></table></div>
      <p>
        {info.hasPrev && <Link href={listHref(BASE, { ...p, page: p.page - 1 }, "all")}>Previous</Link>}
        {info.hasPrev && info.hasNext && " · "}
        {info.hasNext && <Link href={listHref(BASE, { ...p, page: p.page + 1 }, "all")}>Next</Link>}
        <span className="hint"> Page {Math.min(p.page, info.pages)} of {info.pages} ({PAGE_SIZE} per page)</span>
      </p>
    </>
  );
}
