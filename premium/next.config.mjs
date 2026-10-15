// Security headers. The CSP is deliberately strict; AdSense and Paystack origins are added only when those
// features are switched on (see SECURITY.md).
const isDev = process.env.NODE_ENV !== "production";
const supabaseOrigin = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin; } catch { return ""; } })();
// AdSense origins are allowed ONLY when a real publisher id is configured; otherwise the policy stays fully strict.
const adsOn = /^ca-pub-\d{16}$/.test((process.env.ADSENSE_PUBLISHER_ID ?? "").trim());
const adScript = adsOn ? " https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net" : "";
const adConnect = adsOn ? " https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net https://pagead2.googlesyndication.com" : "";
const adFrame = adsOn ? "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.googlesyndication.com https://*.google.com" : "";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${adScript}`, // Next.js inline bootstrap scripts; tighten with nonces in a later hardening pass
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${adsOn ? " https:" : ""}`,
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigin}${isDev ? " ws://localhost:* http://localhost:*" : ""}${adConnect}`.trim(),
  ...(adFrame ? [adFrame] : []),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.paystack.com",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ] }];
  },
};
export default nextConfig;
