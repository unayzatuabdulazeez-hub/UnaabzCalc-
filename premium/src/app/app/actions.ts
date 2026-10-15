"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateBusiness } from "@/lib/validation/business";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createBusiness(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const v = validateBusiness(Object.fromEntries(formData));
  if (!v.ok) redirect(`/app?m=${Object.keys(v.errors)[0] ?? "failed"}`);
  // owner_id always comes from the verified session, never from the form. RLS enforces it again in the database.
  const { error } = await supabase.from("businesses").insert({ owner_id: user.id, ...v.value });
  if (error) redirect("/app?m=failed");
  redirect("/app?m=business_created");
}
