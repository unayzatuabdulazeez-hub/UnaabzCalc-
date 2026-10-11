import Link from "next/link";
import { Notice } from "@/app/notice";
import { PlanBanner } from "@/app/plan-banner";
import { businessContext, first, type SearchParams } from "@/lib/server/context";
import { likeEscape } from "@/lib/validation/common";
import { JOB_STATUSES } from "@/lib/validation/records";
import { addJob, editJob, setJobArchived } from "../actions";

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = { quote: "Quote", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const naira = (v: string | number | null) => (v === null ? "—" : "₦" + Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default async function Jobs({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, business, plan } = await businessContext(id);
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const status = first(sp.status);
  const showArchived = first(sp.archived) === "1";
  let query = supabase.from("jobs").select("id,title,description,status,due_date,agreed_amount,customer_id,archived_at").eq("business_id", id).order("created_at", { ascending: false }).limit(200);
  query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (status && (JOB_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (q) query = query.ilike("title", `%${likeEscape(q)}%`);
  const [{ data: rows }, { data: customers }] = await Promise.all([
    query,
    supabase.from("customers").select("id,name,archived_at").eq("business_id", id).order("name").limit(500),
  ]);
  const nameOf = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const choices = (customers ?? []).filter((c) => !c.archived_at);
  const canWrite = plan.hasPremium;
  const customerSelect = (selected: string | null) => (
    <select name="customer_id" defaultValue={selected ?? ""}><option value="">No customer</option>{choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
  );
  const statusSelect = (selected: string) => (
    <select name="status" defaultValue={selected}>{JOB_STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}</select>
  );
  return (
    <>
      <p><Link href={`/app/b/${id}`}>{business.name}</Link></p>
      <h1>Jobs</h1>
      <Notice code={sp.m} />
      <PlanBanner hasPremium={canWrite} />
      <form method="get"><label htmlFor="q">Search by title</label><input id="q" name="q" defaultValue={q} maxLength={100} />
        <label htmlFor="fs">Status</label><select id="fs" name="status" defaultValue={status ?? ""}><option value="">All</option>{JOB_STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}</select>
        {showArchived && <input type="hidden" name="archived" value="1" />}<button type="submit">Filter</button></form>
      <p><Link href={showArchived ? `/app/b/${id}/jobs` : `/app/b/${id}/jobs?archived=1`}>{showArchived ? "Show active jobs" : "Show archived jobs"}</Link></p>
      {rows?.length ? rows.map((j) => (
        <div className="card" key={j.id}>
          <strong>{j.title}</strong> <span className="muted">{LABEL[j.status]}{j.customer_id && nameOf.get(j.customer_id) ? ` · ${nameOf.get(j.customer_id)}` : ""}</span>
          <div className="muted">{naira(j.agreed_amount)}{j.due_date ? ` · due ${j.due_date}` : ""}</div>
          {canWrite && (<>
            <details><summary>Edit</summary>
              <form action={editJob.bind(null, id)}><input type="hidden" name="id" value={j.id} />
                <label>Title<input name="title" defaultValue={j.title} required maxLength={160} /></label>
                <label>Customer{customerSelect(j.customer_id)}</label>
                <label>Status{statusSelect(j.status)}</label>
                <label>Agreed amount (₦)<input name="agreed_amount" inputMode="decimal" defaultValue={j.agreed_amount ?? ""} /></label>
                <label>Due date<input name="due_date" type="date" defaultValue={j.due_date ?? ""} /></label>
                <label>Description<textarea name="description" defaultValue={j.description ?? ""} maxLength={2000} rows={3} /></label>
                <button type="submit">Save changes</button></form></details>
            <form action={setJobArchived.bind(null, id, !j.archived_at)}><input type="hidden" name="id" value={j.id} />
              <button className="link" type="submit">{j.archived_at ? "Restore" : "Archive"}</button></form>
          </>)}
        </div>
      )) : <p className="muted">{q || status ? "No jobs match that filter." : "No jobs yet."}</p>}
      {canWrite && (<>
        <h2>Add a job</h2>
        <form action={addJob.bind(null, id)}>
          <label htmlFor="title">Title</label><input id="title" name="title" required maxLength={160} />
          <label htmlFor="customer_id">Customer (optional)</label>{customerSelect(null)}
          <label htmlFor="status">Status</label>{statusSelect("quote")}
          <label htmlFor="agreed_amount">Agreed amount (₦, optional)</label><input id="agreed_amount" name="agreed_amount" inputMode="decimal" />
          <label htmlFor="due_date">Due date (optional)</label><input id="due_date" name="due_date" type="date" />
          <label htmlFor="description">Description (optional)</label><textarea id="description" name="description" maxLength={2000} rows={3} />
          <button type="submit">Save job</button>
        </form></>)}
    </>
  );
}
