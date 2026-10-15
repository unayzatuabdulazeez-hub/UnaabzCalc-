import Link from "next/link";
import { Notice } from "@/app/notice";
import { PlanBanner } from "@/app/plan-banner";
import { businessContext, first, type SearchParams } from "@/lib/server/context";
import { likeEscape } from "@/lib/validation/common";
import { addCustomer, editCustomer, setCustomerArchived } from "../actions";

export const dynamic = "force-dynamic";

export default async function Customers({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, business, plan } = await businessContext(id);
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const showArchived = first(sp.archived) === "1";
  let query = supabase.from("customers").select("id,name,phone,email,address,notes,archived_at").eq("business_id", id).order("name").limit(200);
  query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q) query = query.ilike("name", `%${likeEscape(q)}%`);
  const { data: rows } = await query;
  const canWrite = plan.hasPremium;
  return (
    <>
      <p><Link href={`/app/b/${id}`}>{business.name}</Link></p>
      <h1>Customers</h1>
      <Notice code={sp.m} />
      <PlanBanner hasPremium={canWrite} />
      <form method="get"><label htmlFor="q">Search by name</label><input id="q" name="q" defaultValue={q} maxLength={100} />
        {showArchived && <input type="hidden" name="archived" value="1" />}<button type="submit">Search</button></form>
      <p><Link href={showArchived ? `/app/b/${id}/customers` : `/app/b/${id}/customers?archived=1`}>{showArchived ? "Show active customers" : "Show archived customers"}</Link></p>
      {rows?.length ? rows.map((c) => (
        <div className="card" key={c.id}>
          <strong>{c.name}</strong> <span className="muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
          {canWrite && (<>
            <details><summary>Edit</summary>
              <form action={editCustomer.bind(null, id)}><input type="hidden" name="id" value={c.id} />
                <label>Name<input name="name" defaultValue={c.name} required maxLength={120} /></label>
                <label>Phone<input name="phone" defaultValue={c.phone ?? ""} maxLength={30} /></label>
                <label>Email<input name="email" type="email" defaultValue={c.email ?? ""} maxLength={254} /></label>
                <label>Address<input name="address" defaultValue={c.address ?? ""} maxLength={300} /></label>
                <label>Notes<textarea name="notes" defaultValue={c.notes ?? ""} maxLength={1000} rows={3} /></label>
                <button type="submit">Save changes</button></form></details>
            <form action={setCustomerArchived.bind(null, id, !c.archived_at)}><input type="hidden" name="id" value={c.id} />
              <button className="link" type="submit">{c.archived_at ? "Restore" : "Archive"}</button></form>
          </>)}
        </div>
      )) : <p className="muted">{q ? "No customers match that search." : "No customers yet."}</p>}
      {canWrite && (<>
        <h2>Add a customer</h2>
        <form action={addCustomer.bind(null, id)}>
          <label htmlFor="name">Name</label><input id="name" name="name" required maxLength={120} />
          <label htmlFor="phone">Phone (optional)</label><input id="phone" name="phone" type="tel" maxLength={30} />
          <label htmlFor="email">Email (optional)</label><input id="email" name="email" type="email" maxLength={254} />
          <label htmlFor="address">Address (optional)</label><input id="address" name="address" maxLength={300} />
          <label htmlFor="notes">Notes (optional)</label><textarea id="notes" name="notes" maxLength={1000} rows={3} />
          <button type="submit">Save customer</button>
        </form></>)}
    </>
  );
}
