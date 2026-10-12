/**
 * Renders the REAL page components to static HTML using fake data (no Next.js, no Supabase), then (render-check.py) opens them in a real
 * browser at six widths. It finds crashes and layout problems; it does NOT test sign-in, forms being submitted, or anything that needs a server.
 * Usage:  NODE_PATH=/opt/npm-tools/node_modules npx tsx --tsconfig scripts/render/tsconfig.json scripts/render/render-pages.ts <outdir>
 */
import * as fs from "node:fs";
import * as path from "node:path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./hooks.cjs");
import { renderToStaticMarkup } from "react-dom/server";
import { IDS, adminRpc, baseTables, entitlement, premiumEnt } from "./fixtures";

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "demo-anon-key";
const g = globalThis as unknown as { __DB: unknown };
const out = process.argv[2] ?? "/tmp/rendered";
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(__dirname, "..", "..");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

type Scenario = { name: string; file: string; params?: Record<string, string>; sp?: Record<string, string>; admin?: boolean; premium?: boolean; env?: Record<string, string>; layouts?: string[]; expect?: "redirect" | "notFound" };
const B = `src/app/app/b/[id]`;
const S: Scenario[] = [
  { name: "home", file: "src/app/page.tsx" },
  { name: "pricing", file: "src/app/pricing/page.tsx" },
  { name: "login", file: "src/app/login/page.tsx" },
  { name: "register", file: "src/app/register/page.tsx" },
  { name: "forgot-password", file: "src/app/forgot-password/page.tsx" },
  { name: "reset-password", file: "src/app/reset-password/page.tsx" },
  { name: "workspace-free", file: "src/app/app/page.tsx" },
  { name: "workspace-admin", file: "src/app/app/page.tsx", admin: true, premium: true },
  { name: "upgrade", file: "src/app/app/upgrade/page.tsx", env: { PAYSTACK_SECRET_KEY: "sk_test_demoDEMOdemo1234", PAYSTACK_PLAN_CODE: "PLN_demo123456" } },
  { name: "upgrade-payments-off", file: "src/app/app/upgrade/page.tsx" },
  { name: "billing-premium", file: "src/app/app/billing/page.tsx", premium: true, env: { PAYSTACK_SECRET_KEY: "sk_test_demoDEMOdemo1234", PAYSTACK_PLAN_CODE: "PLN_demo123456" } },
  { name: "business-home-free", file: `${B}/page.tsx`, params: { id: IDS.BID }, env: { ADSENSE_PUBLISHER_ID: "ca-pub-1234567890123456", ADSENSE_SLOT_ID: "1234567890" } },
  { name: "business-home-premium", file: `${B}/page.tsx`, params: { id: IDS.BID }, premium: true },
  { name: "analysis", file: `${B}/analysis/page.tsx`, params: { id: IDS.BID }, premium: true },
  { name: "records", file: `${B}/records/page.tsx`, params: { id: IDS.BID }, premium: true },
  { name: "customers", file: `${B}/customers/page.tsx`, params: { id: IDS.BID }, premium: true },
  { name: "jobs", file: `${B}/jobs/page.tsx`, params: { id: IDS.BID }, premium: true },
  { name: "products", file: `${B}/products/page.tsx`, params: { id: IDS.BID }, premium: true },
  { name: "calculations", file: `${B}/calculations/page.tsx`, params: { id: IDS.BID }, premium: true },
  { name: "calculations-new", file: `${B}/calculations/new/page.tsx`, params: { id: IDS.BID }, premium: true },
  { name: "calc-new-profit", file: `${B}/calculations/new/[calc]/page.tsx`, params: { id: IDS.BID, calc: "profit" }, premium: true },
  { name: "calc-new-estimator", file: `${B}/calculations/new/[calc]/page.tsx`, params: { id: IDS.BID, calc: "building-estimator" }, premium: true },
  { name: "calc-saved", file: `${B}/calculations/[rid]/page.tsx`, params: { id: IDS.BID, rid: IDS.RID }, premium: true },
  { name: "calc-print", file: `${B}/calculations/[rid]/print/page.tsx`, params: { id: IDS.BID, rid: IDS.RID }, premium: true },
  { name: "admin-home", file: "src/app/app/admin/page.tsx", admin: true, layouts: ["src/app/app/admin/layout.tsx"] },
  { name: "admin-users", file: "src/app/app/admin/users/page.tsx", admin: true, layouts: ["src/app/app/admin/layout.tsx"], sp: { q: "person", filter: "paying" } },
  { name: "admin-user-detail", file: "src/app/app/admin/users/[id]/page.tsx", admin: true, params: { id: "a0000000-0000-4000-8000-000000000000" }, layouts: ["src/app/app/admin/layout.tsx"] },
  { name: "admin-payments", file: "src/app/app/admin/payments/page.tsx", admin: true, layouts: ["src/app/app/admin/layout.tsx"] },
  { name: "admin-webhooks", file: "src/app/app/admin/webhooks/page.tsx", admin: true, layouts: ["src/app/app/admin/layout.tsx"] },
  { name: "admin-as-normal-user", file: "src/app/app/admin/page.tsx", admin: false, layouts: ["src/app/app/admin/layout.tsx"], expect: "notFound" },
];

async function main() {
  const results: { name: string; ok: boolean; note: string }[] = [];
  const rootLayout = (await import(path.join(root, "src/app/layout.tsx"))).default;
  for (const s of S) {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(s.env ?? {})) { saved[k] = process.env[k]; process.env[k] = v; }
    for (const k of ["PAYSTACK_SECRET_KEY", "PAYSTACK_PLAN_CODE", "ADSENSE_PUBLISHER_ID", "ADSENSE_SLOT_ID"]) if (!(s.env && k in s.env)) { saved[k] = process.env[k]; delete process.env[k]; }
    g.__DB = { user: { id: IDS.UID, email: "ada@example.com" }, tables: baseTables(s.premium ? premiumEnt() : entitlement()), rpc: { ...adminRpc, is_admin: !!s.admin } };
    try {
      const mod = await import(path.join(root, s.file));
      let tree = await mod.default({ params: Promise.resolve(s.params ?? {}), searchParams: Promise.resolve(s.sp ?? {}) });
      for (const l of [...(s.layouts ?? [])].reverse()) tree = await (await import(path.join(root, l))).default({ children: tree });
      const html = renderToStaticMarkup(await rootLayout({ children: tree }));
      if (s.expect) { results.push({ name: s.name, ok: false, note: `expected ${s.expect} but it rendered` }); continue; }
      fs.writeFileSync(path.join(out, s.name + ".html"), "<!doctype html>" + html.replace(/<html lang="en">/, `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${s.name}</title><style>${css}</style></head>`));
      results.push({ name: s.name, ok: true, note: `${html.length} bytes` });
    } catch (e) {
      const d = (e as { digest?: string }).digest ?? "";
      if (s.expect === "notFound" && d === "NEXT_NOT_FOUND") results.push({ name: s.name, ok: true, note: "404 as expected" });
      else results.push({ name: s.name, ok: false, note: (d || (e as Error).message || String(e)).split("\n")[0]!.slice(0, 200) });
    }
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name.padEnd(24)} ${r.note}`);
  fs.writeFileSync(path.join(out, "_results.json"), JSON.stringify(results));
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}
main();
