import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/app/notice";
import { PlanBanner } from "@/app/plan-banner";
import { Workbench } from "@/app/workbench";
import { businessContext, linkOptions, type SearchParams } from "@/lib/server/context";
import { getAdapter } from "@/lib/calc/adapters";
import { calculate, saveCalculation } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewOfKind({ params, searchParams }: { params: Promise<{ id: string; calc: string }>; searchParams: SearchParams }) {
  const { id, calc } = await params;
  const adapter = getAdapter(calc);
  if (!adapter) notFound();
  const sp = await searchParams;
  const { supabase, plan } = await businessContext(id);
  const options = plan.hasPremium ? await linkOptions(supabase, id) : { customers: [], jobs: [], products: [] };
  return (
    <>
      <p><Link href={`/app/b/${id}/calculations/new`}>All calculators</Link></p>
      <h1>{adapter.name}</h1>
      <Notice code={sp.m} />
      <PlanBanner hasPremium={plan.hasPremium} />
      {adapter.premium && !plan.hasPremium ? (
        <div className="card" role="note"><p><b>{adapter.name} is part of Premium.</b></p><p>{adapter.blurb}</p>
          <p className="muted">Your Free plan can still try the everyday calculators, and you can open, export and delete anything you saved earlier.</p></div>
      ) : <Workbench
        fields={adapter.fields} initial={{ status: "idle", flat: {} }}
        calculate={calculate.bind(null, id, calc)} calculateLabel="Calculate"
        saveAction={saveCalculation.bind(null, id, calc)} saveLabel="Save calculation" saveHeading="Save this calculation"
        meta={{ title: adapter.name, notes: "", customer_id: "", job_id: "", product_id: "" }}
        canSave={plan.hasPremium} {...options}
      />}
    </>
  );
}
