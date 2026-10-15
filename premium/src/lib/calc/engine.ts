/**
 * Typed access to the SHARED calculation engine. The engine file itself is generated from ../free/calc-engine.js
 * (see scripts/sync-engine.mjs) and is never edited here, so Free and Premium can never disagree on a number.
 * Calculation logic stays free of UI, auth, persistence and payments.
 */
import raw from "../../vendor/calc-engine.js";

export interface CalcResult { ok: boolean; error?: string; [key: string]: unknown }
export interface CalcDefinition { id: string; name: string; category: string; access: "free" | "premium"; description: string; [key: string]: unknown }
export interface Engine {
  registry: CalcDefinition[];
  categories: Record<string, string>;
  canAccess(calc: CalcDefinition): boolean;
  num(v: string): number;
  percentage(mode: "of" | "change" | "difference", a: number, b: number): CalcResult;
  profit(cost: number, sell: number): CalcResult;
  loan(v: { principal: number; rate: number; term: number; unit: string; freq: string }): CalcResult;
  [fn: string]: unknown;
}
export const engine = raw as unknown as Engine;
