import { businessContext } from "@/lib/server/context";
import { loadExportModel } from "@/lib/server/export-data";
import { fileBase } from "@/lib/export/model";
import { exportPdf } from "@/lib/export/pdf";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const ctx = await businessContext(id); // signs-in check + 404 for businesses that are not yours
  const model = await loadExportModel(ctx, id, rid);
  if (!model) return new Response("Not found", { status: 404, headers: HEADERS });
  if ("error" in model) return new Response(model.error, { status: 422, headers: HEADERS });
  const body = exportPdf(model);
  return new Response(body as unknown as BodyInit, {
    headers: { ...HEADERS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileBase(model.title)}.pdf"`, "Content-Length": String(body.length) },
  });
}
