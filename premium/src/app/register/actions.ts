"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateRegister } from "@/lib/validation/auth";
import { publicEnv } from "@/lib/config/env";

export async function signUp(formData: FormData) {
  const v = validateRegister({ email: formData.get("email"), password: formData.get("password"), fullName: formData.get("fullName") });
  if (!v.ok) redirect(`/register?m=${Object.keys(v.errors)[0] ?? "failed"}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: v.value.email,
    password: v.value.password,
    options: { data: v.value.fullName ? { full_name: v.value.fullName } : {}, emailRedirectTo: `${publicEnv().appUrl}/auth/confirm?next=/app` },
  });
  if (error) redirect("/register?m=failed");
  // Identical response whether or not the email already exists.
  redirect("/login?m=check_email");
}
