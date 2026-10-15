/** The public Premium price (a setting in the database, never hard-coded). Amounts are whole kobo. */
export interface PremiumPrice { amountKobo: number; currency: "NGN"; interval: "monthly" }
export function parsePremiumPrice(value: unknown): PremiumPrice | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.amount_kobo !== "number" || !Number.isSafeInteger(v.amount_kobo) || v.amount_kobo < 10_000 || v.amount_kobo > 100_000_000) return null;
  if (v.currency !== "NGN" || v.interval !== "monthly") return null;
  return { amountKobo: v.amount_kobo, currency: "NGN", interval: "monthly" };
}
export function formatPrice(p: PremiumPrice): string {
  const naira = p.amountKobo / 100;
  const text = new Intl.NumberFormat("en-US", { minimumFractionDigits: Number.isInteger(naira) ? 0 : 2, maximumFractionDigits: 2 }).format(naira);
  return `₦${text} per month`;
}
/** Paystack's plan must charge exactly what we show. If it does not, checkout is refused rather than charging a different amount. */
export function planMatchesPrice(plan: { amount: unknown; currency: unknown; interval: unknown }, price: PremiumPrice): boolean {
  return plan.amount === price.amountKobo && plan.currency === "NGN" && plan.interval === "monthly";
}
export const newReference = (randomHex: string) => `UC-${randomHex}`;
