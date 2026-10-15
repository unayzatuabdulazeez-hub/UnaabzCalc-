"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateEmail } from "@/lib/validation/auth";
import { publicEnv } from "@/lib/config/env";

export async function requestReset(formData: FormData) {
  const e = validateEmail(formData.get("email"));
  if (!e.ok) redirect("/forgot-password?m=email");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(e.value, { redirectTo: `${publicEnv().appUrl}/auth/confirm?next=/reset-password` });
  redirect("/forgot-password?m=reset_sent"); // same answer whether or not the account exists
}
