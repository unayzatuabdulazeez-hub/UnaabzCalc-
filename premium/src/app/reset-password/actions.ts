"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validatePassword } from "@/lib/validation/auth";

export async function updatePassword(formData: FormData) {
  const p = validatePassword(formData.get("password"));
  if (!p.ok) redirect("/reset-password?m=password");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?m=link_invalid");
  const { error } = await supabase.auth.updateUser({ password: p.value });
  if (error) redirect("/reset-password?m=failed");
  redirect("/app?m=password_updated");
}
