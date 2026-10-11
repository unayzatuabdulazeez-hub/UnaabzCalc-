import { MESSAGES } from "./messages";
export function Notice({ code }: { code?: string | string[] }) {
  const c = Array.isArray(code) ? code[0] : code;
  const m = c ? MESSAGES[c] : undefined;
  if (!m) return null;
  return <p role="status" className={m.kind}>{m.text}</p>;
}
