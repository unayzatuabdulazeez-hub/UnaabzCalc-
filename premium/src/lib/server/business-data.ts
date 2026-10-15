import "server-only";
import type { businessContext } from "./context";
import type { RCalc, RCustomer, RJob, RProduct, RecordsData } from "../export/records";

type Ctx = Awaited<ReturnType<typeof businessContext>>;
export const PAGE = 1000;       // Supabase returns at most 1,000 rows per request, so we read in pages
export const MAX_PAGES = 5;     // 5,000 newest rows per table: enough for a small business, bounded for speed and memory

async function all<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await read(p * PAGE, p * PAGE + PAGE - 1);
    if (error || !data) throw new Error("Could not read your records.");
    rows.push(...data);
    if (data.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** All of one business's records (RLS-scoped to the signed-in owner), newest first, with a flag for any table that hit the cap. */
export async function loadBusinessData(ctx: Ctx, businessId: string): Promise<{ data: RecordsData; truncated: string[] }> {
  const { supabase } = ctx;
  const [c, p, j, s] = await Promise.all([
    all<RCustomer>((a, b) => supabase.from("customers").select("id,name,phone,email,address,notes,archived_at,created_at").eq("business_id", businessId).order("created_at", { ascending: false }).order("id").range(a, b)),
    all<RProduct>((a, b) => supabase.from("products").select("id,name,unit,cost_price,selling_price,notes,archived_at,created_at").eq("business_id", businessId).order("created_at", { ascending: false }).order("id").range(a, b)),
    all<RJob>((a, b) => supabase.from("jobs").select("id,title,description,status,due_date,agreed_amount,customer_id,archived_at,created_at").eq("business_id", businessId).order("created_at", { ascending: false }).order("id").range(a, b)),
    all<RCalc>((a, b) => supabase.from("saved_calculations").select("id,calculator_id,title,customer_id,job_id,product_id,archived_at,created_at").eq("business_id", businessId).order("created_at", { ascending: false }).order("id").range(a, b)),
  ]);
  return { data: { customers: c.rows, products: p.rows, jobs: j.rows, calculations: s.rows }, truncated: [c.truncated && "customers", p.truncated && "products", j.truncated && "jobs", s.truncated && "saved calculations"].filter((x): x is string => !!x) };
}
