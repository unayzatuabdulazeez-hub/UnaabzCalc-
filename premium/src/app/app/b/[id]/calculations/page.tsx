import Link from "next/link";
import { Notice } from "@/app/notice";
import { PlanBanner } from "@/app/plan-banner";
import { businessContext, first, type SearchParams } from "@/lib/server/context";
import { getAdapter, listAdapters } from "@/lib/calc/adapters";
import { likeEscape } from "@/lib/validation/common";

export const dynamic = "force-dynamic";
const when = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });

export default async function Calculations({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, business, plan } = await businessContext(id);
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const calc = first(sp.calc);
  const showArchived = first(sp.archived) === "1";
  let query = supabase.from("saved_calculations").select("id,title,calculator_id,created_at,updated_at").eq("business_id", id).order("updated_at", { ascending: false }).limit(200);
  query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (calc && getAdapter(calc)) query = query.eq("calculator_id", calc);
  if (q) query = query.ilike("title", `%${likeEscape(q)}%`);
  const { data: rows } = await query;
  return (
    <>
      <p><Link href={`/app/b/${id}`}>{business.name}</Link></p>
      <h1>Saved calculations</h1>
      <Notice code={sp.m} />
      <PlanBanner hasPremium={plan.hasPremium} />
      {plan.hasPremium && <p><Link className="btn" href={`/app/b/${id}/calculations/new`}>New calculation</Link></p>}
      <form method="get"><label htmlFor="q">Search by title</label><input id="q" name="q" defaultValue={q} maxLength={100} />
        <label htmlFor="calc">Calculator</label>
        <select id="calc" name="calc" defaultValue={calc ?? ""}><option value="">All</option>{listAdapters().map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        {showArchived && <input type="hidden" name="archived" value="1" />}<button type="submit">Search</button></form>
      <p><Link href={showArchived ? `/app/b/${id}/calculations` : `/app/b/${id}/calculations?archived=1`}>{showArchived ? "Show active calculations" : "Show archived calculations"}</Link></p>
      {rows?.length ? rows.map((r) => (
        <div className="card" key={r.id}>
          <Link href={`/app/b/${id}/calculations/${r.id}`}><strong>{r.title}</strong></Link>
          <div className="muted">{getAdapter(r.calculator_id)?.name ?? r.calculator_id} · saved {when(r.created_at)}</div>
        </div>
      )) : <p className="muted">{q || calc ? "No calculations match that search." : showArchived ? "Nothing archived." : "No saved calculations yet."}</p>}
    </>
  );
}
