import { Result, hasControlChars, isUuid, str } from "./common";

export interface CalcMeta { title: string; notes: string | null; customer_id: string | null; job_id: string | null; product_id: string | null }

/** Title, notes and the optional links of a saved calculation. A blank title falls back to the calculator's name. */
export function validateCalcMeta(f: Record<string, unknown>, fallbackTitle: string): Result<CalcMeta> {
  const errors: Record<string, string> = {};
  const title = str(f.title).trim() || fallbackTitle;
  const notes = str(f.notes).trim();
  if (title.length > 160 || hasControlChars(title)) errors.title = "Title must be 160 characters or fewer.";
  if (notes.length > 2000 || hasControlChars(notes.replace(/[\r\n\t]/g, " "))) errors.notes = "Notes must be 2000 characters or fewer.";
  const link = (k: "customer_id" | "job_id" | "product_id") => {
    const v = str(f[k]).trim();
    if (v && !isUuid(v)) errors[k] = "Choose an item from the list.";
    return v || null;
  };
  const customer_id = link("customer_id"), job_id = link("job_id"), product_id = link("product_id");
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, notes: notes || null, customer_id, job_id, product_id } };
}

/** "Copy of X" within the 160-character title limit. */
export function copyTitle(title: string): string {
  const t = `Copy of ${title}`;
  return t.length <= 160 ? t : t.slice(0, 159) + "…";
}
