/** Excel workbooks for "export my data" and for the business analysis. Pure functions; text is never written as a formula. */
import { buildXlsx, type Cell, type Sheet } from "./xlsx";
import { naira, type Analysis } from "../analysis/business";

export interface RCustomer { id: string; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null; archived_at: string | null; created_at: string }
export interface RProduct { id: string; name: string; unit: string | null; cost_price: number | string | null; selling_price: number | string | null; notes: string | null; archived_at: string | null; created_at: string }
export interface RJob { id: string; title: string; description: string | null; status: string; due_date: string | null; agreed_amount: number | string | null; customer_id: string | null; archived_at: string | null; created_at: string }
export interface RCalc { id: string; calculator_id: string; title: string; customer_id: string | null; job_id: string | null; product_id: string | null; archived_at: string | null; created_at: string }
export interface RecordsData { customers: RCustomer[]; products: RProduct[]; jobs: RJob[]; calculations: RCalc[] }

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const money = (v: number | string | null): Cell => { if (v === null || v === "") return ""; const n = Number(v); return Number.isFinite(n) ? { v: n, fmt: "money" } : ""; };
const head = (...h: string[]): Cell[] => h.map((v) => ({ v, head: true }));
export const STATUS_LABEL: Record<string, string> = { quote: "Quote", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };

export function buildRecordsWorkbook(d: RecordsData, businessName: string, calcName: (id: string) => string, now: Date = new Date(), truncated: string[] = []): Buffer {
  const cust = new Map(d.customers.map((c) => [c.id, c.name])), prod = new Map(d.products.map((p) => [p.id, p.name]));
  const job = new Map(d.jobs.map((j) => [j.id, j.title]));
  const readme: Cell[][] = [
    [{ v: `${businessName}: your records`, title: true }],
    ["Exported", now.toISOString().slice(0, 10)],
    ["Customers", d.customers.length], ["Products", d.products.length], ["Jobs", d.jobs.length], ["Saved calculations", d.calculations.length],
    [], ["Rows with a date in the Archived column are archived (hidden in the app, kept here)."],
    ["Money amounts are the amounts you typed in. Saved calculations list only their title and links; open them in the app to export the full calculation."],
    ...(truncated.length ? [[], [{ v: `Only the newest 5,000 rows of ${truncated.join(", ")} are included.`, bold: true }] as Cell[]] : []),
  ];
  const sheets: Sheet[] = [
    { name: "Read me", widths: [60, 16], rows: readme },
    { name: "Customers", widths: [28, 18, 28, 32, 32, 12, 12], rows: [head("Name", "Phone", "Email", "Address", "Notes", "Added", "Archived"), ...d.customers.map((c): Cell[] => [c.name, c.phone ?? "", c.email ?? "", c.address ?? "", c.notes ?? "", day(c.created_at), day(c.archived_at)])] },
    { name: "Products", widths: [28, 12, 16, 16, 32, 12, 12], rows: [head("Product", "Unit", "Cost price", "Selling price", "Notes", "Added", "Archived"), ...d.products.map((p): Cell[] => [p.name, p.unit ?? "", money(p.cost_price), money(p.selling_price), p.notes ?? "", day(p.created_at), day(p.archived_at)])] },
    { name: "Jobs", widths: [30, 14, 18, 14, 16, 40, 12, 12], rows: [head("Job", "Status", "Customer", "Due date", "Agreed amount", "Description", "Added", "Archived"), ...d.jobs.map((j): Cell[] => [j.title, STATUS_LABEL[j.status] ?? j.status, j.customer_id ? cust.get(j.customer_id) ?? "" : "", day(j.due_date), money(j.agreed_amount), j.description ?? "", day(j.created_at), day(j.archived_at)])] },
    { name: "Saved calculations", widths: [34, 34, 22, 26, 22, 12, 12], rows: [head("Title", "Calculator", "Customer", "Job", "Product", "Saved", "Archived"), ...d.calculations.map((c): Cell[] => [c.title, calcName(c.calculator_id), c.customer_id ? cust.get(c.customer_id) ?? "" : "", c.job_id ? job.get(c.job_id) ?? "" : "", c.product_id ? prod.get(c.product_id) ?? "" : "", day(c.created_at), day(c.archived_at)])] },
  ];
  return buildXlsx(sheets, now);
}

export function buildAnalysisWorkbook(a: Analysis, businessName: string, calcName: (id: string) => string, now: Date = new Date(), truncated: string[] = []): Buffer {
  const m = (k: number): Cell => ({ v: naira(k), fmt: "money" });
  const overview: Cell[][] = [
    [{ v: `${businessName}: business analysis`, title: true }], ["As at (Lagos date)", a.today], [],
    [{ v: "Your records", head: true }, { v: "Active", head: true }, { v: "Archived", head: true }],
    ["Customers", a.counts.customers, a.counts.archivedCustomers], ["Products", a.counts.products, a.counts.archivedProducts], ["Jobs", a.counts.jobs, a.counts.archivedJobs], ["Saved calculations", a.counts.calculations, a.counts.archivedCalculations], [],
    [{ v: "Job values (agreed amounts you entered)", head: true }, { v: "", head: true }],
    ["Quotes", m(a.quoteValueKobo)], ["In progress", m(a.inProgressValueKobo)], ["Open (quotes + in progress)", m(a.openValueKobo)], ["Completed", m(a.completedValueKobo)],
    ["Jobs (not cancelled) without an amount", a.jobsWithoutAmount], ["Jobs without a customer", a.jobsWithoutCustomer], ["Open jobs past their due date", a.overdue.length], ["Open jobs due in the next 7 days", a.dueSoon.length], [],
    ["These are agreed amounts, not money received: the app does not record payments yet."],
    ...(truncated.length ? [[{ v: `Only the newest 5,000 rows of ${truncated.join(", ")} were analysed.`, bold: true }] as Cell[]] : []),
  ];
  const sheets: Sheet[] = [
    { name: "Overview", widths: [46, 18, 12], rows: overview },
    { name: "Jobs by status", widths: [18, 10, 18, 20], rows: [head("Status", "Jobs", "With an amount", "Total agreed amount"), ...a.byStatus.map((s): Cell[] => [STATUS_LABEL[s.status] ?? s.status, s.count, s.withAmount, m(s.valueKobo)])] },
    { name: "Overdue and due soon", widths: [34, 14, 14, 10, 18], rows: [head("Job", "Status", "Due date", "Days", "Agreed amount"), ...[...a.overdue, ...a.dueSoon].map((d): Cell[] => [d.title, STATUS_LABEL[d.status] ?? d.status, d.due, d.days, d.valueKobo === null ? "" : m(d.valueKobo)])] },
    { name: "Top customers", widths: [30, 10, 20], rows: [head("Customer", "Jobs", "Agreed amount"), ...a.topCustomers.map((c): Cell[] => [c.name, c.jobs, m(c.valueKobo)])] },
    { name: "Product margins", widths: [30, 16, 16, 14, 14], rows: [head("Product (lowest margin first)", "Cost price", "Selling price", "Margin", "Markup"), ...a.products.lowest.map((p): Cell[] => [p.name, m(p.costKobo), m(p.sellKobo), { v: p.marginPct / 100, fmt: "pct" }, Number.isFinite(p.markupPct) ? { v: p.markupPct / 100, fmt: "pct" } : ""])] },
    { name: "By month", widths: [12, 10, 20, 16], rows: [head("Month", "Jobs added", "Agreed amount", "Calculations saved"), ...a.months.map((x): Cell[] => [x.month, x.jobs, m(x.valueKobo), x.calculations])] },
    { name: "Calculations", widths: [40, 10], rows: [head("Calculator", "Saved"), ...a.calculationsByType.map((c): Cell[] => [calcName(c.calculator_id), c.count])] },
  ];
  return buildXlsx(sheets, now);
}
