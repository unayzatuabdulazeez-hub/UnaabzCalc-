/**
 * Shared building blocks for every Premium adapter: field types, fixed-locale formatters, field builders and raw-value helpers.
 * Kept separate from adapters.ts so the advanced calculators and estimators can use them without a circular import.
 */
import { engine, type CalcResult } from "./engine";

export type NumField = { kind: "num"; key: string; label: string; optional?: boolean; showIf?: { key: string; value: string } };
export type TextField = { kind: "text"; key: string; label: string; maxLen: number; optional?: boolean };
export type SelectField = { kind: "select"; key: string; label: string; options: [string, string][]; showIf?: { key: string; value: string } };
export type RowsField = { kind: "rows"; key: string; label: string; addLabel: string; cols: (NumField | TextField)[]; maxRows: number; blankRows: number };
export type Field = NumField | TextField | SelectField | RowsField;
export type Inputs = Record<string, unknown>;
export type Tone = "good" | "bad" | "";
export interface Described { rows: [string, string, Tone?][]; table?: { head: string[]; body: string[][] }; note?: string }
export type Group = "calculator" | "advanced" | "estimator";
export interface Adapter { id: string; name: string; group: Group; premium: boolean; blurb: string; fields: Field[]; run(inputs: Inputs): CalcResult; describe(r: CalcResult, inputs: Inputs): Described }

// ---- formatting (fixed locale so output is identical on every server) ----
export const nf = (min: number, max: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
const f2 = nf(2, 2), f0 = nf(0, 0), fAny = nf(0, 10);
export const money = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? (n < 0 ? "-" : "") + "₦" + f2.format(Math.abs(n)) : "—");
export const pct = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? f2.format(n) + "%" : "—");
export const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? f0.format(n) : "—");
export const plain = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? fAny.format(n) : "—");
export const tone = (n: unknown): Tone => (typeof n === "number" ? (n > 0 ? "good" : n < 0 ? "bad" : "") : "");

// ---- field builders ----
export const num = (key: string, label: string, optional = false, showIf?: NumField["showIf"]): NumField => ({ kind: "num", key, label, optional, showIf });
export const sel = (key: string, label: string, options: [string, string][], showIf?: SelectField["showIf"]): SelectField => ({ kind: "select", key, label, options, showIf });
export const text = (key: string, label: string, maxLen: number, optional = true): TextField => ({ kind: "text", key, label, maxLen, optional });
export const rowsOf = (key: string, label: string, addLabel: string, cols: (NumField | TextField)[], blankRows: number, maxRows = 100): RowsField => ({ kind: "rows", key, label, addLabel, cols, maxRows, blankRows });

// ---- raw value helpers ----
export const S = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
export const N = (v: unknown): number => engine.num(S(v)) as number; // NaN when blank or not a number
export const O = (v: unknown): number => (S(v).trim() === "" ? 0 : N(v)); // optional number: blank means 0 (same as the Free app)
export const rowsIn = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
export const call = (name: string, ...args: unknown[]) => (engine[name] as (...a: unknown[]) => CalcResult)(...args);

export const UNIT: [string, string][] = [["months", "Months"], ["years", "Years"]];
export const FREQ: [string, string][] = [["monthly", "Monthly"], ["weekly", "Weekly"], ["biweekly", "Every 2 weeks"], ["quarterly", "Quarterly"], ["yearly", "Yearly"]];

