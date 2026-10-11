/**
 * A real PDF (PDF 1.4) written without dependencies, using the built-in Helvetica fonts.
 * Limitation (documented): built-in fonts cannot show the naira sign or letters outside basic Latin, so "₦" is written as "NGN"
 * and accents are removed (Ọ becomes O). The browser's Print > Save as PDF keeps full Unicode.
 */
import type { ExportModel } from "./model";

// Helvetica advance widths (1/1000 em) for ASCII 32..126
const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

export function pdfSafe(s: string): string {
  return s.replace(/₦ ?/g, "NGN ").replace(/NGN\s+([)\],;:])/g, "NGN$1").replace(/²/g, "2").replace(/³/g, "3").replace(/×/g, "x").replace(/…/g, "...").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[\r\n\t]+/g, " ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
}
export function textWidth(s: string, size: number, bold = false): number {
  let w = 0; for (const ch of s) { const c = ch.charCodeAt(0); const base = c >= 32 && c <= 126 ? W[c - 32]! : 556; w += bold && !(c >= 48 && c <= 57) ? base * 1.07 : base; }
  return (w * size) / 1000;
}
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const num = (n: number) => (Math.round(n * 100) / 100).toString();

function wrap(text: string, maxW: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split(/\s{2,}|\n/)) {
    let line = "";
    for (const word of para.split(" ")) {
      let w = word;
      while (textWidth(w, size, bold) > maxW) { // very long word: hard-split
        let n = w.length; while (n > 1 && textWidth(w.slice(0, n), size, bold) > maxW) n--;
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, n)); w = w.slice(n);
      }
      const trial = line ? `${line} ${w}` : w;
      if (textWidth(trial, size, bold) <= maxW) line = trial; else { if (line) out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}
function fit(text: string, maxW: number, size: number, bold = false): string {
  const t = pdfSafe(text); if (textWidth(t, size, bold) <= maxW) return t;
  let n = t.length; while (n > 1 && textWidth(t.slice(0, n) + "...", size, bold) > maxW) n--;
  return t.slice(0, n) + "...";
}

const PAGE_W = 595.28, PAGE_H = 841.89, M = 50, BOTTOM = 62, CONTENT_W = PAGE_W - 2 * M;
type Rgb = [number, number, number];
const GREEN: Rgb = [0.04, 0.43, 0.31], RED: Rgb = [0.70, 0.15, 0.12], GREY: Rgb = [0.38, 0.4, 0.45], INK: Rgb = [0.09, 0.12, 0.16];

class Doc {
  pages: string[][] = [[]]; y = PAGE_H - M;
  private ops() { return this.pages[this.pages.length - 1]!; }
  newPage() { this.pages.push([]); this.y = PAGE_H - M; }
  ensure(h: number) { if (this.y - h < BOTTOM) this.newPage(); }
  text(s: string, x: number, size: number, o: { bold?: boolean; color?: Rgb; right?: boolean } = {}) {
    const t = pdfSafe(s); const xx = o.right ? x - textWidth(t, size, o.bold) : x; const c = o.color ?? INK;
    this.ops().push(`BT /${o.bold ? "F2" : "F1"} ${size} Tf ${num(c[0])} ${num(c[1])} ${num(c[2])} rg ${num(xx)} ${num(this.y)} Td (${esc(t)}) Tj ET`);
  }
  rule(color: Rgb = [0.82, 0.85, 0.88]) { this.ops().push(`${num(color[0])} ${num(color[1])} ${num(color[2])} RG 0.6 w ${M} ${num(this.y)} m ${num(PAGE_W - M)} ${num(this.y)} l S`); }
  shade(h: number) { this.ops().push(`0.91 0.95 0.93 rg ${M} ${num(this.y - 4)} ${num(CONTENT_W)} ${num(h)} re f`); }
  heading(s: string) { this.ensure(34); this.y -= 14; this.text(s, M, 12, { bold: true }); this.y -= 6; this.rule(); this.y -= 14; }
  paragraph(s: string, size = 10, color?: Rgb) { for (const l of wrap(s, CONTENT_W, size)) { this.ensure(size + 4); this.text(l, M, size, { color }); this.y -= size + 4; } }
}

export function exportPdf(m: ExportModel): Buffer {
  const d = new Doc();
  for (const l of wrap(m.title, CONTENT_W, 18, true)) { d.text(l, M, 18, { bold: true }); d.y -= 22; }
  const meta: string[] = [m.calculatorName, ...(m.businessName ? [m.businessName] : []), ...m.links.map((l) => `${l.label}: ${l.value}`), `Saved ${m.savedAt.slice(0, 10)}`];
  for (const line of meta) d.paragraph(line, 10, GREY);

  d.heading("Result");
  for (const [label, value, tone] of m.view.rows) {
    const lines = wrap(label, CONTENT_W * 0.62, 10);
    d.ensure(lines.length * 14);
    lines.forEach((l, i) => { d.text(l, M, 10); if (i === 0) d.text(value, PAGE_W - M, 10, { bold: true, right: true, color: tone === "good" ? GREEN : tone === "bad" ? RED : INK }); d.y -= 14; });
  }
  if (m.view.note) { d.y -= 2; d.paragraph(m.view.note, 9, GREY); }

  const table = (head0: string[], body0: string[][], numeric?: boolean[]) => {
    // A column that is all naira amounts says "(NGN)" once in its heading instead of repeating "NGN" in every cell (saves width).
    const isNgn = head0.map((_, i) => body0.length > 0 && body0.every((r) => /^-?NGN /.test(pdfSafe(r[i] ?? ""))));
    const head = head0.map((h, i) => (isNgn[i] ? `${pdfSafe(h)} (NGN)` : h));
    const body = body0.map((r) => r.map((c, i) => (isNgn[i] ? pdfSafe(c).replace(/^(-?)NGN /, "$1") : c)));
    const n = head.length; const H = head.map((h) => pdfSafe(h));
    // A column of figures (money, numbers, percentages, dashes) must never be cut short: size the columns to their content first.
    const isFig = (i: number) => (body.length > 0 && body.every((r) => /^(-?NGN|-?[\d(]|—|-$)/.test(pdfSafe(r[i] ?? "")) || (r[i] ?? "") === "")) || !!numeric?.[i];
    const fig = head.map((_, i) => isFig(i));
    const bodyNeed = (i: number, size: number) => Math.max(0, ...body.map((r) => textWidth(pdfSafe(r[i] ?? ""), size))) + 10;
    const wordNeed = (i: number, size: number) => Math.max(...H[i]!.split(" ").map((x) => textWidth(x, size, true))) + 10;
    const sumOf = (a: number[]) => a.reduce((x, y) => x + y, 0);
    let size = 9; let w: number[] | null = null;
    // 1) everything on one line, 2) long headings wrapped onto several lines, smaller type each time
    for (const sz of [9, 8, 7.5, 7, 6.5, 6]) { const full = head.map((_, i) => Math.max(bodyNeed(i, sz), textWidth(H[i]!, sz, true) + 10)); if (sumOf(full) <= CONTENT_W) { size = sz; w = full; break; } }
    if (!w) for (const sz of [9, 8, 7.5, 7, 6.5, 6]) {
      const compact = head.map((_, i) => Math.max(bodyNeed(i, sz), wordNeed(i, sz), 36));
      if (sumOf(compact) <= CONTENT_W) { size = sz; w = compact; break; }
    }
    if (!w) { // still too wide at the smallest size: only text columns give way (they get "..."), figure columns keep their full width
      size = 6; const figW = sumOf(head.map((_, i) => (fig[i] ? Math.max(bodyNeed(i, size), wordNeed(i, size), 36) : 0))); const txt = fig.filter((f) => !f).length || 1;
      w = head.map((_, i) => (fig[i] ? Math.max(bodyNeed(i, size), wordNeed(i, size), 36) : Math.max(40, (CONTENT_W - figW) / txt)));
    }
    const spare = Math.max(0, CONTENT_W - sumOf(w)) / n; const W2 = w.map((x) => x + spare);
    const colX = (i: number) => M + W2.slice(0, i).reduce((a, b) => a + b, 0);
    const drawCell = (c: string, i: number, bold: boolean) => {
      const t = fit(c, W2[i]! - 8, size, bold);
      if (fig[i] && i > 0) d.text(t, colX(i) + W2[i]! - 4, size, { bold, right: true }); else d.text(t, colX(i) + 2, size, { bold });
    };
    const header = () => {
      const lines = H.map((h, i) => wrap(h, W2[i]! - 8, size, true).slice(0, 6)); const rows = Math.max(...lines.map((l) => l.length)); const lh = size + 3;
      d.ensure(rows * lh + 16);
      const top = d.y; d.y = top - (rows - 1) * lh; d.shade((rows - 1) * lh + size + 4); d.y = top;
      for (let k = 0; k < rows; k++) { d.y = top - k * lh; lines.forEach((l, i) => { const t = l[k]; if (t === undefined) return; if (fig[i] && i > 0) d.text(t, colX(i) + W2[i]! - 4, size, { bold: true, right: true }); else d.text(t, colX(i) + 2, size, { bold: true }); }); }
      d.y = top - (rows - 1) * lh - 14;
    };
    header();
    for (const r of body) { if (d.y - 14 < BOTTOM) { d.newPage(); header(); } r.forEach((c, i) => drawCell(c, i, false)); d.y -= 13; }
    d.y -= 4;
  };
  if (m.view.table) { d.heading("Details"); table(m.view.table.head, m.view.table.body, m.view.table.head.map((h) => h === "#")); }

  d.heading("Inputs");
  for (const i of m.inputs) {
    const lines = wrap(i.label, CONTENT_W * 0.62, 10); d.ensure(lines.length * 14);
    lines.forEach((l, k) => { d.text(l, M, 10); if (k === 0) d.text(i.value, PAGE_W - M, 10, { right: true }); d.y -= 14; });
  }
  for (const t of m.inputTables) { d.ensure(40); d.y -= 6; d.text(t.title, M, 10, { bold: true }); d.y -= 14; table(t.head, t.body, t.numeric.map(() => false).map((_, k) => k === 0 ? false : t.numeric[k]!)); }
  if (m.notes) { d.heading("Notes"); d.paragraph(m.notes, 10); }

  // footers
  const total = d.pages.length;
  d.pages.forEach((ops, i) => {
    ops.push(`BT /F1 8 Tf 0.38 0.4 0.45 rg ${M} 36 Td (${esc(pdfSafe(`UnaabzCalc  -  Calculate Better. Sell Smarter.  -  calculator version ${m.engineVersion}  -  ${m.generatedAt.slice(0, 10)}`))}) Tj ET`);
    const pg = `Page ${i + 1} of ${total}`;
    ops.push(`BT /F1 8 Tf 0.38 0.4 0.45 rg ${num(PAGE_W - M - textWidth(pg, 8))} 36 Td (${pg}) Tj ET`);
  });

  // assemble objects: 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, then (page, content) pairs
  const objs: string[] = [];
  const pageIds = d.pages.map((_, i) => 6 + i * 2);
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${d.pages.length} >>`;
  objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objs[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  objs[5] = `<< /Title (${esc(pdfSafe(m.title).slice(0, 200))}) /Producer (UnaabzCalc) /Creator (UnaabzCalc) >>`;
  d.pages.forEach((ops, i) => {
    const content = ops.join("\n");
    objs[pageIds[i]!] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`;
    objs[pageIds[i]! + 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; const offsets: number[] = [];
  for (let id = 1; id < objs.length; id++) { offsets[id] = Buffer.byteLength(out, "latin1"); out += `${id} 0 obj\n${objs[id]}\nendobj\n`; }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
