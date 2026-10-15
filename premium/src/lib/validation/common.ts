export type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };
// eslint-disable-next-line no-control-regex
export const hasControlChars = (s: string) => /[\u0000-\u001f\u007f]/.test(s);
export const str = (v: unknown): string => (typeof v === "string" ? v : "");

export const PHONE_RE = /^\+?[0-9][0-9\s\-()]{3,28}[0-9]$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Money as an exact decimal string (never a float). Accepts "12,000.50" and a leading naira sign. Empty = null. */
export function parseMoney(raw: unknown, field: string, label: string, errors: Record<string, string>): string | null {
  const s = str(raw).trim().replace(/^₦\s*/, "").replace(/[,\s]/g, "");
  if (!s) return null;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) { errors[field] = `${label} must be a number such as 2500 or 2500.50.`; return null; }
  return s;
}
/** Escapes LIKE wildcards so a search for "50%" matches the text "50%" and nothing else. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);
