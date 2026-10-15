import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "../config/env";
import { readServiceRoleKey } from "../config/paystack";

/**
 * Service-role client. It BYPASSES row-level security, so it is used only by the payment code (webhook, checkout, callback)
 * and only on the server. It never touches user data other than the payment functions in migration 0005.
 */
export function adminClient() {
  const key = readServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY });
  return createClient(publicEnv().supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
