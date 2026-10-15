import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { SAMPLES } from "./samples";
import { SAVEABLE_IDS, getAdapter, money, pct, int, plain, runCalculation, normalizeInputs, type Inputs } from "../src/lib/calc/adapters";
import { buildExportModel, fileBase, mailtoLink, parseDisplay, shareText, whatsappLink, type ExportModel } from "../src/lib/export/model";
import { exportWorkbook } from "../src/lib/export/workbook";
import { buildXlsx, safeSheetName } from "../src/lib/export/xlsx";
import { crc32 } from "../src/lib/export/zip";
import { exportPdf, pdfSafe, textWidth } from "../src/lib/export/pdf";

const REC = (id: string, inputs: unknown, extra: Record<string, unknown> = {}) => ({ title: "T", calculator_id: id, inputs, notes: null, created_at: "2026-10-10T08:00:00Z", updated_at: "2026-10-10T08:00:00Z", engine_version: "v1", ...extra });
const model = (id: string, inputs: unknown = SAMPLES[id], extra: Record<string, unknown> = {}, links = {}): ExportModel => {
  const m = buildExportModel(REC(id, inputs, extra), "Biz", links); assert.ok(!("error" in m), id + ": " + JSON.stringify(m)); return m as ExportModel;
};

// ---- a tiny ZIP reader so tests can open the .xlsx we wrote ----
function unzip(buf: Buffer): Map<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); assert.ok(eocd >= 0, "no end-of-central-directory");
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    assert.equal(buf.readUInt32LE(lho), 0x04034b50);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const data = method === 8 ? inflateRawSync(buf.subarray(start, start + csize)) : buf.subarray(start, start + csize);
    assert.equal(data.length, usize, name + " size"); assert.equal(crc32(data), crc, name + " crc");
    files.set(name, data); p += 46 + nlen + elen + clen;
  }
  return files;
}
// minimal well-formedness check (balanced tags) for the XML we generate
function wellFormed(xml: string) {
  const stack: string[] = [];
  for (const m of xml.replace(/<\?[^>]*\?>/g, "").matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
    if (m[4]) continue; if (m[1]) assert.equal(stack.pop(), m[2], "mismatched </" + m[2] + ">"); else stack.push(m[2]!);
  }
  assert.equal(stack.length, 0, "unclosed tags: " + stack.join(","));
}
const sheetCells = (xml: string) => [...xml.matchAll(/<c r="([A-Z]+\d+)" s="(\d+)"(?: t="inlineStr")?>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)<\/c>/g)].map((m) => ({ ref: m[1]!, style: Number(m[2]), num: m[3], text: m[4] }));

// ---------- model ----------
test("every saveable calculator produces an export model", () => { for (const id of SAVEABLE_IDS) model(id); });
test("a model is built by re-running the engine, not from a stored result (stored extras are ignored)", () => {
  const m = model("profit", { cost: "800", sell: "1000", result: "999999", profit: 1 });
  assert.equal(m.view.rows[0]![1], "₦200.00");
});
test("unknown calculator and bad inputs return an error, never a file", () => {
  assert.ok("error" in (buildExportModel(REC("nope", {}), "B", {}) as object));
  assert.ok("error" in (buildExportModel(REC("profit", { cost: "abc", sell: "1" }), "B", {}) as object));
});
test("display strings parse back to the exact numbers shown (round trip through the formatters)", () => {
  const fmt = { money, pct: (n: number) => pct(n * 100), int, num: plain } as const;
  for (const id of SAVEABLE_IDS) for (const [, value] of model(id).view.rows) {
    const p = parseDisplay(value);
    if (p.fmt) assert.equal(fmt[p.fmt](p.v as number), value, `${id}: ${value}`);
    else assert.equal(typeof p.v, "string");
  }
});
test("exported totals equal the engine's numbers (profit calculator)", () => {
  const norm = normalizeInputs("profit", SAMPLES.profit!) as unknown as { inputs: Inputs };
  const raw = runCalculation("profit", norm.inputs) as unknown as { ok: true; result: { profit: number } };
  const cells = sheetCells(unzip(exportWorkbook(model("profit"))).get("xl/worksheets/sheet1.xml")!.toString());
  const profit = cells.find((c) => c.text === "Profit"); assert.ok(profit);
  const value = cells.find((c) => c.ref === profit!.ref.replace("A", "B"))!;
  assert.equal(Number(value.num), raw.result.profit);
});

// ---------- xlsx ----------
test("xlsx: valid ZIP, correct CRCs, required parts, well-formed XML, for every calculator", () => {
  for (const id of SAVEABLE_IDS) {
    const files = unzip(exportWorkbook(model(id)));
    for (const part of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) assert.ok(files.has(part), `${id}: ${part}`);
    for (const [name, data] of files) if (/\.(xml|rels)$/.test(name)) wellFormed(data.toString("utf8"));
  }
});
test("xlsx: numbers are real numbers with money / percent formats (not text)", () => {
  const cells = sheetCells(unzip(exportWorkbook(model("profit"))).get("xl/worksheets/sheet1.xml")!.toString());
  const nums = cells.filter((c) => c.num !== undefined);
  assert.ok(nums.some((c) => c.style === 2 && Number(c.num) === 200), "money cell 200");
  assert.ok(nums.some((c) => c.style === 3 && Math.abs(Number(c.num) - 0.2) < 1e-12), "percent cell 0.2");
});
test("xlsx: loan schedule goes to a Details sheet", () => {
  const files = unzip(exportWorkbook(model("loan")));
  assert.ok(files.has("xl/worksheets/sheet3.xml")); assert.match(files.get("xl/workbook.xml")!.toString(), /name="Details"/);
  assert.ok(!unzip(exportWorkbook(model("profit"))).has("xl/worksheets/sheet3.xml"));
});
test("xlsx: text that looks like a formula stays text; control characters and XML special characters are safe", () => {
  const files = unzip(exportWorkbook(model("business-expenses")));
  const all = [...files.values()].map((b) => b.toString("utf8")).join("\n");
  assert.ok(!/<f>/.test(all), "no formula elements");
  assert.match(all, /=HYPERLINK\(&quot;http:\/\/evil\.test&quot;,&quot;x&quot;\)/);
  const x = unzip(buildXlsx([{ name: "S", rows: [["a\u0001b\u0000c", "<&>\"'", "x".repeat(40000), "\uD800lone"]] }])).get("xl/worksheets/sheet1.xml")!.toString();
  wellFormed(x); assert.ok(!/[\u0000-\u0008]/.test(x)); assert.ok(!/x{32001}/.test(x)); assert.match(x, /&lt;&amp;&gt;&quot;'/);
});
test("xlsx: sheet names are sanitised and unique", () => {
  const used = new Set<string>();
  assert.equal(safeSheetName("Bad:/Name[1]", used), "Bad  Name 1");
  assert.equal(safeSheetName("x".repeat(50), used).length, 31);
  assert.notEqual(safeSheetName("Summary", used), safeSheetName("summary", used));
  assert.equal(safeSheetName("", used), "Sheet");
});
test("xlsx: non-finite numbers are never written", () => {
  const x = unzip(buildXlsx([{ name: "S", rows: [[NaN, Infinity, 5]] }])).get("xl/worksheets/sheet1.xml")!.toString();
  assert.ok(!/NaN|Infinity/.test(x)); assert.match(x, /<v>5<\/v>/);
});
test("xlsx: empty and large inputs work (100 expense rows)", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ name: `Item ${i}`, amount: String(i * 10 + 1) }));
  const m = model("business-expenses", { items: rows });
  const files = unzip(exportWorkbook(m)); assert.ok(files.get("xl/worksheets/sheet3.xml")!.length > 1000);
});

// ---------- pdf ----------
function pdfInfo(buf: Buffer) {
  const s = buf.toString("latin1");
  assert.ok(s.startsWith("%PDF-1.4")); assert.ok(s.trimEnd().endsWith("%%EOF"));
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(s)![1]);
  assert.equal(s.slice(startxref, startxref + 4), "xref");
  const size = Number(/xref\n0 (\d+)\n/.exec(s.slice(startxref))![1]);
  const entries = [...s.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  assert.equal(entries.length, size - 1);
  entries.forEach((off, i) => assert.ok(s.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
  for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) assert.equal(Buffer.byteLength(m[2]!, "latin1"), Number(m[1]), "stream length");
  const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(s)![1]);
  const text = [...s.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1]!.replace(/\\([()\\])/g, "$1")).join("\n");
  return { s, pages, text };
}
test("pdf: valid structure and the visible text contains the result, for every calculator", () => {
  for (const id of SAVEABLE_IDS) {
    const m = model(id); const { pages, text } = pdfInfo(exportPdf(m));
    assert.ok(pages >= 1);
    for (const [label, value] of m.view.rows) { assert.ok(text.includes(pdfSafe(label).slice(0, 20)), `${id}: label ${label}`); assert.ok(text.includes(pdfSafe(value)), `${id}: value ${value}`); }
  }
});
test("pdf: totals shown equal the model's totals; naira is written as NGN", () => {
  const { text } = pdfInfo(exportPdf(model("profit")));
  assert.ok(text.includes("NGN 200.00")); assert.ok(!text.includes("₦"));
});
test("pdf: special characters are escaped or replaced safely; the file never contains a raw non-Latin byte", () => {
  const m = model("profit", SAMPLES.profit, { title: "Ọlá (Sons) \\ back <b> 日本", notes: "line one\nline (two) \\" });
  const { s, text } = pdfInfo(exportPdf(m));
  assert.ok(text.includes("Ola (Sons) \\ back <b> ??")); assert.ok(!/[^\x00-\xff]/.test(s));
});
test("pdf: long text wraps and long tables paginate with a repeating header and footers", () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ name: `Expense number ${i} ` + "x".repeat(60), amount: String(i + 1) }));
  const { pages, text } = pdfInfo(exportPdf(model("business-expenses", { items: rows }, { title: "Long ".repeat(60), notes: "word ".repeat(600) })));
  assert.ok(pages >= 3); assert.ok(text.includes(`Page 1 of ${pages}`)); assert.ok(text.includes(`Page ${pages} of ${pages}`));
  assert.ok((text.match(/Monthly amount/g) ?? []).length >= 2, "table header repeated");
});
test("pdf: no figure in any table is ever cut short, for every calculator, even with very large numbers", () => {
  const check = (id: string, raw: Inputs) => {
    const m = model(id, raw); const { text } = pdfInfo(exportPdf(m)); const t = m.view.table; if (!t) return;
    for (const r of t.body) for (const c of r) if (/^(-?₦|-?\d)/.test(c)) assert.ok(text.includes(pdfSafe(c).replace(/^(-?)NGN /, "$1")), `${id}: "${c}" is missing or truncated`); // table columns of naira say (NGN) in the heading
    for (const h of t.head) for (const word of pdfSafe(h).split(" ")) assert.ok(text.includes(word), `${id}: header word "${word}" of "${h}" is missing (headings may wrap but never lose words)`);
  };
  for (const id of SAVEABLE_IDS) check(id, SAMPLES[id]!);
  check("building-estimator", { ...SAMPLES["building-estimator"], walls: [{ item: "Blocks with a fairly long description of the item", unit: "pcs", qty: "1234567", rate: "98765432.10" }] });
  check("advanced-import", { ...SAMPLES["advanced-import"], rate: "1500", rows: [{ name: "A product name that is quite long indeed", qty: "123456", cost: "98765.4", weight: "", cbm: "", duty: "10", price: "999999" }] });
});
test("pdf: nothing runs past the page margins, for every calculator (including wide input tables)", () => {
  const big = { ...SAMPLES["advanced-import"], rows: [{ name: "A product name that is quite long indeed", qty: "123456", cost: "98765.4", weight: "12.5", cbm: "0.25", duty: "10", price: "999999" }] };
  const cases: [string, Inputs][] = [...SAVEABLE_IDS.map((id): [string, Inputs] => [id, SAMPLES[id]!]), ["advanced-import", big]];
  for (const [id, raw] of cases) {
    const { s } = pdfInfo(exportPdf(model(id, raw)));
    for (const m of s.matchAll(/BT \/(F1|F2) ([\d.]+) Tf [\d. ]+ rg ([\d.-]+) ([\d.-]+) Td \(((?:\\.|[^\\)])*)\) Tj ET/g)) {
      const t = m[5]!.replace(/\\([()\\])/g, "$1"); const right = Number(m[3]) + textWidth(t, Number(m[2]), m[1] === "F2");
      assert.ok(Number(m[3]) >= 49 && right <= 595.28 - 50 + 3, `${id}: "${t}" spans ${m[3]}..${Math.round(right)}`);
    }
  }
});
test("pdf: long column headings wrap and never lose a word (unique tokens, 8 columns)", () => {
  const base = model("profit");
  const head = Array.from({ length: 8 }, (_, i) => `Heading${i}a word${i}b another${i}c and${i}d more${i}e text${i}f`);
  const m = { ...base, inputTables: [{ title: "Wide", head, body: [head.map((_, i) => String(i * 1111))], numeric: head.map(() => true) }] };
  const { text } = pdfInfo(exportPdf(m));
  for (const h of head) for (const word of h.split(" ")) assert.ok(text.includes(word), `heading word ${word} lost`);
});
test("pdf: superscripts and the naira sign in labels print cleanly", () => {
  assert.equal(pdfSafe("Floor area in m² (₦)"), "Floor area in m2 (NGN)");
  const { text } = pdfInfo(exportPdf(model("electrical-estimator")));
  assert.ok(text.includes("m2") && !text.includes("m?"), "no question marks from m²");
});
test("pdf: text width helper is sane", () => { assert.ok(textWidth("Hello", 10) > 20 && textWidth("Hello", 10) < 40); assert.ok(textWidth("Hello", 10, true) > textWidth("Hello", 10)); });

// ---------- share, file names ----------
test("share text has the title and result but no customer or notes; links are encoded and capped", () => {
  const m = model("profit", SAMPLES.profit, { notes: "private note" }, { customer: "Mrs Ade" });
  const t = shareText(m);
  assert.ok(t.includes("₦200.00")); assert.ok(!t.includes("Mrs Ade")); assert.ok(!t.includes("private note"));
  assert.ok(whatsappLink(t).startsWith("https://wa.me/?text=") && whatsappLink(t).includes("%")); assert.ok(whatsappLink("x".repeat(5000)).length < 1600);
  assert.ok(mailtoLink("a&b", "line\nbreak").includes("subject=a%26b"));
});
test("download file names are safe", () => {
  assert.equal(fileBase("Ọlá & Sons / ../../etc/passwd"), "UnaabzCalc-Ola-Sons-etc-passwd");
  assert.equal(fileBase("日本語"), "UnaabzCalc-calculation");
  assert.ok(fileBase("x".repeat(500)).length <= 80);
  for (const bad of ['a"b', "a\r\nb", "a/b", "..", "a b"]) assert.match(fileBase(bad), /^[A-Za-z0-9_-]+$/);
});
test("every saveable calculator has an adapter name used in exports", () => { for (const id of SAVEABLE_IDS) assert.ok(getAdapter(id)!.name.length > 0); });
