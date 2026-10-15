import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { resolveEntitlement } from "../entitlements/resolve";
import { isUuid } from "../validation/common";

/**
 * Loads the signed-in user, one of THEIR businesses, and their plan. Everything runs as the user, so row-level security
 * applies: a business that belongs to someone else is indistinguishable from one that does not exist (404).
 */
export async function businessContext(businessId: string) {
  if (!isUuid(businessId)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: business }, { data: ent }] = await Promise.all([
    supabase.from("businesses").select("id,name,currency,archived_at").eq("id", businessId).maybeSingle(),
    supabase.from("entitlements").select("status,trial_start,trial_end,subscription_start,subscription_end,payment_status,cancellation_status").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!business) notFound();
  return { supabase, user, business, plan: resolveEntitlement(ent) };
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Active customers, jobs and products of one business, for the "link to" drop-downs (RLS-scoped to the signed-in owner). */
export async function linkOptions(supabase: Awaited<ReturnType<typeof businessContext>>["supabase"], businessId: string) {
  const [c, j, p] = await Promise.all([
    supabase.from("customers").select("id,name").eq("business_id", businessId).is("archived_at", null).order("name").limit(500),
    supabase.from("jobs").select("id,title").eq("business_id", businessId).is("archived_at", null).order("created_at", { ascending: false }).limit(500),
    supabase.from("products").select("id,name").eq("business_id", businessId).is("archived_at", null).order("name").limit(500),
  ]);
  return {
    customers: (c.data ?? []).map((r) => ({ id: r.id as string, name: r.name as string })),
    jobs: (j.data ?? []).map((r) => ({ id: r.id as string, name: r.title as string })),
    products: (p.data ?? []).map((r) => ({ id: r.id as string, name: r.name as string })),
  };
}
