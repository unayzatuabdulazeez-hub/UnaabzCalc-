/**
 * The ONE place that decides whether a user has Premium. Pure function, no I/O, fully unit-tested.
 * It is only ever called on the server with a row read from the database. Browser state is never an input.
 * Fails closed: missing, malformed or contradictory data means NO Premium.
 */
export const ENTITLEMENT_STATUSES = ["free", "trial", "premium", "founding_member", "complimentary", "expired", "cancelled"] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export interface EntitlementRow {
  status: string;
  trial_start: string | null;
  trial_end: string | null;
  subscription_start: string | null;
  subscription_end: string | null;
  payment_status: string;
  cancellation_status?: string;
}
export interface ResolvedEntitlement {
  stored: string;
  effective: EntitlementStatus;
  hasPremium: boolean;
  /** Ads may be shown only to users without Premium. (Whether ads exist at all is a separate config.) */
  showAds: boolean;
  premiumUntil: Date | null;
  reason: string;
}

function ts(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Date.parse(v);
  return Number.isNaN(n) ? null : n;
}
const NONE = (stored: string, effective: EntitlementStatus, reason: string): ResolvedEntitlement =>
  ({ stored, effective, hasPremium: false, showAds: true, premiumUntil: null, reason });
const YES = (stored: string, effective: EntitlementStatus, until: number | null, reason: string): ResolvedEntitlement =>
  ({ stored, effective, hasPremium: true, showAds: false, premiumUntil: until === null ? null : new Date(until), reason });

export function resolveEntitlement(row: EntitlementRow | null | undefined, now: Date = new Date()): ResolvedEntitlement {
  if (!row) return NONE("none", "free", "no entitlement record");
  const t = now.getTime();
  const status = row.status;
  if (!(ENTITLEMENT_STATUSES as readonly string[]).includes(status)) return NONE(status, "free", "unrecognised status");
  const subStart = ts(row.subscription_start), subEnd = ts(row.subscription_end);
  const trialStart = ts(row.trial_start), trialEnd = ts(row.trial_end);
  const started = subStart === null || subStart <= t;

  switch (status as EntitlementStatus) {
    case "free": return NONE(status, "free", "free plan");
    case "expired": return NONE(status, "expired", "subscription expired");
    case "trial":
      if (trialEnd === null) return NONE(status, "free", "trial without an end date is not honoured");
      if (trialStart !== null && trialStart > t) return NONE(status, "free", "trial has not started");
      return trialEnd > t ? YES(status, "trial", trialEnd, "active trial") : NONE(status, "expired", "trial ended");
    case "premium":
      if (row.payment_status !== "paid") return NONE(status, "free", "premium requires a verified paid status");
      if (subEnd === null) return NONE(status, "free", "premium without an end date is not honoured");
      if (!started) return NONE(status, "free", "subscription has not started");
      return subEnd > t ? YES(status, "premium", subEnd, "paid subscription") : NONE(status, "expired", "paid period ended");
    case "founding_member":
      if (!started) return NONE(status, "free", "membership has not started");
      if (subEnd !== null && subEnd <= t) return NONE(status, "expired", "founding membership ended");
      return YES(status, "founding_member", subEnd, "founding member");
    case "complimentary":
      if (!started) return NONE(status, "free", "complimentary access has not started");
      if (subEnd !== null && subEnd <= t) return NONE(status, "expired", "complimentary access ended");
      return YES(status, "complimentary", subEnd, "complimentary access");
    case "cancelled":
      // Cancelled keeps the access that was already paid for until the end of the period.
      if (subEnd !== null && subEnd > t && started) return YES(status, "cancelled", subEnd, "cancelled; access continues to end of paid period");
      return NONE(status, "cancelled", "cancelled");
  }
}
