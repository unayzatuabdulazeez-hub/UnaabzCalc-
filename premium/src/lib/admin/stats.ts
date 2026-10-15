/** Turns the admin_stats() JSON into a checked object. A missing or odd field becomes 0 rather than breaking the page or showing "NaN". */
const NUM_KEYS = ["users_total", "signups_7d", "signups_30d", "premium_now", "paying_now", "expiring_7d", "will_not_renew", "revenue_kobo_this_month", "revenue_kobo_30d", "revenue_kobo_all", "payments_success", "payments_mismatch", "payments_pending_over_1h", "webhooks_24h", "webhook_problems_24h"] as const;
export type AdminStats = Record<(typeof NUM_KEYS)[number], number> & { byStatus: Record<string, number>; revenueByMonth: { month: string; amountKobo: number }[]; generatedAt: string | null };
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d{1,18}$/.test(v) ? Number(v) : 0);
export function parseAdminStats(j: unknown): AdminStats {
  const o = (typeof j === "object" && j !== null ? j : {}) as Record<string, unknown>;
  const out = {} as AdminStats;
  for (const k of NUM_KEYS) out[k] = n(o[k]);
  const bs = typeof o.by_status === "object" && o.by_status !== null ? (o.by_status as Record<string, unknown>) : {};
  out.byStatus = Object.fromEntries(Object.entries(bs).filter(([k]) => /^[a-z_]{2,30}$/.test(k)).map(([k, v]) => [k, n(v)]));
  out.revenueByMonth = (Array.isArray(o.revenue_by_month) ? o.revenue_by_month : [])
    .filter((r): r is { month: string; amount_kobo: unknown } => typeof r === "object" && r !== null && typeof (r as { month?: unknown }).month === "string" && /^\d{4}-\d{2}$/.test((r as { month: string }).month))
    .map((r) => ({ month: r.month, amountKobo: n(r.amount_kobo) }));
  out.generatedAt = typeof o.generated_at === "string" && !Number.isNaN(Date.parse(o.generated_at)) ? o.generated_at : null;
  return out;
}
/** Africa/Lagos is UTC+1 all year (no daylight saving), so a fixed one-hour shift is exact. */
export const lagosDay = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? "" : new Date(t + 3_600_000).toISOString().slice(0, 10); };
export const lagosDateTime = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? "" : new Date(t + 3_600_000).toISOString().slice(0, 16).replace("T", " "); };
