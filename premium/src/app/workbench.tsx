"use client";
import { useActionState } from "react";
import { CalcFields, MetaFields, ResultView, type Option } from "./calc-ui";
import type { Field } from "@/lib/calc/adapters";
import type { CalcState } from "@/lib/calc/prepare";

type Meta = { title: string; notes: string; customer_id: string; job_id: string; product_id: string };

/**
 * Calculator form + live result + save form. The numbers are POSTed to a Server Action (never put in the page address),
 * the server runs the shared engine, and only a cleaned, display-ready result comes back.
 */
export function Workbench(props: {
  fields: Field[];
  initial: CalcState;
  calculate: (prev: CalcState, fd: FormData) => Promise<CalcState>;
  calculateLabel: string;
  saveAction: (fd: FormData) => Promise<void>;
  saveLabel: string;
  saveHeading: string;
  meta: Meta;
  customers: Option[]; jobs: Option[]; products: Option[];
  canSave: boolean;
}) {
  const [state, run, pending] = useActionState(props.calculate, props.initial);
  return (
    <>
      <form action={run}>
        <CalcFields fields={props.fields} values={state.flat} />
        <button type="submit" disabled={pending}>{pending ? "Calculating…" : props.calculateLabel}</button>
      </form>
      {state.status === "error" && <p role="alert" className="err">{state.error}</p>}
      {state.status === "ok" && (
        <>
          <h2>Result</h2>
          <ResultView view={state.view} />
          {props.canSave && (
            <form action={props.saveAction}>
              {Object.entries(state.flat).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <h2>{props.saveHeading}</h2>
              <MetaFields defaults={props.meta} customers={props.customers} jobs={props.jobs} products={props.products} />
              <button type="submit">{props.saveLabel}</button>
              <p className="hint">The result is calculated again on our server when you save.</p>
            </form>
          )}
        </>
      )}
    </>
  );
}
