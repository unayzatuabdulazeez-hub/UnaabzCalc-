/** Reading admin list URLs (?q=&filter=&page=). Pure. Nothing here is trusted: every value is checked against a fixed list or a range. */
export const PAGE_SIZE = 25;
export const MAX_PAGE = 10_000;
export const USER_FILTERS = [["all", "Everyone"], ["premium_now", "Has Premium now"], ["paying", "Paying"], ["expiring_soon", "Ends within 7 days"], ["not_premium", "No Premium now"], ["free", "Free plan"], ["trial", "Trial"], ["complimentary", "Complimentary"], ["founding_member", "Founding members"], ["cancelled", "Cancelled (still paid up)"], ["expired", "Expired"]] as const;
export const PAYMENT_FILTERS = [["all", "All"], ["success", "Successful"], ["mismatch", "Mismatched (no access given)"], ["pending", "Pending"]] as const;
export const WEBHOOK_FILTERS = [["problems", "Problems only"], ["error", "Errors"], ["unfinished", "Stuck (no result)"], ["all", "Everything"]] as const;
type Pairs = readonly (readonly [string, string])[];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

export interface ListParams { q: string; filter: string; page: number; offset: number; limit: number }
export function parseListParams(sp: Record<string, string | string[] | undefined>, filters: Pairs): ListParams {
  const q = (one(sp.q) ?? "").replace(CONTROL, " ").trim().slice(0, 100);
  const f = one(sp.filter) ?? "";
  const filter = filters.some(([k]) => k === f) ? f : (filters[0]?.[0] ?? "all");
  const raw = one(sp.page) ?? "1";
  const n = /^\d{1,5}$/.test(raw) ? Number(raw) : 1;
  const page = Math.min(Math.max(n, 1), MAX_PAGE);
  return { q, filter, page, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE };
}
export function pageInfo(total: number, page: number, size = PAGE_SIZE) {
  const t = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const pages = Math.max(1, Math.ceil(t / size));
  const from = t === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(t, page * size);
  return { total: t, pages, from: Math.min(from, t), to: Math.max(to, 0), hasPrev: page > 1, hasNext: page < pages };
}
/** Builds a link that keeps the current search and filter. Default values are left out so URLs stay short. */
export function listHref(base: string, p: { q?: string; filter?: string; page?: number }, defaultFilter: string): string {
  const u = new URLSearchParams();
  if (p.q) u.set("q", p.q);
  if (p.filter && p.filter !== defaultFilter) u.set("filter", p.filter);
  if (p.page && p.page > 1) u.set("page", String(p.page));
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

/** Form values for the three actions on a person's page. */
export function validateAdminAction(kind: "grant" | "revoke" | "end", form: Record<string, unknown>): { ok: true; reason: string; days?: number } | { ok: false; code: string } {
  const reason = (typeof form.reason === "string" ? form.reason : "").replace(CONTROL, " ").trim();
  if (reason.length < 3 || reason.length > 500) return { ok: false, code: "admin_reason" };
  if (kind !== "grant") return { ok: true, reason };
  const d = typeof form.days === "string" ? form.days.trim() : "";
  if (!/^\d{1,3}$/.test(d)) return { ok: false, code: "admin_days" };
  const days = Number(d);
  if (days < 1 || days > 365) return { ok: false, code: "admin_days" };
  return { ok: true, reason, days };
}
