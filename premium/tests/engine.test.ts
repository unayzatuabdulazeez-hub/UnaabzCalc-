import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { engine } from "../src/lib/calc/engine";

const root = join(__dirname, "..");
const freePath = join(root, "..", "free", "calc-engine.js");
const hasFree = existsSync(freePath);

test("vendor engine is byte-identical to free/calc-engine.js (single source of truth)", { skip: !hasFree }, () => {
  assert.ok(readFileSync(freePath).equals(readFileSync(join(root, "src/vendor/calc-engine.js"))));
});
test("Premium sees all 14 Free calculators, all free-access", () => {
  assert.equal(engine.registry.length, 14);
  assert.ok(engine.registry.every((c) => engine.canAccess(c)));
});
test("Handwork calculator and poultry limit are preserved in the shared engine", () => {
  assert.ok(engine.registry.some((c) => /handwork/i.test(c.id)));
  const poultry = engine.registry.find((c) => c.id === "poultry-starter") as { free_limit?: { max: number } } | undefined;
  assert.equal(poultry?.free_limit?.max, 100);
});
test("known results through the typed wrapper", () => {
  assert.equal(engine.percentage("of", 20, 150)["result"], 30);
  const p = engine.profit(800, 1000);
  assert.equal(p.ok, true);
  assert.equal(engine.profit(1000, 800).ok, true);
  assert.equal(engine.percentage("change", 0, 50).ok, false, "division by zero start value is rejected, not computed");
});
test("wrapper results equal the Free engine's results (parity)", { skip: !hasFree }, () => {
  const free = createRequire(__filename)(freePath);
  const cases: [string, unknown[]][] = [
    ["percentage", ["of", 20, 150]], ["percentage", ["change", 100, 125]], ["percentage", ["difference", 50, 100]],
    ["profit", [800, 1000]], ["profit", [1000, 800]], ["profit", [0, 0]],
    ["loan", [{ principal: 500000, rate: 12, term: 12, unit: "months", freq: "monthly" }]],
    ["loan", [{ principal: 500000, rate: 0, term: 12, unit: "months", freq: "monthly" }]],
  ];
  for (const [fn, args] of cases) assert.deepEqual((engine[fn] as (...a: unknown[]) => unknown)(...args), free[fn](...args), `${fn}(${JSON.stringify(args)})`);
});
