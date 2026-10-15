/** Static security audit of the source code. It cannot prove the app is secure, but it fails if a new page, action or route forgets a lock. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(__dirname, "..");
const src = join(root, "src");
const walk = (d: string, out: string[] = []): string[] => { for (const n of readdirSync(d)) { if (n === "vendor") continue; const p = join(d, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = walk(src).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => relative(root, f).split("\\").join("/");
const read = (f: string) => readFileSync(f, "utf8");

/** Calls that prove the code checked who is asking. */
const GATE = /(businessContext\(|requireAdmin\(|supabase\.auth\.getUser\(|verifyPaystackSignature\(|handleWebhook\()/;


/** Local (not exported) helper functions in a file that, directly or through another helper, check who is calling. */
function gatedLocals(code: string): Set<string> {
  const bodies = new Map<string, string>();
  for (const part of code.split(/\n(?=(?:async )?function |const \w+ = (?:async )?\()/)) {
    const m = /^(?:async )?function (\w+)|^const (\w+) = (?:async )?\(/.exec(part);
    if (m && !/^export/.test(part)) bodies.set((m[1] ?? m[2])!, part);
  }
  const ok = new Set<string>();
  for (let changed = true; changed;) { changed = false; for (const [n, b] of bodies) if (!ok.has(n) && (GATE.test(b) || callsGated(b, ok))) { ok.add(n); changed = true; } }
  return ok;
}
const callsGated = (code: string, names: Set<string>) => [...names].some((n) => new RegExp(`\\b${n}\\(`).test(code));

test("every page under /app checks the signed-in user itself (the middleware is not the only lock)", () => {
  const pages = files.filter((f) => /src\/app\/app\/.*page\.tsx$/.test(f.split("\\").join("/")));
  assert.ok(pages.length >= 15);
  // Admin pages are covered by their layout AND call requireAdmin themselves.
  for (const f of pages) assert.match(read(f), GATE, `${rel(f)} has no sign-in check`);
});
test("every route handler checks who is calling, or verifies a signature", () => {
  const routes = files.filter((f) => /route\.ts$/.test(f));
  assert.ok(routes.length >= 6);
  for (const f of routes) {
    const s = read(f);
    if (/auth\/confirm/.test(rel(f))) { assert.match(s, /verifyOtp|exchangeCodeForSession/, rel(f)); continue; } // the e-mail link IS the credential
    assert.match(s, GATE, `${rel(f)} has no sign-in or signature check`);
  }
});
test("every exported Server Action checks who is calling", () => {
  const actionFiles = files.filter((f) => /^\s*["']use server["']/.test(read(f)));
  assert.ok(actionFiles.length >= 8, "found the action files");
  // Public sign-in screens are allowed to call actions without a session; they hold no private data.
  const PUBLIC = /(login|register|forgot-password|reset-password)\/actions\.ts$/;
  let total = 0;
  for (const f of actionFiles) {
    const s = read(f);
    const parts = s.split(/\n(?=export (?:async )?function )/).slice(1);
    for (const part of parts) {
      total++;
      const name = /export (?:async )?function (\w+)/.exec(part)![1];
      if (PUBLIC.test(f.split("\\").join("/")) || name === "signOut") continue; // signing out needs no session
      assert.ok(GATE.test(part) || callsGated(part, gatedLocals(s)), `${rel(f)}: action "${name}" has no sign-in check`);
    }
  }
  assert.ok(total >= 20, `checked ${total} actions`);
});
test("admin actions and pages require an admin, not just a signed-in user", () => {
  for (const f of files.filter((f) => /src\/app\/app\/admin\//.test(f.split("\\").join("/")) && /(page\.tsx|actions\.ts|layout\.tsx)$/.test(f))) assert.match(read(f), /requireAdmin\(/, rel(f));
});
test("no HTML injection or dynamic code anywhere in the source", () => {
  for (const f of files) {
    const s = read(f);
    assert.ok(!/dangerouslySetInnerHTML/.test(s), `${rel(f)} uses dangerouslySetInnerHTML`);
    assert.ok(!/\beval\s*\(|new Function\s*\(|\.innerHTML\s*=|document\.write\s*\(/.test(s), `${rel(f)} builds code or HTML from strings`);
  }
});
test("secrets and personal data are never logged", () => {
  for (const f of files) {
    for (const line of read(f).split("\n")) if (/console\.(log|info|warn|error|debug)\(/.test(line)) assert.ok(!/(secret|key|token|password|email|authorization|signature)/i.test(line), `${rel(f)} logs something sensitive: ${line.trim()}`);
  }
});
test("environment variables are read only by an approved list of files", () => {
  const OK = ["src/lib/config/env.ts", "src/lib/supabase/admin.ts", "src/lib/payments/load-price.ts", "src/app/api/paystack/webhook/route.ts", "src/app/billing/callback/route.ts", "src/app/ad-for.tsx", "src/app/app/billing/actions.ts", "src/lib/supabase/middleware.ts"];
  for (const f of files) { if (!/process\.env/.test(read(f))) continue; assert.ok(OK.includes(rel(f)) || /^src\/lib\/config\//.test(rel(f)), `${rel(f)} reads process.env but is not on the approved list`); }
});
test("only the three public variables may reach the browser, and no secret has a NEXT_PUBLIC_ name", () => {
  const names = new Set<string>();
  for (const f of [...files, join(root, ".env.example"), join(root, "next.config.mjs")]) for (const m of readFileSync(f, "utf8").matchAll(/NEXT_PUBLIC_[A-Z0-9_]*[A-Z0-9]/g)) names.add(m[0]);
  assert.deepEqual([...names].sort(), ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
});
test("client components never import server-only modules or the admin database client", () => {
  for (const f of files) {
    const s = read(f);
    if (!/^\s*["']use client["']/.test(s)) continue;
    assert.ok(!/(supabase\/admin|supabase\/server|server\/|payments\/paystack-client|config\/paystack)/.test(s.replace(/\/\/.*$/gm, "")), `${rel(f)} is a client component importing server code`);
  }
});
test("server-only modules that hold secrets or run with extra power import server-only", () => {
  for (const f of ["src/lib/supabase/admin.ts", "src/lib/supabase/server.ts", "src/lib/server/admin.ts", "src/lib/server/context.ts", "src/lib/payments/load-price.ts"]) assert.match(read(join(root, f)), /import "server-only"/, f);
});
test("redirects after sign-in go through safeNext, never straight from the URL", () => {
  for (const f of files) {
    const s = read(f);
    assert.ok(!/redirect\(\s*(?:searchParams|request\.nextUrl|formData\.get\(["']next)/.test(s), `${rel(f)} redirects to a value taken from the request`);
    if (/searchParams\.get\(["']next["']\)/.test(s)) assert.match(s, /safeNext\(/, `${rel(f)} reads ?next= without safeNext`);
  }
});
test("payment-related pages and actions refuse to run when payments are off or the price is missing", () => {
  const a = read(join(src, "app/app/billing/actions.ts"));
  assert.match(a, /if \(!cfg\) redirect/); assert.match(a, /if \(!price\) redirect/); assert.match(a, /planMatchesPrice/);
});
test("exports and downloads are not cached and cannot be sniffed", () => {
  const dl = read(join(src, "lib/server/download.ts"));
  assert.match(dl, /no-store/); assert.match(dl, /nosniff/);
});
test("dependency list is small and exactly the reviewed one", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["@supabase/ssr", "@supabase/supabase-js", "next", "react", "react-dom", "server-only"]);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ["@types/node", "@types/react", "@types/react-dom", "tsx", "typescript"]);
});
test("no migration disables row-level security, drops a table, or grants write access to anon", () => {
  const dir = join(root, "supabase/migrations");
  for (const n of readdirSync(dir)) { const s = readFileSync(join(dir, n), "utf8"); assert.ok(!/disable row level security/i.test(s), n); assert.ok(!/drop table/i.test(s), n); assert.ok(!/grant\s+(insert|update|delete|all)[^;]*\bto\b[^;]*\banon\b/i.test(s), n); }
});
