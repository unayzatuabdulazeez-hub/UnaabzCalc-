/** TEST HARNESS ONLY. A stand-in for src/lib/supabase/server.ts that answers from canned data, so real pages can be rendered without Supabase. */
type Db = { tables: Record<string, unknown[]>; rpc: Record<string, unknown>; user: { id: string; email: string } | null };
const g = globalThis as unknown as { __DB: Db };

function builder(table: string): unknown {
  const rows = () => (g.__DB.tables[table] ?? []) as unknown[];
  const b: unknown = new Proxy(function () { /* callable target */ }, {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => void) => res({ data: rows(), error: null, count: rows().length });
      if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve({ data: rows()[0] ?? null, error: null });
      return () => b;
    },
  });
  return b;
}
export async function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: g.__DB.user }, error: null }), signOut: async () => ({ error: null }) },
    from: (t: string) => builder(t),
    rpc: async (name: string) => {
      const v = g.__DB.rpc[name];
      return { data: typeof v === "function" ? (v as () => unknown)() : v ?? null, error: null };
    },
  };
}
