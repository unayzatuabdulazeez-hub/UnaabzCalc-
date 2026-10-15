import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin";
import { PAGE_SIZE, USER_FILTERS, listHref, pageInfo, parseListParams } from "@/lib/admin/params";
import { lagosDay } from "@/lib/admin/stats";
import type { SearchParams } from "@/lib/server/context";

export const dynamic = "force-dynamic";
const BASE = "/app/admin/users";
interface Row { user_id: string; email: string | null; full_name: string | null; signed_up: string; status: string; premium_now: boolean; subscription_end: string | null; payment_status: string; cancellation_status: string; linked_to_paystack: boolean; total: number | string }

export default async function Users({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await requireAdmin();
  const p = parseListParams(await searchParams, USER_FILTERS);
  const { data, error } = await supabase.rpc("admin_list_users", { p_search: p.q || null, p_filter: p.filter, p_limit: p.limit, p_offset: p.offset });
  const rows = (data ?? []) as Row[];
  const info = pageInfo(rows.length ? Number(rows[0]!.total) : 0, p.page);
  return (
    <>
      <h1>Users</h1>
      <form method="get">
        <label htmlFor="q">Search by e-mail or name</label><input id="q" name="q" defaultValue={p.q} maxLength={100} />
        <label htmlFor="filter">Show</label>
        <select id="filter" name="filter" defaultValue={p.filter}>{USER_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="submit">Search</button>
      </form>
      {error && <p role="alert" className="err">The list could not be loaded. Try again.</p>}
      <p className="hint">{info.total === 0 ? "No accounts match." : `Showing ${info.from} to ${info.to} of ${info.total}`}</p>
      <div className="tablewrap"><table><thead><tr><th>Person</th><th>Plan</th><th>Premium now</th><th>Paid until (Lagos)</th><th>Joined</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.user_id}>
          <td><Link href={`${BASE}/${r.user_id}`}>{r.email ?? r.user_id}</Link>{r.full_name ? <span className="hint"> {r.full_name}</span> : null}</td>
          <td>{r.status.replace("_", " ")}{r.cancellation_status === "scheduled" ? " (won't renew)" : ""}</td>
          <td>{r.premium_now ? "Yes" : "No"}</td><td>{lagosDay(r.subscription_end)}</td><td>{lagosDay(r.signed_up)}</td>
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
