"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin";
import { isUuid } from "@/lib/validation/common";
import { validateAdminAction } from "@/lib/admin/params";

/** The three things an admin can change. Each one re-checks admin rights here AND in the database function, needs a written reason, and is audit-logged by the database. */
async function act(kind: "grant" | "revoke" | "end", id: string, form: FormData) {
  if (!isUuid(id)) redirect("/app/admin/users");
  const { supabase } = await requireAdmin();
  const v = validateAdminAction(kind, Object.fromEntries(form));
  if (!v.ok) redirect(`/app/admin/users/${id}?m=${v.code}`);
  const call = kind === "grant"
    ? supabase.rpc("admin_grant_complimentary", { target: id, ends_at: new Date(Date.now() + (v.days ?? 1) * 86_400_000).toISOString(), reason: v.reason })
    : kind === "revoke"
      ? supabase.rpc("admin_revoke_complimentary", { target: id, reason: v.reason })
      : supabase.rpc("admin_end_paid_access", { target: id, reason: v.reason });
  const { error } = await call;
  redirect(`/app/admin/users/${id}?m=${error ? "admin_refused" : kind === "grant" ? "admin_granted" : kind === "revoke" ? "admin_revoked" : "admin_ended"}`);
}
export async function grantComplimentary(id: string, form: FormData) { return act("grant", id, form); }
export async function revokeComplimentary(id: string, form: FormData) { return act("revoke", id, form); }
export async function endPaidAccess(id: string, form: FormData) { return act("end", id, form); }
