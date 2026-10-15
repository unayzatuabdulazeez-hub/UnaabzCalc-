/**
 * Whether to render an ad. One rule, tested: ads need a real publisher id AND a signed-in Free user AND a read-only content page.
 * Premium users never see ads. Pages with forms, saving, billing or exports never show ads.
 */
export type PageKind = "content" | "form" | "billing" | "export";
export function shouldShowAds(o: { hasPremium: boolean; publisherId: string | null; slotId: string | null; page: PageKind }): boolean {
  return !o.hasPremium && o.page === "content" && !!o.publisherId && /^\d{6,15}$/.test(o.slotId ?? "");
}
export const adsenseSlotId = (src: Record<string, string | undefined>): string | null => { const v = (src.ADSENSE_SLOT_ID ?? "").trim(); return /^\d{6,15}$/.test(v) ? v : null; };
