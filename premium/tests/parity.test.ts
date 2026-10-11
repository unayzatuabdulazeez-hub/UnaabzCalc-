import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildParitySql } from "../scripts/gen-parity-sql";

test("committed SQL parity file is up to date with resolveEntitlement() (run `npm run gen:parity` if this fails)", () => {
  const committed = readFileSync(join(__dirname, "../supabase/tests/20_has_premium_parity.sql"), "utf8");
  assert.equal(committed, buildParitySql(new Date()));
});
