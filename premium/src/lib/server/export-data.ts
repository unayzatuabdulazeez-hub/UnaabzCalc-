import "server-only";
import { buildExportModel, type ExportModel } from "../export/model";
import { isUuid } from "../validation/common";
import type { businessContext } from "./context";

type Ctx = Awaited<ReturnType<typeof businessContext>>;

/** Loads one saved calculation (RLS-scoped) and builds the export model by re-running the engine. null = not found. */
export async function loadExportModel(ctx: Ctx, businessId: string, recordId: string): Promise<ExportModel | { error: string } | null> {
  if (!isUuid(recordId)) return null;
  const { supabase, business } = ctx;
  const { data: row } = await supabase.from("saved_calculations")
    .select("title,calculator_id,inputs,notes,created_at,updated_at,engine_version,customer_id,job_id,product_id")
    .eq("id", recordId).eq("business_id", businessId).maybeSingle();
  if (!row) return null;
  const [c, j, p] = await Promise.all([
    row.customer_id ? supabase.from("customers").select("name").eq("id", row.customer_id).eq("business_id", businessId).maybeSingle() : null,
    row.job_id ? supabase.from("jobs").select("title").eq("id", row.job_id).eq("business_id", businessId).maybeSingle() : null,
    row.product_id ? supabase.from("products").select("name").eq("id", row.product_id).eq("business_id", businessId).maybeSingle() : null,
  ]);
  return buildExportModel(row, business.name, {
    customer: (c?.data as { name?: string } | null)?.name ?? null,
    job: (j?.data as { title?: string } | null)?.title ?? null,
    product: (p?.data as { name?: string } | null)?.name ?? null,
  });
}
