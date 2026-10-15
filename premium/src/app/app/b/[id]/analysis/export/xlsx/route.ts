import { businessContext } from "@/lib/server/context";
import { loadBusinessData } from "@/lib/server/business-data";
import { download, XLSX } from "@/lib/server/download";
import { buildAnalysisWorkbook } from "@/lib/export/records";
import { analyse } from "@/lib/analysis/business";
import { getAdapter } from "@/lib/calc/adapters";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await businessContext(id);
  const { data, truncated } = await loadBusinessData(ctx, id);
  const now = new Date();
  const a = analyse({ ...data, jobs: data.jobs.map((j) => ({ ...j, status: j.status as never })), now });
  return download(buildAnalysisWorkbook(a, ctx.business.name, (cid) => getAdapter(cid)?.name ?? cid, now, truncated), XLSX, `${ctx.business.name} analysis`, "xlsx");
}
