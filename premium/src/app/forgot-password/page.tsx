import Link from "next/link";
import { Notice } from "../notice";
import { requestReset } from "./actions";

export default async function Forgot({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1>Reset your password</h1>
      <Notice code={sp.m} />
      <form action={requestReset}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <button type="submit">Send reset link</button>
      </form>
      <p><Link href="/login">Back to sign in</Link></p>
    </>
  );
}
