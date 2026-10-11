import { readPaystackConfig } from "@/lib/config/paystack";
import { adminClient } from "@/lib/supabase/admin";
import { paystack } from "@/lib/payments/paystack-client";
import { handleWebhook } from "@/lib/payments/settle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Paystack calls this. Everything is checked in handleWebhook: signature first, then the transaction is re-verified with Paystack. */
export async function POST(req: Request) {
  let cfg;
  try { cfg = readPaystackConfig({ PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY, PAYSTACK_PLAN_CODE: process.env.PAYSTACK_PLAN_CODE }); } catch { cfg = null; }
  if (!cfg) return new Response("payments are not switched on", { status: 404 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > 100_000) return new Response("too large", { status: 413 });
  const raw = await req.text();
  let db;
  try { db = adminClient(); } catch { return new Response("not configured", { status: 500 }); }
  const api = paystack(cfg);
  const r = await handleWebhook(raw, req.headers.get("x-paystack-signature"), {
    secretKey: cfg.secretKey, planCode: cfg.planCode, verify: api.verify,
    rpc: async (fn, args) => { const { data, error } = await db.rpc(fn, args); return { data, error }; },
  });
  return new Response(r.body, { status: r.status });
}
