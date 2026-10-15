import { buildXlsx, type Cell, type Sheet } from "./xlsx";
import { parseDisplay, type ExportModel } from "./model";

const dt = (iso: string) => iso.slice(0, 10);
const cellOf = (s: string, parse = true): Cell => { if (!parse) return s; const p = parseDisplay(s); return p.fmt ? { v: p.v, fmt: p.fmt } : s; };

/** Builds the workbook for one saved calculation: Summary, Inputs and (when the calculator has one) Details. */
export function exportWorkbook(m: ExportModel): Buffer {
  const summary: Cell[][] = [
    [{ v: m.title, title: true }],
    ["Calculator", m.calculatorName],
    ...(m.businessName ? [["Business", m.businessName] as Cell[]] : []),
    ...m.links.map((l) => [l.label, l.value] as Cell[]),
    ["Saved", dt(m.savedAt)],
    [],
    [{ v: "Result", head: true }, { v: "", head: true }],
    ...m.view.rows.map(([label, value]) => [label, cellOf(value)] as Cell[]),
    ...(m.view.note ? [[], [m.view.note] as Cell[]] : []),
    ...(m.notes ? [[], [{ v: "Notes", bold: true }], [m.notes] as Cell[]] : []),
    [],
    [`Calculated with UnaabzCalc (calculator version ${m.engineVersion}) on ${dt(m.generatedAt)}.`],
  ];
  const inputs: Cell[][] = [[{ v: "Input", head: true }, { v: "Value", head: true }]];
  for (const i of m.inputs) inputs.push([i.label, i.kind === "num" ? cellOf(i.value) : i.value]);
  for (const t of m.inputTables) {
    inputs.push([], [{ v: t.title, bold: true }], t.head.map((h) => ({ v: h, head: true })));
    for (const r of t.body) inputs.push(r.map((v, i) => (t.numeric[i] && v !== "" && Number.isFinite(Number(v)) ? { v: Number(v), fmt: "num" as const } : v)));
  }
  const sheets: Sheet[] = [
    { name: "Summary", widths: [42, 22], rows: summary },
    { name: "Inputs", widths: [42, 22, 18, 18], rows: inputs },
  ];
  if (m.view.table) {
    const t = m.view.table;
    sheets.push({ name: "Details", widths: t.head.map((_, i) => (i === 0 ? 28 : 18)), rows: [t.head.map((h) => ({ v: h, head: true })), ...t.body.map((r) => r.map((c, i) => (i === 0 && t.head[0] !== "#" ? c : cellOf(c))))] });
  }
  return buildXlsx(sheets);
}
