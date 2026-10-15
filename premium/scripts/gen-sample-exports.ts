// Writes sample .xlsx and .pdf files for every saveable calculator so they can be opened in real software:
//   npx tsx scripts/gen-sample-exports.ts <output-folder>      then:  python3 scripts/verify_exports.py <output-folder>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLES } from "../tests/samples";
import { getAdapter } from "../src/lib/calc/adapters";
import { buildExportModel, fileBase } from "../src/lib/export/model";
import { exportWorkbook } from "../src/lib/export/workbook";
import { exportPdf } from "../src/lib/export/pdf";

const out = process.argv[2] ?? "export-samples";
mkdirSync(out, { recursive: true });
for (const [id, inputs] of Object.entries(SAMPLES)) {
  const m = buildExportModel({ title: `Sample: ${getAdapter(id)!.name} (Ọlá & Sons)`, calculator_id: id, inputs, notes: "Sample note with (brackets), \\ backslash and 'quotes'.", created_at: "2026-10-10T08:00:00Z", updated_at: "2026-10-10T08:00:00Z", engine_version: "sample" }, "Ọlá Fabrics & Sons", { customer: "Mrs Ade", job: "Wedding", product: "Ankara" });
  if ("error" in m) throw new Error(`${id}: ${m.error}`);
  writeFileSync(join(out, `${id}.xlsx`), exportWorkbook(m));
  writeFileSync(join(out, `${id}.pdf`), exportPdf(m));
}
// Phase 6: the records export and the analysis export, with awkward data (formula-looking names, accents, archived rows)
import { buildAnalysisWorkbook, buildRecordsWorkbook, type RecordsData } from "../src/lib/export/records";
import { analyse, type JobRow } from "../src/lib/analysis/business";
const now = new Date("2026-10-10T19:00:00Z");
const rec: RecordsData = {
  customers: [{ id: "c1", name: "=HYPERLINK(\"http://evil.test\",\"x\")", phone: "08012345678", email: "a@b.ng", address: "5 <Main> & Sons St", notes: null, archived_at: null, created_at: "2026-09-01T10:00:00Z" }, { id: "c2", name: "Ọlá Bakare", phone: null, email: null, address: null, notes: "VIP", archived_at: "2026-10-01T00:00:00Z", created_at: "2026-09-02T10:00:00Z" }],
  products: [{ id: "p1", name: "Ankara (6 yards)", unit: "piece", cost_price: "12000.50", selling_price: 20000, notes: null, archived_at: null, created_at: "2026-09-02T10:00:00Z" }, { id: "p2", name: "Loss leader", unit: null, cost_price: 900, selling_price: 700, notes: null, archived_at: null, created_at: "2026-09-02T10:00:00Z" }],
  jobs: [{ id: "j1", title: "Wedding", description: "Ọlá's order", status: "in_progress", due_date: "2026-10-09", agreed_amount: "150000.25", customer_id: "c1", archived_at: null, created_at: "2026-09-03T10:00:00Z" }, { id: "j2", title: "Quote only", description: null, status: "quote", due_date: null, agreed_amount: null, customer_id: null, archived_at: null, created_at: "2026-10-03T10:00:00Z" }],
  calculations: [{ id: "s1", calculator_id: "profit", title: "Margin check", customer_id: "c1", job_id: "j1", product_id: "p1", archived_at: null, created_at: "2026-10-01T10:00:00Z" }],
};
const nameOf = (id: string) => getAdapter(id)?.name ?? id;
writeFileSync(join(out, "records-sample.xlsx"), buildRecordsWorkbook(rec, "Ọlá Fabrics & Sons", nameOf, now));
writeFileSync(join(out, "analysis-sample.xlsx"), buildAnalysisWorkbook(analyse({ ...rec, jobs: rec.jobs as unknown as JobRow[], now }), "Ọlá Fabrics & Sons", nameOf, now));
writeFileSync(join(out, "records-empty.xlsx"), buildRecordsWorkbook({ customers: [], products: [], jobs: [], calculations: [] }, "Empty Biz", nameOf, now));
console.log(`wrote ${Object.keys(SAMPLES).length * 2} files to ${out}`);
