import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <nav className="card noprint" aria-label="Admin">
        <Link href="/app/admin">Overview</Link> · <Link href="/app/admin/users">Users</Link> · <Link href="/app/admin/payments">Payments</Link> · <Link href="/app/admin/webhooks">Webhooks</Link> · <Link href="/app">Back to my workspace</Link>
      </nav>
      {children}
    </>
  );
}
