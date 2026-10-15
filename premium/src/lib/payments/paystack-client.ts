/**
 * Thin Paystack API wrapper. Server use only (it holds the secret key). `fetch` is injectable so tests never touch the network.
 * The secret key is only ever sent as the Authorization header; errors never include it or the response body.
 */
import type { PaystackConfig } from "../config/paystack";
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export class PaystackError extends Error { constructor(message: string, public readonly status?: number) { super(message); this.name = "PaystackError"; } }

const BASE = "https://api.paystack.co";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function paystack(cfg: Pick<PaystackConfig, "secretKey">, f: FetchLike = fetch as unknown as FetchLike, timeoutMs = 10_000) {
  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await f(BASE + path, { method, signal: ctl.signal, headers: { Authorization: `Bearer ${cfg.secretKey}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      let json: unknown = null;
      try { json = await res.json(); } catch { /* handled below */ }
      if (!res.ok) throw new PaystackError(`Paystack answered ${res.status} for ${method} ${(path.split("?")[0] ?? "").replace(/\/[^/]*$/, "/…")}`, res.status);
      return json;
    } catch (e) {
      if (e instanceof PaystackError) throw e;
      throw new PaystackError(`Could not reach Paystack (${(e as Error).name === "AbortError" ? "timed out" : "network error"})`);
    } finally { clearTimeout(timer); }
  }
  return {
    /** Raw verify response; parse with parseVerifyResponse. */
    verify: (reference: string) => call("GET", `/transaction/verify/${encodeURIComponent(reference)}`),
    async fetchPlan(code: string): Promise<{ amount: unknown; currency: unknown; interval: unknown }> {
      const j = await call("GET", `/plan/${encodeURIComponent(code)}`);
      if (!isObj(j) || j.status !== true || !isObj(j.data)) throw new PaystackError("Paystack plan response was not understood");
      return { amount: j.data.amount, currency: j.data.currency, interval: j.data.interval };
    },
    async initialize(a: { email: string; amountKobo: number; planCode: string; reference: string; callbackUrl: string; userId: string }): Promise<string> {
      const j = await call("POST", "/transaction/initialize", { email: a.email, amount: a.amountKobo, plan: a.planCode, reference: a.reference, callback_url: a.callbackUrl, metadata: { user_id: a.userId, source: "unaabzcalc-premium" } });
      const url = isObj(j) && isObj(j.data) && typeof j.data.authorization_url === "string" ? j.data.authorization_url : "";
      let ok = false;
      try { const u = new URL(url); ok = u.protocol === "https:" && (u.hostname === "checkout.paystack.com" || u.hostname.endsWith(".paystack.com")); } catch { /* ok stays false */ }
      if (!ok) throw new PaystackError("Paystack did not return a checkout address");
      return url;
    },
    async manageLink(subscriptionCode: string): Promise<string> {
      const j = await call("GET", `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`);
      const url = isObj(j) && isObj(j.data) && typeof j.data.link === "string" ? j.data.link : "";
      let ok = false;
      try { const u = new URL(url); ok = u.protocol === "https:" && u.hostname.endsWith("paystack.com"); } catch { /* ok stays false */ }
      if (!ok) throw new PaystackError("Paystack did not return a manage link");
      return url;
    },
  };
}
