import test from "node:test";
import assert from "node:assert/strict";
import { readPublicEnv, adsensePublisherId, EnvError } from "../src/lib/config/env";

const good = { NEXT_PUBLIC_APP_URL: "http://localhost:3000/", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k".repeat(30) };
test("accepts a valid configuration and strips trailing slashes", () => { const e = readPublicEnv(good); assert.equal(e.appUrl, "http://localhost:3000"); });
test("missing variables are all reported by NAME", () => {
  try { readPublicEnv({}); assert.fail("should throw"); } catch (err) {
    assert.ok(err instanceof EnvError);
    for (const n of ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) assert.match(err.message, new RegExp(n));
  }
});
test("placeholders from .env.example are rejected", () => {
  assert.throws(() => readPublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co" }), EnvError);
  assert.throws(() => readPublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-or-publishable-key" }), EnvError);
});
test("production app URL must be https; http only for localhost", () => {
  assert.throws(() => readPublicEnv({ ...good, NEXT_PUBLIC_APP_URL: "http://example.com" }), EnvError);
  assert.doesNotThrow(() => readPublicEnv({ ...good, NEXT_PUBLIC_APP_URL: "https://unaabzcalc.example" }));
});
test("error messages never contain secret values", () => {
  const secret = "SUPER-SECRET-KEY-VALUE-123";
  try { readPublicEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "ftp://" + secret }); assert.fail("should throw"); } catch (err) { assert.ok(!(err as Error).message.includes(secret)); }
});
test("AdSense: off unless a correctly formatted publisher id is supplied", () => {
  assert.equal(adsensePublisherId({}), null);
  assert.equal(adsensePublisherId({ ADSENSE_PUBLISHER_ID: "" }), null);
  assert.equal(adsensePublisherId({ ADSENSE_PUBLISHER_ID: "ca-pub-123" }), null);
  assert.equal(adsensePublisherId({ ADSENSE_PUBLISHER_ID: "placeholder" }), null);
  assert.equal(adsensePublisherId({ ADSENSE_PUBLISHER_ID: "ca-pub-1234567890123456" }), "ca-pub-1234567890123456");
});
