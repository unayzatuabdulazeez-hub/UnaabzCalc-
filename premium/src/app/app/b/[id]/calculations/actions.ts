"use server";
import { notFound, redirect } from "next/navigation";
import { businessContext } from "@/lib/server/context";
import { getAdapter } from "@/lib/calc/adapters";
import { computeFromForm, prepareCalculation, type CalcState } from "@/lib/calc/prepare";
import { copyTitle } from "@/lib/validation/calc-meta";
import { isUuid } from "@/lib/validation/common";
import { ENGINE_VERSION } from "@/vendor/engine-version";

const list = (id: string) => `/app/b/${id}/calculations`;
const getter = (fd: FormData) => (n: string) => { const v = fd.get(n); return typeof v === "string" ? v : undefined; };

/** Preview only: nothing is stored. Needs a signed-in owner of the business; the numbers arrive in the POST body, not the address. */
export async function calculate(businessId: string, calcId: string, _prev: CalcState, fd: FormData): Promise<CalcState> {
  const c = await businessContext(businessId);
  const a = getAdapter(calcId);
  // Advanced calculators and estimators are Premium: the preview is gated here too, not only the save.
  if (a?.premium && !c.plan.hasPremium) return { status: "error", flat: {}, error: "This calculator is part of Premium. Upgrade to use it." };
  return computeFromForm(calcId, getter(fd));
}

/** Save: re-run the shared engine on the server, store only the cleaned INPUTS. Premium is also enforced by the database. */
export async function saveCalculation(businessId: string, calcId: string, fd: FormData) {
  if (!getAdapter(calcId)) notFound();
  const c = await businessContext(businessId);
  const back = `${list(businessId)}/new/${calcId}`;
  if (!c.plan.hasPremium) redirect(`${back}?m=premium_required`);
  const p = prepareCalculation(calcId, getter(fd));
  if (!p.ok) redirect(`${back}?m=${p.code}`);
  const { data, error } = await c.supabase.from("saved_calculations").insert({
    business_id: businessId, user_id: c.user.id, calculator_id: p.calculatorId, title: p.meta.title, inputs: p.inputs,
    engine_version: ENGINE_VERSION, notes: p.meta.notes, customer_id: p.meta.customer_id, job_id: p.meta.job_id, product_id: p.meta.product_id,
  }).select("id").single();
  redirect(error || !data ? `${back}?m=failed` : `${list(businessId)}/${data.id}?m=saved`);
}

/** Edit: same checks as save. The calculator type of a record never changes (duplicate instead). */
export async function updateCalculation(businessId: string, recordId: string, fd: FormData) {
  if (!isUuid(recordId)) notFound();
  const c = await businessContext(businessId);
  const back = `${list(businessId)}/${recordId}`;
  if (!c.plan.hasPremium) redirect(`${back}?m=premium_required`);
  const { data: row } = await c.supabase.from("saved_calculations").select("calculator_id").eq("id", recordId).eq("business_id", businessId).maybeSingle();
  if (!row) notFound();
  const p = prepareCalculation(row.calculator_id, getter(fd));
  if (!p.ok) redirect(`${back}?m=${p.code}`);
  const { data, error } = await c.supabase.from("saved_calculations").update({
    title: p.meta.title, inputs: p.inputs, engine_version: ENGINE_VERSION, notes: p.meta.notes,
    customer_id: p.meta.customer_id, job_id: p.meta.job_id, product_id: p.meta.product_id,
  }).eq("id", recordId).eq("business_id", businessId).select("id");
  redirect(`${back}?m=${error || !data?.length ? "failed" : "saved"}`);
}

export async function duplicateCalculation(businessId: string, recordId: string) {
  if (!isUuid(recordId)) notFound();
  const c = await businessContext(businessId);
  const back = `${list(businessId)}/${recordId}`;
  if (!c.plan.hasPremium) redirect(`${back}?m=premium_required`);
  const { data: row } = await c.supabase.from("saved_calculations")
    .select("calculator_id,title,inputs,notes,customer_id,job_id,product_id").eq("id", recordId).eq("business_id", businessId).maybeSingle();
  if (!row) notFound();
  const { data, error } = await c.supabase.from("saved_calculations").insert({
    business_id: businessId, user_id: c.user.id, calculator_id: row.calculator_id, title: copyTitle(row.title), inputs: row.inputs,
    engine_version: ENGINE_VERSION, notes: row.notes, customer_id: row.customer_id, job_id: row.job_id, product_id: row.product_id,
  }).select("id").single();
  redirect(error || !data ? `${back}?m=failed` : `${list(businessId)}/${data.id}?m=duplicated`);
}

export async function setCalculationArchived(businessId: string, recordId: string, archive: boolean) {
  if (!isUuid(recordId)) notFound();
  const c = await businessContext(businessId);
  const back = `${list(businessId)}/${recordId}`;
  if (!c.plan.hasPremium) redirect(`${back}?m=premium_required`);
  const { data, error } = await c.supabase.from("saved_calculations").update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", recordId).eq("business_id", businessId).select("id");
  redirect(error || !data?.length ? `${back}?m=failed` : `${list(businessId)}?m=${archive ? "archived" : "restored"}`);
}

/** Deleting your own data is never paywalled: the database allows it even when the plan has lapsed. */
export async function deleteCalculation(businessId: string, recordId: string) {
  if (!isUuid(recordId)) notFound();
  const c = await businessContext(businessId);
  const { data, error } = await c.supabase.from("saved_calculations").delete().eq("id", recordId).eq("business_id", businessId).select("id");
  redirect(error || !data?.length ? `${list(businessId)}/${recordId}?m=failed` : `${list(businessId)}?m=deleted`);
}
