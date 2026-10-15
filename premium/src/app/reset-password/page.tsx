import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "../notice";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "./actions";

export default async function Reset({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?m=link_invalid");
  return (
    <>
      <h1>Choose a new password</h1>
      <Notice code={sp.m} />
      <form action={updatePassword}>
        <label htmlFor="password">New password (at least 10 characters)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={72} />
        <button type="submit">Update password</button>
      </form>
      <p><Link href="/app">Cancel</Link></p>
    </>
  );
}
