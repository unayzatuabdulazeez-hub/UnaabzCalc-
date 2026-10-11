import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>UnaabzCalc Premium</h1>
      <p className="muted">Calculate Better. Sell Smarter.</p>
      <p>Premium is being built in phases. Phase 1 provides accounts, businesses and plan checks. Calculators and estimators arrive in later phases.</p>
      <p><Link className="btn" href="/login">Sign in</Link> <Link href="/register">Create an account</Link></p>
      <p><Link href="/pricing">Premium pricing</Link></p>
      <p><a href="/free/">Use the Free calculators</a></p>
    </>
  );
}
