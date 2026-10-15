import Link from "next/link";
import { Notice } from "../notice";
import { signIn } from "./actions";

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1>Sign in</h1>
      <Notice code={sp.m} />
      <form action={signIn}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button type="submit">Sign in</button>
      </form>
      <p><Link href="/forgot-password">Forgot password?</Link> · <Link href="/register">Create an account</Link></p>
    </>
  );
}
