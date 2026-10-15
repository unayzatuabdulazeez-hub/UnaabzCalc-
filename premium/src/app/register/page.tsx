import Link from "next/link";
import { Notice } from "../notice";
import { signUp } from "./actions";

export default async function Register({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1>Create your account</h1>
      <Notice code={sp.m} />
      <form action={signUp}>
        <label htmlFor="fullName">Your name (optional)</label>
        <input id="fullName" name="fullName" autoComplete="name" maxLength={120} />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <label htmlFor="password">Password (at least 10 characters)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={72} />
        <button type="submit">Create account</button>
      </form>
      <p>Already have an account? <Link href="/login">Sign in</Link></p>
    </>
  );
}
