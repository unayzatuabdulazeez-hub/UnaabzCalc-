import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/app/notice";
import { PlanBanner } from "@/app/plan-banner";
import { Workbench } from "@/app/workbench";
import { businessContext, linkOptions, type SearchParams } from "@/lib/server/context";
import { getAdapter } from "@/lib/calc/adapters";
import { computeState } from "@/lib/calc/prepare";
import { buildExportModel, mailtoLink, shareText, whatsappLink } from "@/lib/export/model";
import { isUuid } from "@/lib/validation/common";
import { ENGINE_VERSION } from "@/vendor/engine-version";
import { calculate, deleteCalculation, duplicateCalculation, setCalculationArchived, updateCalculation } from "../actions";

export const dynamic = "force-dynamic";

export default async function OneCalculation({ params, searchParams }: { params: Promise<{ id: string; rid: string }>; searchParams: SearchParams }) {
  const { id, rid } = await params;
  if (!isUuid(rid)) notFound();
  const sp = await searchParams;
  const { supabase, plan } = await businessContext(id);
  const { data: row } = await supabase.from("saved_calculations")
    .select("id,calculator_id,title,inputs,engine_version,notes,customer_id,job_id,product_id,archived_at,created_at,updated_at")
    .eq("id", rid).eq("business_id", id).maybeSingle();
  if (!row) notFound();
  const adapter = getAdapter(row.calculator_id);
  const canWrite = plan.hasPremium;
  const initial = computeState(row.calculator_id, (row.inputs ?? {}) as Record<string, unknown>);
  const shareModel = adapter ? buildExportModel({ ...row, inputs: row.inputs }, "", {}) : null;
  const text = shareModel && !("error" in shareModel) ? shareText(shareModel) : null;
  const options = canWrite ? await linkOptions(supabase, id) : { customers: [], jobs: [], products: [] };
  const base = `/app/b/${id}/calculations/${rid}`;
  return (
    <>
      <p><Link href={`/app/b/${id}/calculations`}>Saved calculations</Link></p>
      <h1>{row.title}</h1>
      <Notice code={sp.m} />
      <PlanBanner hasPremium={canWrite} />
      <p className="muted">{adapter?.name ?? row.calculator_id}{row.archived_at ? " · archived" : ""}</p>
      {row.engine_version !== ENGINE_VERSION && <p className="card" role="note">The calculators were updated after you saved this. The result below uses the current version.</p>}
      {!adapter ? <p className="err">This kind of calculation can no longer be opened.</p> : (<>
        <Workbench
          fields={adapter.fields} initial={initial}
          calculate={calculate.bind(null, id, row.calculator_id)} calculateLabel="Recalculate"
          saveAction={updateCalculation.bind(null, id, rid)} saveLabel="Save changes" saveHeading="Save changes"
          meta={{ title: row.title, notes: row.notes ?? "", customer_id: row.customer_id ?? "", job_id: row.job_id ?? "", product_id: row.product_id ?? "" }}
          canSave={canWrite} {...options}
        />
        {text && (<>
          <h2>Export and share</h2>
          <p className="muted">Available on every plan. Customer details and notes are never included in the share text.</p>
          <p>
            <a className="btn" href={`${base}/export/xlsx`}>Download Excel</a>{" "}
            <a className="btn" href={`${base}/export/pdf`}>Download PDF</a>{" "}
            <Link className="btn" href={`${base}/print`}>Print view</Link>
          </p>
          <p>
            <a href={whatsappLink(text)} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>{" · "}
            <a href={mailtoLink(row.title, text)}>Share by email</a>
          </p>
          <details><summary>Copy as text</summary><textarea readOnly rows={8} defaultValue={text} /></details>
        </>)}
      </>)}
      <h2>Manage</h2>
      {canWrite && (<>
        <form action={duplicateCalculation.bind(null, id, rid)}><button type="submit">Duplicate</button></form>
        <form action={setCalculationArchived.bind(null, id, rid, !row.archived_at)}><button className="link" type="submit">{row.archived_at ? "Restore from archive" : "Archive"}</button></form>
      </>)}
      <details><summary>Delete permanently</summary>
        <p className="err">This cannot be undone.</p>
        <form action={deleteCalculation.bind(null, id, rid)}><button type="submit">Yes, delete this calculation</button></form>
      </details>
    </>
  );
}
