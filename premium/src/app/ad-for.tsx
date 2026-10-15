import { AdSlot } from "./ad-slot";
import { adsensePublisherId } from "@/lib/config/env";
import { adsenseSlotId, shouldShowAds } from "@/lib/ads";

/** Server component: renders nothing unless every ad rule passes. Place it only on read-only content pages. */
export function AdFor({ hasPremium }: { hasPremium: boolean }) {
  const publisherId = adsensePublisherId({ ADSENSE_PUBLISHER_ID: process.env.ADSENSE_PUBLISHER_ID });
  const slotId = adsenseSlotId({ ADSENSE_SLOT_ID: process.env.ADSENSE_SLOT_ID });
  if (!publisherId || !slotId || !shouldShowAds({ hasPremium, publisherId, slotId, page: "content" })) return null;
  return <AdSlot publisherId={publisherId} slotId={slotId} />;
}
