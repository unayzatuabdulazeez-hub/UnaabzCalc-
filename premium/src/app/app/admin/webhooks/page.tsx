import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin";
import { PAGE_SIZE, WEBHOOK_FILTERS, listHref, pageInfo, parseListParams } from "@/lib/admin/params";
import { lagosDateTime } from "@/lib/admin/stats";
import type { SearchParams } from "@/lib/server/context";

export const dynamic = "force-dynamic";
const BASE = "/app/admin/webhooks";
interface Row { id: number; received_at: string; event: string; outcome: string | null; detail: string | null; total: number | string }
const GOOD = new Set(["granted", "duplicate", "updated", "ignored", "logged", "recorded_no_change"]);

export default async function Webhooks({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await requireAdmin();
  const p = parseListParams(await searchParams, WEBHOOK_FILTERS);
  const { data, error } = await supabase.rpc("admin_list_webhooks", { p_filter: p.filter, p_limit: p.limit, p_offset: p.offset });
  const rows = (data ?? []) as Row[];
  const info = pageInfo(rows.length ? Number(rows[0]!.total) : 0, p.page);
  return (
    <>
      <h1>Paystack messages</h1>
      <p className="hint">Each row is a message Paystack sent to this app. &quot;error&quot; means we could not finish (Paystack tries again on its own). &quot;not_verified&quot; or &quot;rejected&quot; means Paystack did not confirm the payment, or it was not for this plan, so nothing was granted. A row with no result for over 2 minutes is stuck.</p>
      <form method="get">
        <label htmlFor="filter">Show</label>
        <select id="filter" name="filter" defaultValue={p.filter}>{WEBHOOK_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="submit">Show</button>
      </form>
      {error && <p role="alert" className="err">The list could not be loaded. Try again.</p>}
      <p className="hint">{info.total === 0 ? "Nothing to show." : `Showing ${info.from} to ${info.to} of ${info.total}`}</p>
      <div className="tablewrap"><table><thead><tr><th>Received (Lagos)</th><th>Event</th><th>Result</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.id}>
          <td>{lagosDateTime(r.received_at)}</td><td>{r.event}</td>
          <td className={r.outcome && GOOD.has(r.outcome) ? "good" : "bad"}>{r.outcome ?? "no result yet"}{r.detail ? <div className="hint">{r.detail}</div> : null}</td>
        </tr>))}
      </tbody></table></div>
      <p>
        {info.hasPrev && <Link href={listHref(BASE, { ...p, page: p.page - 1 }, "problems")}>Previous</Link>}
        {info.hasPrev && info.hasNext && " · "}
        {info.hasNext && <Link href={listHref(BASE, { ...p, page: p.page + 1 }, "problems")}>Next</Link>}
        <span className="hint"> Page {Math.min(p.page, info.pages)} of {info.pages} ({PAGE_SIZE} per page)</span>
      </p>
    </>
  );
}
