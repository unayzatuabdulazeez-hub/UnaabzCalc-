import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "../config/env";

/** User-scoped server client: every query runs as the signed-in user, so row-level security applies. */
export async function createClient() {
  const store = await cookies();
  const env = publicEnv();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* called from a Server Component: the middleware refreshes the session instead */ }
      },
    },
  });
}
