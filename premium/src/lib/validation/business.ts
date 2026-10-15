import { PHONE_RE, Result, hasControlChars, str } from "./common";

export interface BusinessInput { name: string; business_type: string | null; phone: string | null; address: string | null; currency: string }

export function validateBusiness(f: Record<string, unknown>): Result<BusinessInput> {
  const errors: Record<string, string> = {};
  const name = str(f.name).trim();
  const type = str(f.business_type).trim();
  const phone = str(f.phone).trim();
  const address = str(f.address).trim();
  const currency = (str(f.currency).trim() || "NGN").toUpperCase();
  if (!name) errors.name = "Enter your business name.";
  else if (name.length > 120 || hasControlChars(name)) errors.name = "Business name must be 120 characters or fewer.";
  if (type && (type.length > 80 || hasControlChars(type))) errors.business_type = "Business type must be 80 characters or fewer.";
  if (phone && !PHONE_RE.test(phone)) errors.phone = "Enter a valid phone number.";
  if (address && (address.length > 300 || hasControlChars(address.replace(/\n/g, " ")))) errors.address = "Address must be 300 characters or fewer.";
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = "Use a 3-letter currency code, for example NGN.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, business_type: type || null, phone: phone || null, address: address || null, currency } };
}
