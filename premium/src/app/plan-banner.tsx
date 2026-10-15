import Link from "next/link";
export function PlanBanner({ hasPremium }: { hasPremium: boolean }) {
  if (hasPremium) return null;
  return <p className="card" role="note">Your plan is Free. You can view everything you saved, but adding or editing needs an active Premium plan. <Link href="/app/upgrade">See Premium</Link></p>;
}
