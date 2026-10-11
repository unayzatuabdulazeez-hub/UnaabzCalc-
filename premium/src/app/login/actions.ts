"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateLogin } from "@/lib/validation/auth";

export async function signIn(formData: FormData) {
  const v = validateLogin({ email: formData.get("email"), password: formData.get("password") });
  if (!v.ok) redirect("/login?m=credentials"); // same message as a wrong password: no account enumeration
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(v.value);
  if (error) redirect("/login?m=credentials");
  redirect("/app");
}
