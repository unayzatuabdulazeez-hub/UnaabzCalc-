import Link from "next/link";
import { businessContext } from "@/lib/server/context";
import { listAdapters, type Group } from "@/lib/calc/adapters";
import { PlanBanner } from "@/app/plan-banner";

export const dynamic = "force-dynamic";

const GROUPS: [Group, string, string][] = [
  ["estimator", "Estimators", "Priced lists for jobs and projects. You enter every quantity and rate."],
  ["advanced", "Advanced calculators", "No size limits, several products or ponds, and what-if scenarios."],
  ["calculator", "Everyday calculators", "The same numbers as the Free app. You can try them on any plan."],
];

export default async function NewCalculation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { business, plan } = await businessContext(id);
  return (
    <>
      <p><Link href={`/app/b/${id}/calculations`}>Saved calculations</Link></p>
      <h1>New calculation for {business.name}</h1>
      <PlanBanner hasPremium={plan.hasPremium} />
      {GROUPS.map(([group, heading, intro]) => (
        <section key={group}>
          <h2>{heading}</h2>
          <p className="muted">{intro}</p>
          {listAdapters().filter((a) => a.group === group).map((a) => (
            <div className="card" key={a.id}>
              <Link href={`/app/b/${id}/calculations/new/${a.id}`}><b>{a.name}</b></Link>{a.premium && <span className="hint"> · Premium</span>}
              <p className="hint">{a.blurb}</p>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
