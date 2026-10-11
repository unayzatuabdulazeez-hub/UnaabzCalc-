import test from "node:test";
import assert from "node:assert/strict";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";

const root = join(__dirname, "..");
async function headers(): Promise<Record<string, string>> {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
  const mod = await import(pathToFileURL(join(root, "next.config.mjs")).href);
  const list = await mod.default.headers();
  return Object.fromEntries(list[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]));
}
test("security headers are configured", async () => {
  const h = await headers();
  assert.match(h["Content-Security-Policy"]!, /frame-ancestors 'none'/);
  assert.match(h["Content-Security-Policy"]!, /object-src 'none'/);
  assert.match(h["Content-Security-Policy"]!, /connect-src 'self' https:\/\/abc\.supabase\.co/);
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["X-Frame-Options"], "DENY");
  assert.match(h["Strict-Transport-Security"]!, /max-age=/);
  assert.ok(h["Referrer-Policy"]); assert.ok(h["Permissions-Policy"]);
});
/** The ONLY source files allowed to name the Paystack secret or the service-role key. All run on the server (route handlers, server actions, server-only modules). */
const SERVER_SECRET_FILES = [
  "src/lib/config/paystack.ts", "src/lib/supabase/admin.ts", "src/lib/payments/load-price.ts",
  "src/app/api/paystack/webhook/route.ts", "src/app/billing/callback/route.ts",
];
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { if (n === "node_modules" || n === ".next" || n === "vendor") continue; const p = join(dir, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); }
  return out;
}
test("no secret-looking values or service-role usage in browser-reachable source", () => {
  const files = walk(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    const rel = relative(root, f).split("\\").join("/");
    const mayHoldSecrets = SERVER_SECRET_FILES.includes(rel);
    if (mayHoldSecrets) assert.ok(!/["']use client["']/.test(s), `${rel} is on the server-secret list and must never be a client component`);
    else {
      assert.ok(!/SERVICE_ROLE/.test(s), `${rel} references the service role key but is not on the server-secret list`);
      assert.ok(!/PAYSTACK_SECRET/.test(s), `${rel} references the Paystack secret but is not on the server-secret list`);
    }
    assert.ok(!/sk_(live|test)_[A-Za-z0-9]/.test(s), `${f} contains a Paystack-style secret key`);
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\./.test(s), `${f} contains a JWT-looking value`);
    assert.ok(!/ca-pub-\d{16}/.test(s), `${f} hardcodes an AdSense publisher id`);
  }
});
test(".env.example contains placeholders only and .gitignore protects real env files", () => {
  const ex = readFileSync(join(root, ".env.example"), "utf8");
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(ex)); assert.ok(!/sk_(live|test)_[A-Za-z0-9]{10,}/.test(ex));
  const gi = readFileSync(join(root, "..", ".gitignore"), "utf8");
  assert.match(gi, /^\.env\.\*$/m); assert.match(gi, /^!\.env\.example$/m);
});
test("no migration or source file drops tables or disables RLS", () => {
  const sql = readFileSync(join(root, "supabase/migrations/0001_foundation.sql"), "utf8");
  assert.ok(!/disable row level security/i.test(sql));
  assert.ok(!/drop table/i.test(sql));
  for (const t of ["profiles", "entitlements", "businesses", "admin_users", "audit_log"]) assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
});
