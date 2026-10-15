import { Result, hasControlChars, str } from "./common";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72; // bcrypt (used by Supabase Auth) ignores bytes beyond 72
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(raw: unknown): Result<string> {
  const email = str(raw).trim().toLowerCase();
  if (!email) return { ok: false, errors: { email: "Enter your email address." } };
  if (email.length > 254 || !EMAIL_RE.test(email) || hasControlChars(email)) return { ok: false, errors: { email: "Enter a valid email address." } };
  return { ok: true, value: email };
}
export function validatePassword(raw: unknown): Result<string> {
  const p = str(raw);
  if (p.length < PASSWORD_MIN) return { ok: false, errors: { password: `Use at least ${PASSWORD_MIN} characters.` } };
  if (new TextEncoder().encode(p).length > PASSWORD_MAX) return { ok: false, errors: { password: `Use at most ${PASSWORD_MAX} characters.` } };
  if (p.trim().length === 0) return { ok: false, errors: { password: "Password cannot be only spaces." } };
  return { ok: true, value: p };
}
export interface RegisterInput { email: string; password: string; fullName: string | null }
export function validateRegister(f: { email?: unknown; password?: unknown; fullName?: unknown }): Result<RegisterInput> {
  const errors: Record<string, string> = {};
  const e = validateEmail(f.email); if (!e.ok) Object.assign(errors, e.errors);
  const p = validatePassword(f.password); if (!p.ok) Object.assign(errors, p.errors);
  const name = str(f.fullName).trim();
  if (name && (name.length > 120 || hasControlChars(name))) errors.fullName = "Name must be 120 characters or fewer.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { email: (e as { value: string }).value, password: (p as { value: string }).value, fullName: name || null } };
}
export function validateLogin(f: { email?: unknown; password?: unknown }): Result<{ email: string; password: string }> {
  const e = validateEmail(f.email);
  const p = str(f.password);
  const errors: Record<string, string> = {};
  if (!e.ok) Object.assign(errors, e.errors);
  if (!p) errors.password = "Enter your password.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { email: (e as { value: string }).value, password: p } };
}
