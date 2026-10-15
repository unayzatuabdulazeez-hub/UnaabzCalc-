/** Only same-site relative paths are allowed as post-login destinations (prevents open redirects). */
export function safeNext(raw: unknown, fallback = "/app"): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\u0000-\u001f]/.test(raw)) return fallback;
  return raw;
}
