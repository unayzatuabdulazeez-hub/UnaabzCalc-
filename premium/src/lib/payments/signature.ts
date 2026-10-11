import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack signs the RAW request body with HMAC-SHA512 using your secret key and sends it hex-encoded in `x-paystack-signature`.
 * The raw text must be hashed exactly as received (before any JSON parsing). Comparison is constant-time.
 * An empty secret, a missing header or a malformed header is always "not valid".
 */
export function verifyPaystackSignature(rawBody: string, signatureHeader: string | null | undefined, secret: string): boolean {
  if (!secret || typeof signatureHeader !== "string") return false;
  const sig = signatureHeader.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(sig)) return false;
  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(sig, "hex"));
}
export const signBody = (rawBody: string, secret: string) => createHmac("sha512", secret).update(rawBody, "utf8").digest("hex"); // used by tests and the local webhook simulator
