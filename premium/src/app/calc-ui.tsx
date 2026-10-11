import type { Described, Field } from "@/lib/calc/adapters";

type Values = Record<string, string>;

/** Server-rendered calculator inputs. No client JavaScript: fields that only apply to one option say so in a hint. */
export function CalcFields({ fields, values }: { fields: Field[]; values: Values }) {
  const hintFor = (f: { showIf?: { key: string; value: string } }) => {
    if (!f.showIf) return null;
    const ctl = fields.find((x) => x.key === f.showIf!.key);
    const opt = ctl && ctl.kind === "select" ? ctl.options.find(([v]) => v === f.showIf!.value)?.[1] : undefined;
    return <span className="hint"> (only if “{ctl?.label}” is “{opt}”)</span>;
  };
  return (
    <>
      {fields.map((f) => {
        if (f.kind === "select") return (
          <div key={f.key}><label htmlFor={f.key}>{f.label}{hintFor(f)}</label>
            <select id={f.key} name={f.key} defaultValue={values[f.key] ?? f.options[0]![0]}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>);
        if (f.kind === "num") return (
          <div key={f.key}><label htmlFor={f.key}>{f.label}{f.optional ? <span className="hint"> (optional)</span> : null}{hintFor(f)}</label>
            <input id={f.key} name={f.key} inputMode="decimal" autoComplete="off" defaultValue={values[f.key] ?? ""} maxLength={30} /></div>);
        if (f.kind === "text") return (
          <div key={f.key}><label htmlFor={f.key}>{f.label}</label>
            <input id={f.key} name={f.key} defaultValue={values[f.key] ?? ""} maxLength={f.maxLen} /></div>);
        // rows: show the filled rows plus two spare ones (press Calculate again to get more)
        let filled = 0;
        while (filled < f.maxRows && f.cols.some((c) => values[`${f.key}.${filled}.${c.key}`] !== undefined)) filled++;
        const shown = Math.min(f.maxRows, Math.max(f.blankRows, filled + 2));
        return (
          <fieldset key={f.key} className="card"><legend>{f.label}</legend>
            {Array.from({ length: shown }, (_, i) => (
              <div className="grid2" key={i}>
                {f.cols.map((c) => (
                  <div key={c.key}><label htmlFor={`${f.key}.${i}.${c.key}`}>{c.label} {i + 1}</label>
                    <input id={`${f.key}.${i}.${c.key}`} name={`${f.key}.${i}.${c.key}`} inputMode={c.kind === "num" ? "decimal" : undefined}
                      defaultValue={values[`${f.key}.${i}.${c.key}`] ?? ""} maxLength={c.kind === "text" ? c.maxLen : 30} /></div>
                ))}
              </div>
            ))}
            <p className="hint">Need more rows? Press Calculate and two more appear.</p>
          </fieldset>);
      })}
    </>
  );
}

export function ResultView({ view }: { view: Described }) {
  return (
    <div className="card" role="region" aria-label="Result">
      {view.rows.map(([label, value, tone], i) => (<div className="row" key={i}><span>{label}</span><b className={tone ?? ""}>{value}</b></div>))}
      {view.note ? <p className="hint">{view.note}</p> : null}
      {view.table ? (
        <div className="tablewrap"><table>
          <thead><tr>{view.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{view.table.body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table></div>
      ) : null}
    </div>
  );
}

export interface Option { id: string; name: string }
export function MetaFields({ defaults, customers, jobs, products }: {
  defaults: { title: string; notes: string; customer_id: string; job_id: string; product_id: string };
  customers: Option[]; jobs: Option[]; products: Option[];
}) {
  const pick = (name: string, label: string, options: Option[], value: string) => (
    <div><label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={value}><option value="">None</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>);
  return (
    <>
      <label htmlFor="title">Title</label><input id="title" name="title" defaultValue={defaults.title} maxLength={160} />
      {pick("customer_id", "Customer (optional)", customers, defaults.customer_id)}
      {pick("job_id", "Job (optional)", jobs, defaults.job_id)}
      {pick("product_id", "Product (optional)", products, defaults.product_id)}
      <label htmlFor="notes">Notes (optional)</label><textarea id="notes" name="notes" defaultValue={defaults.notes} maxLength={2000} rows={3} />
    </>
  );
}
