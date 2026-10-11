"use server";
import { redirect } from "next/navigation";
import { businessContext } from "@/lib/server/context";
import { validateCustomer, validateJob, validateProduct } from "@/lib/validation/records";
import { isUuid } from "@/lib/validation/common";

type Table = "customers" | "products" | "jobs";
const base = (id: string, t: Table) => `/app/b/${id}/${t}`;

/** Premium is checked here for a friendly message; the database enforces it again (has_premium() in the RLS policies). */
async function writable(businessId: string, t: Table) {
  const c = await businessContext(businessId);
  if (!c.plan.hasPremium) redirect(`${base(businessId, t)}?m=premium_required`);
  return c;
}
const fail = (url: string, errors: Record<string, string>): never => redirect(`${url}?m=${Object.keys(errors)[0] ?? "failed"}`);
const rowId = (v: FormDataEntryValue | null) => (isUuid(v) ? v : null);

async function insert(businessId: string, t: Table, values: Record<string, unknown>) {
  const { supabase, user } = await writable(businessId, t);
  const { error } = await supabase.from(t).insert({ business_id: businessId, user_id: user.id, ...values });
  redirect(`${base(businessId, t)}?m=${error ? "failed" : "saved"}`);
}
async function update(businessId: string, t: Table, id: string | null, values: Record<string, unknown>, ok = "saved") {
  const { supabase } = await writable(businessId, t);
  if (!id) redirect(`${base(businessId, t)}?m=failed`);
  const { data, error } = await supabase.from(t).update(values).eq("id", id).eq("business_id", businessId).select("id");
  redirect(`${base(businessId, t)}?m=${error || !data?.length ? "failed" : ok}`);
}

export async function addCustomer(businessId: string, fd: FormData) {
  const v = validateCustomer(Object.fromEntries(fd)); if (!v.ok) fail(base(businessId, "customers"), v.errors);
  await insert(businessId, "customers", (v as { value: object }).value);
}
export async function editCustomer(businessId: string, fd: FormData) {
  const v = validateCustomer(Object.fromEntries(fd)); if (!v.ok) fail(base(businessId, "customers"), v.errors);
  await update(businessId, "customers", rowId(fd.get("id")), (v as { value: object }).value);
}
export async function setCustomerArchived(businessId: string, archive: boolean, fd: FormData) {
  await update(businessId, "customers", rowId(fd.get("id")), { archived_at: archive ? new Date().toISOString() : null }, archive ? "archived" : "restored");
}

export async function addProduct(businessId: string, fd: FormData) {
  const v = validateProduct(Object.fromEntries(fd)); if (!v.ok) fail(base(businessId, "products"), v.errors);
  await insert(businessId, "products", (v as { value: object }).value);
}
export async function editProduct(businessId: string, fd: FormData) {
  const v = validateProduct(Object.fromEntries(fd)); if (!v.ok) fail(base(businessId, "products"), v.errors);
  await update(businessId, "products", rowId(fd.get("id")), (v as { value: object }).value);
}
export async function setProductArchived(businessId: string, archive: boolean, fd: FormData) {
  await update(businessId, "products", rowId(fd.get("id")), { archived_at: archive ? new Date().toISOString() : null }, archive ? "archived" : "restored");
}

export async function addJob(businessId: string, fd: FormData) {
  const v = validateJob(Object.fromEntries(fd)); if (!v.ok) fail(base(businessId, "jobs"), v.errors);
  await insert(businessId, "jobs", (v as { value: object }).value);
}
export async function editJob(businessId: string, fd: FormData) {
  const v = validateJob(Object.fromEntries(fd)); if (!v.ok) fail(base(businessId, "jobs"), v.errors);
  await update(businessId, "jobs", rowId(fd.get("id")), (v as { value: object }).value);
}
export async function setJobArchived(businessId: string, archive: boolean, fd: FormData) {
  await update(businessId, "jobs", rowId(fd.get("id")), { archived_at: archive ? new Date().toISOString() : null }, archive ? "archived" : "restored");
}
