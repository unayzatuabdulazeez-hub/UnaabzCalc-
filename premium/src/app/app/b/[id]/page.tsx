import Link from "next/link";
import { PlanBanner } from "@/app/plan-banner";
import { AdFor } from "@/app/ad-for";
import { koboMoney } from "@/app/money";
import { businessContext } from "@/lib/server/context";
import { loadBusinessData } from "@/lib/server/business-data";
import { analyse, type JobRow } from "@/lib/analysis/business";
import { getAdapter } from "@/lib/calc/adapters";

export const dynamic = "force-dynamic";

export default async function BusinessHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await businessContext(id);
  const { data, truncated } = await loadBusinessData(ctx, id);
  const a = analyse({ ...data, jobs: data.jobs as unknown as JobRow[], now: new Date() });
  const recent = data.calculations.filter((c) => !c.archived_at).slice(0, 5);
  const c = a.counts;
  const empty = c.customers + c.products + c.jobs + c.calculations === 0;
  const base = `/app/b/${id}`;
  return (
    <>
      <p><Link href="/app">All businesses</Link></p>
      <h1>{ctx.business.name}</h1>
      <PlanBanner hasPremium={ctx.plan.hasPremium} />
      <AdFor hasPremium={ctx.plan.hasPremium} />
      {truncated.length > 0 && <p role="note" className="card">This page uses your newest 5,000 rows of {truncated.join(", ")}.</p>}

      {empty ? (
        <div className="card"><h2>Get started</h2>
          <ol><li><Link href={`${base}/calculations/new`}>Try a calculator</Link> (the everyday ones work on any plan)</li>
            <li><Link href={`${base}/customers`}>Add a customer</Link></li><li><Link href={`${base}/products`}>Add a product</Link></li>
            <li><Link href={`${base}/jobs`}>Add a job</Link> and give it an agreed amount and a due date</li></ol>
          <p className="hint">Adding records needs Premium. Everything on this page is worked out from what you enter.</p></div>
      ) : (<>
        <div className="grid2">
          <div className="card"><p className="hint">Open jobs value</p><p><b>{koboMoney(a.openValueKobo)}</b></p><p className="hint">quotes + in progress (agreed amounts)</p></div>
          <div className="card"><p className="hint">Completed jobs value</p><p><b>{koboMoney(a.completedValueKobo)}</b></p><p className="hint">agreed amounts, not money received</p></div>
          <div className="card"><p className="hint">Active jobs</p><p><b>{c.jobs}</b></p></div>
          <div className="card"><p className="hint">Past their due date</p><p><b className={a.overdue.length ? "bad" : ""}>{a.overdue.length}</b></p></div>
        </div>
        {a.products.belowCost.length > 0 && <p role="alert" className="err">{a.products.belowCost.length} product(s) sell below cost: {a.products.belowCost.slice(0, 3).map((p) => p.name).join(", ")}{a.products.belowCost.length > 3 ? "…" : ""}. <Link href={`${base}/analysis`}>See margins</Link></p>}

        <h2>Needs attention</h2>
        {a.overdue.length + a.dueSoon.length === 0 ? <p className="muted">No open job is overdue or due in the next 7 days.</p> : (
          <div className="card">
            {[...a.overdue, ...a.dueSoon].slice(0, 6).map((d) => <div className="row" key={d.id}><span><Link href={`${base}/jobs`}>{d.title}</Link> {d.days < 0 ? <span className="bad">overdue by {-d.days} day{d.days === -1 ? "" : "s"}</span> : <span className="muted">{d.days === 0 ? "due today" : `due in ${d.days} day${d.days === 1 ? "" : "s"}`}</span>}</span><b>{d.valueKobo === null ? "—" : koboMoney(d.valueKobo)}</b></div>)}
          </div>
        )}

        <h2>Recent calculations</h2>
        {recent.length === 0 ? <p className="muted">Nothing saved yet.</p> : <div className="card">{recent.map((r) => <div className="row" key={r.id}><span><Link href={`${base}/calculations/${r.id}`}>{r.title}</Link></span><span className="muted">{getAdapter(r.calculator_id)?.name ?? r.calculator_id} · {r.created_at.slice(0, 10)}</span></div>)}</div>}
      </>)}

      <h2>Go to</h2>
      <div className="card"><Link href={`${base}/calculations/new`}>New calculation</Link> · <Link href={`${base}/calculations`}>Saved calculations ({c.calculations})</Link></div>
      <div className="card"><Link href={`${base}/customers`}>Customers ({c.customers})</Link> · <Link href={`${base}/products`}>Products ({c.products})</Link> · <Link href={`${base}/jobs`}>Jobs ({c.jobs})</Link></div>
      <div className="card"><Link href={`${base}/records`}>Records and search</Link> · <Link href={`${base}/analysis`}>Business analysis</Link></div>
    </>
  );
}
