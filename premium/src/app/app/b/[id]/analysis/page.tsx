import Link from "next/link";
import { PlanBanner } from "@/app/plan-banner";
import { AdFor } from "@/app/ad-for";
import { PrintButton } from "@/app/print-button";
import { koboMoney, pctText } from "@/app/money";
import { businessContext } from "@/lib/server/context";
import { loadBusinessData } from "@/lib/server/business-data";
import { analyse, type JobRow } from "@/lib/analysis/business";
import { STATUS_LABEL } from "@/lib/export/records";
import { getAdapter } from "@/lib/calc/adapters";

export const dynamic = "force-dynamic";

/** Everything here is worked out from what you entered. "Value" is the agreed amount on a job, not money received. */
export default async function Analysis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await businessContext(id);
  const { data, truncated } = await loadBusinessData(ctx, id);
  const a = analyse({ ...data, jobs: data.jobs as unknown as JobRow[], now: new Date() });
  const topMonth = Math.max(1, ...a.months.map((m) => m.valueKobo));
  return (
    <>
      <p className="noprint"><Link href={`/app/b/${id}`}>{ctx.business.name}</Link></p>
      <h1>Business analysis</h1>
      <PlanBanner hasPremium={ctx.plan.hasPremium} />
      <AdFor hasPremium={ctx.plan.hasPremium} />
      <p className="muted">As at {a.today} (Lagos time). Worked out from the jobs, customers, products and calculations you entered. “Value” means the agreed amount on a job; the app does not record payments, so it is not money received.</p>
      {truncated.length > 0 && <p role="note" className="card">Only the newest 5,000 rows of {truncated.join(", ")} were analysed.</p>}
      <p className="noprint"><a className="btn" href={`/app/b/${id}/analysis/export/xlsx`}>Download Excel</a> <PrintButton /></p>

      <h2>Jobs by status</h2>
      <div className="card tablewrap"><table><thead><tr><th scope="col">Status</th><th scope="col">Jobs</th><th scope="col">With an amount</th><th scope="col">Agreed amount</th></tr></thead>
        <tbody>{a.byStatus.map((s) => <tr key={s.status}><td>{STATUS_LABEL[s.status]}</td><td>{s.count}</td><td>{s.withAmount}</td><td>{koboMoney(s.valueKobo)}</td></tr>)}</tbody></table></div>
      <div className="card">
        <div className="row"><span>Open (quotes + in progress)</span><b>{koboMoney(a.openValueKobo)}</b></div>
        <div className="row"><span>Completed</span><b>{koboMoney(a.completedValueKobo)}</b></div>
        <div className="row"><span>Jobs without an amount</span><b>{a.jobsWithoutAmount}</b></div>
        <div className="row"><span>Jobs without a customer</span><b>{a.jobsWithoutCustomer}</b></div>
      </div>

      <h2>Deadlines</h2>
      {a.overdue.length === 0 && a.dueSoon.length === 0 ? <p className="muted">No open job is overdue or due in the next 7 days.{a.noDueDate > 0 ? ` ${a.noDueDate} open job(s) have no due date.` : ""}</p> : (
        <div className="card">
          {a.overdue.map((d) => <div className="row" key={d.id}><span><Link href={`/app/b/${id}/jobs`}>{d.title}</Link> <span className="bad">overdue by {-d.days} day{d.days === -1 ? "" : "s"}</span></span><b>{d.valueKobo === null ? "—" : koboMoney(d.valueKobo)}</b></div>)}
          {a.dueSoon.map((d) => <div className="row" key={d.id}><span><Link href={`/app/b/${id}/jobs`}>{d.title}</Link> <span className="muted">{d.days === 0 ? "due today" : `due in ${d.days} day${d.days === 1 ? "" : "s"}`}</span></span><b>{d.valueKobo === null ? "—" : koboMoney(d.valueKobo)}</b></div>)}
          {a.noDueDate > 0 && <p className="hint">{a.noDueDate} open job(s) have no due date.</p>}
        </div>
      )}

      <h2>Top customers</h2>
      {a.topCustomers.length === 0 ? <p className="muted">Link jobs to customers to see who brings in the most. Cancelled jobs are left out.</p> : (
        <div className="card">{a.topCustomers.map((c) => <div className="row" key={c.id}><span>{c.name} <span className="muted">({c.jobs} job{c.jobs === 1 ? "" : "s"})</span></span><b>{koboMoney(c.valueKobo)}</b></div>)}
          <p className="hint">{a.customersWithoutJobs} customer(s) have no jobs yet.</p></div>
      )}

      <h2>Product margins</h2>
      {a.products.priced === 0 ? <p className="muted">Add a cost price and a selling price to your products to see their margins. {a.products.unpriced} product(s) are missing a price.</p> : (<>
        <p>Average margin <b>{pctText(a.products.averageMarginPct)}</b> (profit as a share of the selling price) · average markup <b>{pctText(a.products.averageMarkupPct)}</b> (profit as a share of cost) across {a.products.priced} priced product(s).{a.products.unpriced > 0 ? ` ${a.products.unpriced} product(s) are missing a price.` : ""}</p>
        {a.products.belowCost.length > 0 && <p role="alert" className="err">{a.products.belowCost.length} product(s) sell below cost: {a.products.belowCost.map((p) => p.name).join(", ")}.</p>}
        <div className="card tablewrap"><table><thead><tr><th scope="col">Lowest margins</th><th scope="col">Cost</th><th scope="col">Selling</th><th scope="col">Margin</th></tr></thead>
          <tbody>{a.products.lowest.map((p) => <tr key={p.id}><td>{p.name}</td><td>{koboMoney(p.costKobo)}</td><td>{koboMoney(p.sellKobo)}</td><td className={p.marginPct < 0 ? "bad" : ""}>{pctText(p.marginPct)}</td></tr>)}</tbody></table></div>
      </>)}

      <h2>Last six months</h2>
      <div className="card tablewrap"><table><thead><tr><th scope="col">Month</th><th scope="col">Jobs added</th><th scope="col">Agreed amount</th><th scope="col">Calculations saved</th></tr></thead>
        <tbody>{a.months.map((m) => <tr key={m.month}><td>{m.month}</td><td>{m.jobs}</td><td>{koboMoney(m.valueKobo)}<div className="bar" style={{ width: `${Math.round((m.valueKobo / topMonth) * 100)}%` }} aria-hidden="true" /></td><td>{m.calculations}</td></tr>)}</tbody></table>
        <p className="hint">Months are by the date the job or calculation was added, not the date it was finished. Cancelled jobs are left out.</p></div>

      <h2>Saved calculations by type</h2>
      {a.calculationsByType.length === 0 ? <p className="muted">Nothing saved yet.</p> : <div className="card">{a.calculationsByType.map((c) => <div className="row" key={c.calculator_id}><span>{getAdapter(c.calculator_id)?.name ?? c.calculator_id}</span><b>{c.count}</b></div>)}</div>}
    </>
  );
}
