/**
 * Business analysis: pure functions, no database, no UI, no network.
 * Built ONLY from what the owner entered (jobs, customers, products, saved calculations). Nothing is invented:
 *  - "value" means the agreed amount typed on a job. It is NOT money received (there is no payments record yet).
 *  - Money is added in whole kobo (integers), so totals never drift by a fraction of a kobo.
 *  - Days and months are Africa/Lagos (UTC+1, no daylight saving).
 */
export type JobStatus = "quote" | "in_progress" | "completed" | "cancelled";
export const JOB_STATUSES: readonly JobStatus[] = ["quote", "in_progress", "completed", "cancelled"];
export interface JobRow { id: string; title: string; status: JobStatus; due_date: string | null; agreed_amount: number | string | null; customer_id: string | null; created_at: string; archived_at: string | null }
export interface CustomerRow { id: string; name: string; archived_at: string | null }
export interface ProductRow { id: string; name: string; cost_price: number | string | null; selling_price: number | string | null; archived_at: string | null }
export interface CalcRow { id: string; calculator_id: string; title: string; created_at: string; archived_at: string | null }
export interface AnalysisInput { jobs: JobRow[]; customers: CustomerRow[]; products: ProductRow[]; calculations: CalcRow[]; now: Date }

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
/** YYYY-MM-DD in Africa/Lagos for an instant. */
export const lagosDay = (d: Date): string => new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
export const lagosMonth = (iso: string): string => lagosDay(new Date(iso)).slice(0, 7);
const addDays = (day: string, n: number): string => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
/** Whole kobo from a numeric(14,2) value that may arrive as a number or a string. Not-a-number gives null. */
export const kobo = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
export const naira = (k: number) => k / 100;

export interface StatusLine { status: JobStatus; count: number; withAmount: number; valueKobo: number }
export interface DueJob { id: string; title: string; status: JobStatus; due: string; days: number; valueKobo: number | null }
export interface CustomerLine { id: string; name: string; jobs: number; valueKobo: number }
export interface ProductMargin { id: string; name: string; costKobo: number; sellKobo: number; marginPct: number; markupPct: number }
export interface MonthLine { month: string; jobs: number; valueKobo: number; calculations: number }

export interface Analysis {
  today: string;
  counts: { customers: number; products: number; jobs: number; calculations: number; archivedJobs: number; archivedCustomers: number; archivedProducts: number; archivedCalculations: number };
  byStatus: StatusLine[];                       // active (not archived) jobs
  openValueKobo: number;                        // quote + in_progress agreed amounts
  quoteValueKobo: number; inProgressValueKobo: number; completedValueKobo: number;
  jobsWithoutAmount: number;                    // non-cancelled active jobs with no agreed amount
  overdue: DueJob[]; dueSoon: DueJob[];         // overdue: due before today; dueSoon: today .. +7 days; open jobs only
  noDueDate: number;                            // open jobs without a due date
  topCustomers: CustomerLine[];                 // by agreed value of non-cancelled jobs, max 5
  customersWithoutJobs: number;
  jobsWithoutCustomer: number;
  products: { priced: number; unpriced: number; belowCost: ProductMargin[]; lowest: ProductMargin[]; averageMarginPct: number | null; averageMarkupPct: number | null };
  calculationsByType: { calculator_id: string; count: number }[];
  months: MonthLine[];                          // last 6 Lagos months, oldest first, includes empty months
}

export function analyse(inp: AnalysisInput): Analysis {
  const today = lagosDay(inp.now);
  const jobs = inp.jobs.filter((j) => !j.archived_at), customers = inp.customers.filter((c) => !c.archived_at);
  const products = inp.products.filter((p) => !p.archived_at), calcs = inp.calculations.filter((c) => !c.archived_at);

  const byStatus: StatusLine[] = JOB_STATUSES.map((status) => {
    const js = jobs.filter((j) => j.status === status); let withAmount = 0, valueKobo = 0;
    for (const j of js) { const k = kobo(j.agreed_amount); if (k !== null) { withAmount++; valueKobo += k; } }
    return { status, count: js.length, withAmount, valueKobo };
  });
  const val = (s: JobStatus) => byStatus.find((x) => x.status === s)!.valueKobo;
  const open = jobs.filter((j) => j.status === "quote" || j.status === "in_progress");

  const dueOf = (j: JobRow): DueJob | null => {
    if (!j.due_date) return null;
    const days = Math.round((Date.parse(j.due_date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
    return { id: j.id, title: j.title, status: j.status, due: j.due_date, days, valueKobo: kobo(j.agreed_amount) };
  };
  const dues = open.map(dueOf).filter((d): d is DueJob => d !== null);
  const overdue = dues.filter((d) => d.days < 0).sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));
  const dueSoon = dues.filter((d) => d.days >= 0 && d.days <= 7).sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));

  const live = jobs.filter((j) => j.status !== "cancelled");
  const per = new Map<string, { jobs: number; valueKobo: number }>();
  for (const j of live) if (j.customer_id) { const e = per.get(j.customer_id) ?? { jobs: 0, valueKobo: 0 }; e.jobs++; e.valueKobo += kobo(j.agreed_amount) ?? 0; per.set(j.customer_id, e); }
  const names = new Map(customers.map((c) => [c.id, c.name]));
  const topCustomers = [...per.entries()].filter(([id]) => names.has(id)).map(([id, e]) => ({ id, name: names.get(id)!, ...e }))
    .sort((a, b) => b.valueKobo - a.valueKobo || b.jobs - a.jobs || a.name.localeCompare(b.name)).slice(0, 5);

  const margins: ProductMargin[] = [];
  let unpriced = 0;
  for (const p of products) {
    const c = kobo(p.cost_price), s = kobo(p.selling_price);
    if (c === null || s === null || s <= 0) { unpriced++; continue; }
    margins.push({ id: p.id, name: p.name, costKobo: c, sellKobo: s, marginPct: (s - c) / s * 100, markupPct: c > 0 ? (s - c) / c * 100 : NaN });
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const byMargin = [...margins].sort((a, b) => a.marginPct - b.marginPct || a.name.localeCompare(b.name));

  const typeCount = new Map<string, number>();
  for (const c of calcs) typeCount.set(c.calculator_id, (typeCount.get(c.calculator_id) ?? 0) + 1);

  const thisMonth = today.slice(0, 7);
  const months: MonthLine[] = [];
  for (let i = 5; i >= 0; i--) { const [y, m] = thisMonth.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, m - 1 - i, 1)); months.push({ month: d.toISOString().slice(0, 7), jobs: 0, valueKobo: 0, calculations: 0 }); }
  for (const j of live) { const m = months.find((x) => x.month === lagosMonth(j.created_at)); if (m) { m.jobs++; m.valueKobo += kobo(j.agreed_amount) ?? 0; } }
  for (const c of calcs) { const m = months.find((x) => x.month === lagosMonth(c.created_at)); if (m) m.calculations++; }

  return {
    today,
    counts: { customers: customers.length, products: products.length, jobs: jobs.length, calculations: calcs.length,
      archivedJobs: inp.jobs.length - jobs.length, archivedCustomers: inp.customers.length - customers.length, archivedProducts: inp.products.length - products.length, archivedCalculations: inp.calculations.length - calcs.length },
    byStatus, openValueKobo: val("quote") + val("in_progress"), quoteValueKobo: val("quote"), inProgressValueKobo: val("in_progress"), completedValueKobo: val("completed"),
    jobsWithoutAmount: live.filter((j) => kobo(j.agreed_amount) === null).length,
    overdue, dueSoon, noDueDate: open.filter((j) => !j.due_date).length,
    topCustomers,
    customersWithoutJobs: customers.filter((c) => !per.has(c.id)).length,
    jobsWithoutCustomer: live.filter((j) => !j.customer_id).length,
    products: { priced: margins.length, unpriced, belowCost: byMargin.filter((m) => m.sellKobo < m.costKobo), lowest: byMargin.slice(0, 5),
      averageMarginPct: avg(margins.map((m) => m.marginPct)), averageMarkupPct: avg(margins.filter((m) => Number.isFinite(m.markupPct)).map((m) => m.markupPct)) },
    calculationsByType: [...typeCount.entries()].map(([calculator_id, count]) => ({ calculator_id, count })).sort((a, b) => b.count - a.count || a.calculator_id.localeCompare(b.calculator_id)),
    months,
  };
}
