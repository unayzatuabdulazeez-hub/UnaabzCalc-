import { money } from "@/lib/calc/kit";
import { naira } from "@/lib/analysis/business";
export const koboMoney = (k: number) => money(naira(k));
export const pctText = (n: number | null) => (n === null || !Number.isFinite(n) ? "—" : `${(Math.round(n * 10) / 10).toFixed(1)}%`);
