import "server-only";
import { fileBase } from "../export/model";

export const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;
export const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A file download with a safe name, no caching and no content sniffing. */
export function download(body: Buffer, contentType: string, title: string, ext: string): Response {
  return new Response(body as unknown as BodyInit, {
    headers: { ...NO_STORE, "Content-Type": contentType, "Content-Disposition": `attachment; filename="${fileBase(title)}.${ext}"`, "Content-Length": String(body.length) },
  });
}
