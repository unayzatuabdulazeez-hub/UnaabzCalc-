/* TEST HARNESS ONLY: redirect a few framework modules to light stand-ins while rendering pages outside Next.js. */
const Module = require("module");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const orig = Module._resolveFilename;
const stub = (n) => path.join(__dirname, n);
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "server-only") return stub("empty.cjs");
  if (request === "next/link") return stub("link.cjs");
  if (request === "next/navigation") return stub("navigation.cjs");
  if (request === "@supabase/supabase-js" || request === "@supabase/ssr") return stub("empty.cjs");
  if (request === "next/headers") return stub("empty.cjs");
  const r = orig.call(this, request, parent, ...rest);
  if (/src[\\/]lib[\\/]supabase[\\/]server\.ts$/.test(r)) return stub("mock-supabase-server.ts");
  return r;
};
require.extensions[".css"] = function () { /* styles are injected by the renderer */ };
