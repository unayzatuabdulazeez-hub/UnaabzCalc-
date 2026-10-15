import Link from "next/link";
import { notFound } from "next/navigation";
import { businessContext } from "@/lib/server/context";
import { loadExportModel } from "@/lib/server/export-data";
import { PrintButton } from "@/app/print-button";

export const dynamic = "force-dynamic";

/** Print-friendly view. The browser's Print dialog can also save it as a PDF with full Unicode (₦ and accents). */
export default async function PrintView({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const ctx = await businessContext(id);
  const m = await loadExportModel(ctx, id, rid);
  if (!m) notFound();
  if ("error" in m) return <p role="alert" className="err">{m.error}</p>;
  const date = (s: string) => new Date(s).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" });
  return (
    <>
      <p className="noprint"><Link href={`/app/b/${id}/calculations/${rid}`}>Back</Link> <PrintButton /></p>
      <h1>{m.title}</h1>
      <p className="muted">{m.businessName} · {m.calculatorName} · Saved {date(m.savedAt)}</p>
      {m.links.length > 0 && <p>{m.links.map((l) => `${l.label}: ${l.value}`).join(" · ")}</p>}
      <h2>Result</h2>
      <div className="card">
        {m.view.rows.map(([label, value, tone], i) => (<div className="row" key={i}><span>{label}</span><b className={tone ?? ""}>{value}</b></div>))}
        {m.view.note ? <p className="hint">{m.view.note}</p> : null}
      </div>
      {m.view.table && (
        <table>
          <thead><tr>{m.view.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{m.view.table.body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      )}
      <h2>Inputs</h2>
      {m.inputs.map((l, i) => (<div className="row" key={i}><span>{l.label}</span><b>{l.value}</b></div>))}
      {m.inputTables.map((t) => (
        <div key={t.title}><h3>{t.title}</h3>
          <table><thead><tr>{t.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{t.body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
      ))}
      {m.notes && (<><h2>Notes</h2><p style={{ whiteSpace: "pre-wrap" }}>{m.notes}</p></>)}
      <p className="hint">Calculated with UnaabzCalc: Calculate Better. Sell Smarter.</p>
    </>
  );
}
