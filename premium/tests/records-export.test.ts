/** "Export my records" and "export the analysis" workbooks. Read back with a tiny ZIP reader; also opened in real software by scripts/verify_exports.py. */
import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { buildAnalysisWorkbook, buildRecordsWorkbook, type RecordsData } from "../src/lib/export/records";
import { analyse } from "../src/lib/analysis/business";
import { crc32 } from "../src/lib/export/zip";

function unzip(buf: Buffer): Map<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); assert.ok(eocd >= 0);
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const data = method === 8 ? inflateRawSync(buf.subarray(start, start + csize)) : buf.subarray(start, start + csize);
    assert.equal(data.length, usize); assert.equal(crc32(data), crc, name + " crc"); files.set(name, data); p += 46 + nlen + elen + clen;
  }
  return files;
}
const sheetNames = (f: Map<string, Buffer>) => [...f.get("xl/workbook.xml")!.toString().matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]!);
const sheetText = (f: Map<string, Buffer>, i: number) => f.get(`xl/worksheets/sheet${i}.xml`)!.toString();
const calcName = (id: string) => (id === "profit" ? "Profit Calculator" : id);

const NOW = new Date("2026-10-10T19:00:00Z");
const DATA: RecordsData = {
  customers: [{ id: "c1", name: "=HYPERLINK(\"http://evil.test\",\"x\")", phone: "08012345678", email: null, address: "5 <Main> & Sons St", notes: null, archived_at: null, created_at: "2026-09-01T10:00:00Z" }],
  products: [{ id: "p1", name: "Ankara", unit: "yard", cost_price: "1200.50", selling_price: 2000, notes: null, archived_at: "2026-10-01T00:00:00Z", created_at: "2026-09-02T10:00:00Z" }],
  jobs: [{ id: "j1", title: "Wedding", description: "Ọlá's order", status: "in_progress", due_date: "2026-10-20", agreed_amount: "150000.25", customer_id: "c1", archived_at: null, created_at: "2026-09-03T10:00:00Z" }],
  calculations: [{ id: "s1", calculator_id: "profit", title: "Margin check", customer_id: "c1", job_id: "j1", product_id: "p1", archived_at: null, created_at: "2026-10-01T10:00:00Z" }],
};

test("records workbook: a real ZIP with the five sheets, links resolved to names, nothing written as a formula", () => {
  const f = unzip(buildRecordsWorkbook(DATA, "Ola & Sons", calcName, NOW));
  assert.deepEqual(sheetNames(f), ["Read me", "Customers", "Products", "Jobs", "Saved calculations"]);
  assert.ok(!/<f>/.test([1, 2, 3, 4, 5].map((i) => sheetText(f, i)).join("")), "no formula cells");
  assert.ok(sheetText(f, 2).includes("=HYPERLINK(&quot;http://evil.test&quot;,&quot;x&quot;)"), "hostile name kept as escaped text");
  assert.ok(sheetText(f, 2).includes("5 &lt;Main&gt; &amp; Sons St"));
  const jobs = sheetText(f, 4); assert.ok(jobs.includes("In progress")); assert.ok(jobs.includes(">150000.25<")); assert.ok(jobs.includes("Ọlá&apos;s") || jobs.includes("Ọlá's"));
  const calcs = sheetText(f, 5); assert.ok(calcs.includes("Profit Calculator")); assert.ok(calcs.includes("Wedding")); assert.ok(calcs.includes("Ankara"));
  const prods = sheetText(f, 3); assert.ok(prods.includes(">1200.5<"), "string money becomes a real number"); assert.ok(prods.includes("2026-10-01"), "archived date kept");
});
test("records workbook: empty data still gives a valid file; truncation is stated", () => {
  const f = unzip(buildRecordsWorkbook({ customers: [], products: [], jobs: [], calculations: [] }, "Biz", calcName, NOW, ["jobs"]));
  assert.equal(sheetNames(f).length, 5); assert.ok(sheetText(f, 1).includes("newest 5,000 rows of jobs"));
});
test("analysis workbook: values are real numbers in naira (kobo / 100), percentages are fractions", () => {
  const a = analyse({ now: NOW, customers: [{ id: "c1", name: "Ade", archived_at: null }], products: [{ id: "p1", name: "Ankara", cost_price: 600, selling_price: 1000, archived_at: null }],
    jobs: [{ id: "j1", title: "W", status: "quote", due_date: "2026-10-09", agreed_amount: "100000.10", customer_id: "c1", created_at: "2026-10-02T09:00:00Z", archived_at: null }], calculations: [{ id: "x", calculator_id: "profit", title: "t", created_at: "2026-10-03T09:00:00Z", archived_at: null }] });
  const f = unzip(buildAnalysisWorkbook(a, "Biz", calcName, NOW));
  assert.deepEqual(sheetNames(f), ["Overview", "Jobs by status", "Overdue and due soon", "Top customers", "Product margins", "By month", "Calculations"]);
  assert.ok(sheetText(f, 1).includes(">100000.1<"), "quote value 100,000.10");
  assert.ok(sheetText(f, 5).includes(">0.4<"), "40% margin stored as 0.4 with a percent format");
  assert.ok(sheetText(f, 3).includes("W") && sheetText(f, 3).includes(">-1<"), "overdue job, -1 day");
  assert.ok(sheetText(f, 1).includes("not money received"), "the not-payments caveat is in the file");
  assert.ok(!/NaN|Infinity/.test([1, 2, 3, 4, 5, 6, 7].map((i) => sheetText(f, i)).join("")));
});
test("analysis workbook: a business with nothing in it is a valid file", () => {
  const f = unzip(buildAnalysisWorkbook(analyse({ now: NOW, jobs: [], customers: [], products: [], calculations: [] }), "Biz", calcName, NOW));
  assert.equal(sheetNames(f).length, 7);
});
