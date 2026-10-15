import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { readPaystackConfig } from "@/lib/config/paystack";
import { paystack } from "@/lib/payments/paystack-client";
import { settleCharge } from "@/lib/payments/settle";
import { REFERENCE_RE } from "@/lib/payments/events";
import { publicEnv } from "@/lib/config/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Where Paystack sends the customer after paying. Only the signed-in owner of that payment can settle it; the amount still comes from Paystack's verify answer. */
export async function GET(req: NextRequest) {
  const base = publicEnv().appUrl;
  const go = (m: string) => NextResponse.redirect(`${base}/app/billing?m=${m}`, 303);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`, 303);
  const reference = req.nextUrl.searchParams.get("reference") ?? req.nextUrl.searchParams.get("trxref") ?? "";
  if (!REFERENCE_RE.test(reference)) return go("pay_unknown");
  const { data: mine } = await supabase.from("payments").select("id,status").eq("reference", reference).maybeSingle(); // RLS: own rows only
  if (!mine) return go("pay_unknown");
  if (mine.status === "success") return go("pay_ok");
  let cfg;
  try { cfg = readPaystackConfig({ PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY, PAYSTACK_PLAN_CODE: process.env.PAYSTACK_PLAN_CODE }); } catch { cfg = null; }
  if (!cfg) return go("payments_off");
  try {
    const db = adminClient(), api = paystack(cfg);
    const r = await settleCharge(reference, { planCode: cfg.planCode, verify: api.verify, rpc: async (fn, a) => { const { data, error } = await db.rpc(fn, a); return { data, error }; } });
    if (r.outcome === "granted" || r.outcome === "duplicate" || r.outcome === "recorded_no_change") return go("pay_ok");
    if (r.outcome === "mismatch" || r.outcome === "rejected") return go("pay_mismatch");
    return go("pay_failed");
  } catch { return go("pay_pending"); } // Paystack or the database was unreachable: the webhook will still arrive
}
