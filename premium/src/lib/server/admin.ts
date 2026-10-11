import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../supabase/server";

/**
 * The gate for every admin page and action. Runs as the signed-in user: the database answers is_admin() from the admin_users table,
 * which no API user can write. Anyone else gets a plain 404 (the admin area does not announce that it exists).
 * Every admin database function re-checks this itself, so this is a second lock, not the only one.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("is_admin");
  if (error || data !== true) notFound();
  return { supabase, user };
}
/** For showing an "Admin" link only. Never a security decision. */
export async function isAdminUser(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data } = await supabase.rpc("is_admin");
  return data === true;
}
