import Link from "next/link";
import { loadPrice, paymentsConfig } from "@/lib/payments/load-price";
import { formatPrice } from "@/lib/payments/price";

export const dynamic = "force-dynamic";
export const metadata = { title: "Premium pricing, UnaabzCalc" };

export default async function Pricing() {
  const price = await loadPrice();
  return (
    <>
      <h1>UnaabzCalc Premium</h1>
      <p className="muted">Calculate Better. Sell Smarter.</p>
      <div className="card">
        <h2>{price ? formatPrice(price) : "Price shown at checkout"}</h2>
        <ul>
          <li>Save and reopen your calculations</li>
          <li>Customers, products and jobs for each business</li>
          <li>Business dashboard and analysis from what you enter</li>
          <li>Advanced calculators and estimators</li>
          <li>Excel, PDF, print and share for your calculations</li>
          <li>No ads</li>
        </ul>
        <p className="hint">Billed monthly in naira through Paystack. You can stop renewal at any time; you keep Premium until the end of the month you paid for.</p>
        {paymentsConfig() ? <p><Link className="btn" href="/app/upgrade">Get Premium</Link></p> : <p className="hint">Online payment opens soon.</p>}
      </div>
      <p>The everyday calculators stay free: <a href="/free/">use the Free calculators</a>. <Link href="/login">Sign in</Link></p>
    </>
  );
}
