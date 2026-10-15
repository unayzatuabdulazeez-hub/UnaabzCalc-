import { PHONE_RE, Result, hasControlChars, isUuid, parseMoney, str } from "./common";

export const JOB_STATUSES = ["quote", "in_progress", "completed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const bad = (v: string, max: number, multiline = false) => v.length > max || hasControlChars(multiline ? v.replace(/[\r\n\t]/g, " ") : v);
const finish = <T,>(errors: Record<string, string>, value: T): Result<T> => (Object.keys(errors).length ? { ok: false, errors } : { ok: true, value });

export interface CustomerInput { name: string; phone: string | null; email: string | null; address: string | null; notes: string | null }
export function validateCustomer(f: Record<string, unknown>): Result<CustomerInput> {
  const errors: Record<string, string> = {};
  const name = str(f.name).trim(), phone = str(f.phone).trim(), email = str(f.email).trim().toLowerCase(), address = str(f.address).trim(), notes = str(f.notes).trim();
  if (!name) errors.name = "Enter the customer's name."; else if (bad(name, 120)) errors.name = "Name must be 120 characters or fewer.";
  if (phone && !PHONE_RE.test(phone)) errors.phone = "Enter a valid phone number.";
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) errors.email = "Enter a valid email address.";
  if (address && bad(address, 300, true)) errors.address = "Address must be 300 characters or fewer.";
  if (notes && bad(notes, 1000, true)) errors.notes = "Notes must be 1000 characters or fewer.";
  return finish(errors, { name, phone: phone || null, email: email || null, address: address || null, notes: notes || null });
}

export interface ProductInput { name: string; unit: string | null; cost_price: string | null; selling_price: string | null; notes: string | null }
export function validateProduct(f: Record<string, unknown>): Result<ProductInput> {
  const errors: Record<string, string> = {};
  const name = str(f.name).trim(), unit = str(f.unit).trim(), notes = str(f.notes).trim();
  if (!name) errors.name = "Enter the product name."; else if (bad(name, 120)) errors.name = "Name must be 120 characters or fewer.";
  if (unit && bad(unit, 30)) errors.unit = "Unit must be 30 characters or fewer.";
  if (notes && bad(notes, 1000, true)) errors.notes = "Notes must be 1000 characters or fewer.";
  const cost_price = parseMoney(f.cost_price, "cost_price", "Cost price", errors);
  const selling_price = parseMoney(f.selling_price, "selling_price", "Selling price", errors);
  return finish(errors, { name, unit: unit || null, cost_price, selling_price, notes: notes || null });
}

export interface JobInput { title: string; description: string | null; status: JobStatus; due_date: string | null; agreed_amount: string | null; customer_id: string | null }
export function validateJob(f: Record<string, unknown>): Result<JobInput> {
  const errors: Record<string, string> = {};
  const title = str(f.title).trim(), description = str(f.description).trim(), status = str(f.status).trim() || "quote";
  const due = str(f.due_date).trim(), customer = str(f.customer_id).trim();
  if (!title) errors.title = "Enter a job title."; else if (bad(title, 160)) errors.title = "Title must be 160 characters or fewer.";
  if (description && bad(description, 2000, true)) errors.description = "Description must be 2000 characters or fewer.";
  if (!(JOB_STATUSES as readonly string[]).includes(status)) errors.status = "Choose a valid status.";
  if (due) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(due + "T00:00:00Z") : null;
    if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== due) errors.due_date = "Enter a valid date.";
  }
  if (customer && !isUuid(customer)) errors.customer_id = "Choose a customer from the list.";
  const agreed_amount = parseMoney(f.agreed_amount, "agreed_amount", "Agreed amount", errors);
  return finish(errors, { title, description: description || null, status: status as JobStatus, due_date: due || null, agreed_amount, customer_id: customer || null });
}
