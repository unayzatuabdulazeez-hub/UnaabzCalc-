"use client";
import { useEffect } from "react";
declare global { interface Window { adsbygoogle?: unknown[] } }

/** One responsive AdSense unit. Rendered by the server only when shouldShowAds() says so (Free user, content page, real ids). */
export function AdSlot({ publisherId, slotId }: { publisherId: string; slotId: string }) {
  useEffect(() => {
    try {
      if (!document.querySelector("script[data-adsense]")) {
        const s = document.createElement("script");
        s.async = true; s.crossOrigin = "anonymous"; s.setAttribute("data-adsense", "1");
        s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
        document.head.appendChild(s);
      }
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch { /* an ad that fails to load must never break the page */ }
  }, [publisherId]);
  return (
    <aside className="card noprint" aria-label="Advertisement">
      <p className="hint">Advertisement. Premium removes ads.</p>
      <ins className="adsbygoogle" style={{ display: "block", minHeight: 90 }} data-ad-client={publisherId} data-ad-slot={slotId} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
