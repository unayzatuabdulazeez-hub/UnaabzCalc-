/**
 * Everything a save or update needs, as ONE pure, tested function:
 * read the posted fields -> clean them -> run the shared engine -> only then accept.
 * A result is never read from the browser. Invalid numbers are never saved.
 */
import { getAdapter, normalizeInputs, readFormInputs, runCalculation, type Inputs } from "./adapters";
import { validateCalcMeta, type CalcMeta } from "../validation/calc-meta";

export type Prepared = { ok: true; calculatorId: string; inputs: Inputs; meta: CalcMeta } | { ok: false; code: string };

export function prepareCalculation(calcId: string, get: (name: string) => string | undefined): Prepared {
  const adapter = getAdapter(calcId);
  if (!adapter) return { ok: false, code: "failed" };
  const meta = validateCalcMeta({
    title: get("title"), notes: get("notes"), customer_id: get("customer_id"), job_id: get("job_id"), product_id: get("product_id"),
  }, adapter.name);
  if (!meta.ok) return { ok: false, code: Object.keys(meta.errors)[0] ?? "failed" };
  const norm = normalizeInputs(calcId, readFormInputs(calcId, get));
  if (!norm.ok) return { ok: false, code: "bad_inputs" };
  const run = runCalculation(calcId, norm.inputs);
  if (!run.ok) return { ok: false, code: "bad_inputs" };
  return { ok: true, calculatorId: calcId, inputs: norm.inputs, meta: meta.value };
}

// ---------- Calculate (preview) without putting the numbers in the page address ----------
import { flattenInputs, type Described } from "./adapters";

export type CalcState =
  | { status: "idle"; flat: Record<string, string> }
  | { status: "ok"; flat: Record<string, string>; view: Described }
  | { status: "error"; flat: Record<string, string>; error: string };

/** Clean the posted/stored fields, run the shared engine, and return something safe to send to the browser. */
export function computeState(calcId: string, raw: Record<string, unknown>): CalcState {
  if (!getAdapter(calcId)) return { status: "error", flat: {}, error: "This calculator cannot be opened." };
  const typed = flattenInputs(calcId, raw);
  const norm = normalizeInputs(calcId, raw);
  if (!norm.ok) return { status: "error", flat: typed, error: norm.error };
  const flat = flattenInputs(calcId, norm.inputs);
  const run = runCalculation(calcId, norm.inputs);
  return run.ok ? { status: "ok", flat, view: run.view } : { status: "error", flat, error: run.error };
}
export const computeFromForm = (calcId: string, get: (n: string) => string | undefined): CalcState => computeState(calcId, readFormInputs(calcId, get));
