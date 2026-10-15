import Link from "next/link";
import { Notice } from "@/app/notice";
import { PlanBanner } from "@/app/plan-banner";
import { businessContext, first, type SearchParams } from "@/lib/server/context";
import { likeEscape } from "@/lib/validation/common";
import { addProduct, editProduct, setProductArchived } from "../actions";

export const dynamic = "force-dynamic";
const naira = (v: string | number | null) => (v === null ? "—" : "₦" + Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default async function Products({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, business, plan } = await businessContext(id);
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const showArchived = first(sp.archived) === "1";
  let query = supabase.from("products").select("id,name,unit,cost_price,selling_price,notes,archived_at").eq("business_id", id).order("name").limit(200);
  query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q) query = query.ilike("name", `%${likeEscape(q)}%`);
  const { data: rows } = await query;
  const canWrite = plan.hasPremium;
  return (
    <>
      <p><Link href={`/app/b/${id}`}>{business.name}</Link></p>
      <h1>Products</h1>
      <Notice code={sp.m} />
      <PlanBanner hasPremium={canWrite} />
      <form method="get"><label htmlFor="q">Search by name</label><input id="q" name="q" defaultValue={q} maxLength={100} />
        {showArchived && <input type="hidden" name="archived" value="1" />}<button type="submit">Search</button></form>
      <p><Link href={showArchived ? `/app/b/${id}/products` : `/app/b/${id}/products?archived=1`}>{showArchived ? "Show active products" : "Show archived products"}</Link></p>
      {rows?.length ? rows.map((p) => (
        <div className="card" key={p.id}>
          <strong>{p.name}</strong> <span className="muted">{p.unit ?? ""}</span>
          <div className="muted">Cost {naira(p.cost_price)} · Selling {naira(p.selling_price)}</div>
          {canWrite && (<>
            <details><summary>Edit</summary>
              <form action={editProduct.bind(null, id)}><input type="hidden" name="id" value={p.id} />
                <label>Name<input name="name" defaultValue={p.name} required maxLength={120} /></label>
                <label>Unit<input name="unit" defaultValue={p.unit ?? ""} maxLength={30} /></label>
                <label>Cost price (₦)<input name="cost_price" inputMode="decimal" defaultValue={p.cost_price ?? ""} /></label>
                <label>Selling price (₦)<input name="selling_price" inputMode="decimal" defaultValue={p.selling_price ?? ""} /></label>
                <label>Notes<textarea name="notes" defaultValue={p.notes ?? ""} maxLength={1000} rows={3} /></label>
                <button type="submit">Save changes</button></form></details>
            <form action={setProductArchived.bind(null, id, !p.archived_at)}><input type="hidden" name="id" value={p.id} />
              <button className="link" type="submit">{p.archived_at ? "Restore" : "Archive"}</button></form>
          </>)}
        </div>
      )) : <p className="muted">{q ? "No products match that search." : "No products yet."}</p>}
      {canWrite && (<>
        <h2>Add a product</h2>
        <form action={addProduct.bind(null, id)}>
          <label htmlFor="name">Name</label><input id="name" name="name" required maxLength={120} />
          <label htmlFor="unit">Unit (optional, e.g. piece, bag)</label><input id="unit" name="unit" maxLength={30} />
          <label htmlFor="cost_price">Cost price (₦, optional)</label><input id="cost_price" name="cost_price" inputMode="decimal" />
          <label htmlFor="selling_price">Selling price (₦, optional)</label><input id="selling_price" name="selling_price" inputMode="decimal" />
          <label htmlFor="notes">Notes (optional)</label><textarea id="notes" name="notes" maxLength={1000} rows={3} />
          <button type="submit">Save product</button>
        </form></>)}
    </>
  );
}
