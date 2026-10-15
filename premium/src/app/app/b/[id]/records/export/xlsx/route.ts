import { businessContext } from "@/lib/server/context";
import { loadBusinessData } from "@/lib/server/business-data";
import { download, XLSX } from "@/lib/server/download";
import { buildRecordsWorkbook } from "@/lib/export/records";
import { getAdapter } from "@/lib/calc/adapters";

export const dynamic = "force-dynamic";

/** Everything the owner entered, as one Excel file. Allowed on every plan: your own data is never paywalled. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await businessContext(id); // 404 for a business that is not yours
  const { data, truncated } = await loadBusinessData(ctx, id);
  const file = buildRecordsWorkbook(data, ctx.business.name, (cid) => getAdapter(cid)?.name ?? cid, new Date(), truncated);
  return download(file, XLSX, `${ctx.business.name} records`, "xlsx");
}
