import Link from "next/link";
import { PlanBanner } from "@/app/plan-banner";
import { AdFor } from "@/app/ad-for";
import { businessContext, first, type SearchParams } from "@/lib/server/context";
import { likeEscape } from "@/lib/validation/common";
import { getAdapter } from "@/lib/calc/adapters";

export const dynamic = "force-dynamic";
const TYPES = [["all", "Everything"], ["customers", "Customers"], ["jobs", "Jobs"], ["products", "Products"], ["calculations", "Saved calculations"]] as const;
const PER = 20;

/** One search box across customers, jobs, products and saved calculations. Each table is searched on its own title column. */
export default async function Records({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, business, plan } = await businessContext(id);
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const t = TYPES.some(([k]) => k === first(sp.type)) ? (first(sp.type) as string) : "all";
  const showArchived = first(sp.archived) === "1";
  const like = q ? `%${likeEscape(q)}%` : null;
  const want = (k: string) => t === "all" || t === k;
  const scope = <T extends { is: (c: string, v: null) => T; not: (c: string, o: string, v: null) => T }>(x: T) => (showArchived ? x.not("archived_at", "is", null) : x.is("archived_at", null));
  const run = async <R,>(k: string, make: () => PromiseLike<{ data: R[] | null }>) => (want(k) ? (await make()).data ?? [] : []);
  const [customers, jobs, products, calcs] = await Promise.all([
    run("customers", () => { let s = scope(supabase.from("customers").select("id,name,phone,email").eq("business_id", id)).order("name").limit(PER); if (like) s = s.ilike("name", like); return s; }),
    run("jobs", () => { let s = scope(supabase.from("jobs").select("id,title,status,due_date,agreed_amount").eq("business_id", id)).order("created_at", { ascending: false }).limit(PER); if (like) s = s.ilike("title", like); return s; }),
    run("products", () => { let s = scope(supabase.from("products").select("id,name,unit,selling_price").eq("business_id", id)).order("name").limit(PER); if (like) s = s.ilike("name", like); return s; }),
    run("calculations", () => { let s = scope(supabase.from("saved_calculations").select("id,title,calculator_id,created_at").eq("business_id", id)).order("created_at", { ascending: false }).limit(PER); if (like) s = s.ilike("title", like); return s; }),
  ]);
  const none = !customers.length && !jobs.length && !products.length && !calcs.length;
  return (
    <>
      <p><Link href={`/app/b/${id}`}>{business.name}</Link></p>
      <h1>Records</h1>
      <PlanBanner hasPremium={plan.hasPremium} />
      <AdFor hasPremium={plan.hasPremium} />
      <form method="get">
        <label htmlFor="q">Search by name or title</label><input id="q" name="q" defaultValue={q} maxLength={100} />
        <label htmlFor="type">Look in</label>
        <select id="type" name="type" defaultValue={t}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label><input type="checkbox" name="archived" value="1" defaultChecked={showArchived} style={{ width: "auto" }} /> Archived records only</label>
        <button type="submit">Search</button>
      </form>
      <p><a className="btn" href={`/app/b/${id}/records/export/xlsx`}>Download all my records (Excel)</a></p>
      <p className="hint">The Excel file has every customer, product, job and saved calculation, including archived ones. It works on every plan.</p>
      {none && <p className="muted">{q ? "Nothing matched your search." : showArchived ? "No archived records." : "No records yet."}</p>}
      {customers.length > 0 && <><h2>Customers</h2>{customers.map((c) => <div className="card" key={c.id}><Link href={`/app/b/${id}/customers?q=${encodeURIComponent(c.name)}${showArchived ? "&archived=1" : ""}`}>{c.name}</Link> <span className="muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</span></div>)}</>}
      {jobs.length > 0 && <><h2>Jobs</h2>{jobs.map((j) => <div className="card" key={j.id}><Link href={`/app/b/${id}/jobs`}>{j.title}</Link> <span className="muted">{String(j.status).replace("_", " ")}{j.due_date ? ` · due ${j.due_date}` : ""}</span></div>)}</>}
      {products.length > 0 && <><h2>Products</h2>{products.map((p) => <div className="card" key={p.id}><Link href={`/app/b/${id}/products?q=${encodeURIComponent(p.name)}${showArchived ? "&archived=1" : ""}`}>{p.name}</Link> <span className="muted">{p.unit ?? ""}</span></div>)}</>}
      {calcs.length > 0 && <><h2>Saved calculations</h2>{calcs.map((c) => <div className="card" key={c.id}><Link href={`/app/b/${id}/calculations/${c.id}`}>{c.title}</Link> <span className="muted">{getAdapter(c.calculator_id)?.name ?? c.calculator_id} · {String(c.created_at).slice(0, 10)}</span></div>)}</>}
      <p className="hint">Showing up to {PER} of each kind. Narrow the search to see others.</p>
    </>
  );
}
