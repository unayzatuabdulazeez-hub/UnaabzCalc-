/** Reads a request body but stops (returns null) once it passes the limit, so a huge or endless body can never fill memory. */
export async function readLimitedText(req: { body: ReadableStream<Uint8Array> | null }, maxBytes: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder("utf-8").decode(all);
}
