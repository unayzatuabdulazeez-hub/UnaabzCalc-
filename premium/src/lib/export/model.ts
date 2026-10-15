/**
 * ONE export model drives Excel, PDF, print and share, so a total can never differ between them or from the screen.
 * It is built from the saved INPUTS by re-running the shared engine (never from a stored result).
 */
import { getAdapter, normalizeInputs, runCalculation, type Described, type Field, type Inputs } from "../calc/adapters";

export interface ExportRecord { title: string; calculator_id: string; inputs: unknown; notes: string | null; created_at: string; updated_at: string; engine_version: string }
export interface ExportLinks { customer?: string | null; job?: string | null; product?: string | null }
export interface InputLine { label: string; value: string; kind: "num" | "text" | "select" }
export interface InputTable { title: string; head: string[]; body: string[][]; numeric: boolean[] }
export interface ExportModel {
  title: string; calculatorName: string; businessName: string; links: { label: string; value: string }[];
  savedAt: string; updatedAt: string; generatedAt: string; engineVersion: string;
  inputs: InputLine[]; inputTables: InputTable[]; view: Described; notes: string | null;
}

const S = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const visible = (f: Field, inputs: Inputs) => { const c = "showIf" in f ? f.showIf : undefined; return !c || inputs[c.key] === c.value; };

export function buildExportModel(record: ExportRecord, businessName: string, links: ExportLinks, now: Date = new Date()): ExportModel | { error: string } {
  const adapter = getAdapter(record.calculator_id);
  if (!adapter) return { error: "This kind of calculation can no longer be exported." };
  const norm = normalizeInputs(record.calculator_id, (record.inputs ?? {}) as Inputs);
  if (!norm.ok) return { error: norm.error };
  const run = runCalculation(record.calculator_id, norm.inputs);
  if (!run.ok) return { error: run.error };
  const inputs: InputLine[] = []; const inputTables: InputTable[] = [];
  for (const f of adapter.fields as Field[]) {
    if (f.kind === "rows") {
      const rows = (norm.inputs[f.key] as Record<string, string>[]) ?? [];
      if (rows.length) inputTables.push({ title: f.label, head: f.cols.map((c) => c.label), body: rows.map((r) => f.cols.map((c) => S(r[c.key]))), numeric: f.cols.map((c) => c.kind === "num") });
    } else if (visible(f, norm.inputs)) {
      const raw = S(norm.inputs[f.key]);
      if (f.kind === "select") inputs.push({ label: f.label, value: f.options.find(([v]) => v === raw)?.[1] ?? raw, kind: "select" });
      else if (raw !== "") inputs.push({ label: f.label, value: raw, kind: f.kind });
    }
  }
  const linkLines = ([["Customer", links.customer], ["Job", links.job], ["Product", links.product]] as const).filter(([, v]) => !!v).map(([label, v]) => ({ label, value: v as string }));
  return {
    title: record.title, calculatorName: adapter.name, businessName, links: linkLines, savedAt: record.created_at, updatedAt: record.updated_at,
    generatedAt: now.toISOString(), engineVersion: record.engine_version, inputs, inputTables, view: run.view, notes: record.notes,
  };
}

// ---- display strings back to real numbers (the formatters in adapters.ts use a fixed locale, so this is exact) ----
export type Parsed = { v: string | number; fmt?: "money" | "pct" | "num" | "int" };
export function parseDisplay(s: string): Parsed {
  let m = /^(-?)₦([\d,]+\.\d{2})$/.exec(s); if (m) return { v: Number((m[1] ?? "") + m[2]!.replace(/,/g, "")), fmt: "money" };
  m = /^(-?)([\d,]+\.\d{2})%$/.exec(s); if (m) return { v: Number((m[1] ?? "") + m[2]!.replace(/,/g, "")) / 100, fmt: "pct" };
  m = /^(-?)(\d{1,3}(?:,\d{3})+|\d+)$/.exec(s); if (m) return { v: Number((m[1] ?? "") + m[2]!.replace(/,/g, "")), fmt: "int" };
  m = /^(-?)(\d{1,3}(?:,\d{3})*\.\d+|\d+\.\d+)$/.exec(s); if (m) return { v: Number((m[1] ?? "") + m[2]!.replace(/,/g, "")), fmt: "num" };
  return { v: s };
}

/** Plain-text summary for sharing. Contains the title and result only: no customer, notes or other private details. */
export function shareText(m: ExportModel): string {
  const lines = [`${m.title} (${m.calculatorName})`, ...(m.businessName ? [m.businessName] : []), ""];
  for (const [label, value] of m.view.rows) lines.push(`${label}: ${value}`);
  lines.push("", "Calculated with UnaabzCalc: Calculate Better. Sell Smarter.");
  return lines.join("\n");
}
export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text.slice(0, 1500))}`;
export const mailtoLink = (subject: string, text: string) => `mailto:?subject=${encodeURIComponent(subject.slice(0, 200))}&body=${encodeURIComponent(text.slice(0, 1500))}`;

/** A safe download file name: letters, digits, dash and underscore only. */
export function fileBase(title: string): string {
  const base = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `UnaabzCalc-${base || "calculation"}`;
}
