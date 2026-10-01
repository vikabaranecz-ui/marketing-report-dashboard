import assert from "node:assert/strict";
import test from "node:test";

import { allocateSpendAcrossActiveWindow } from "../src/lib/metrics/spend-allocation.ts";

test("manual source spend is prorated only between first and last acquisition dates", () => {
  const window = { firstDate: "2026-02-19", lastDate: "2026-07-12" };
  const february = allocateSpendAcrossActiveWindow(3993, window, "2026-02-01", "2026-02-28");
  const march = allocateSpendAcrossActiveWindow(3993, window, "2026-03-01", "2026-03-31");
  const before = allocateSpendAcrossActiveWindow(3993, window, "2026-01-01", "2026-01-31");
  const after = allocateSpendAcrossActiveWindow(3993, window, "2026-08-01", "2026-08-31");

  assert.equal(before, 0);
  assert.equal(after, 0);
  assert.ok(february > 0);
  assert.ok(march > february);
});

test("monthly allocations reconcile exactly to the original total", () => {
  const window = { firstDate: "2026-02-19", lastDate: "2026-07-12" };
  const months = [
    ["2026-02-01", "2026-02-28"],
    ["2026-03-01", "2026-03-31"],
    ["2026-04-01", "2026-04-30"],
    ["2026-05-01", "2026-05-31"],
    ["2026-06-01", "2026-06-30"],
    ["2026-07-01", "2026-07-31"],
  ];
  const allocated = months.reduce((sum, [from, to]) => sum + (allocateSpendAcrossActiveWindow(3993, window, from, to) ?? 0), 0);
  assert.ok(Math.abs(allocated - 3993) < 0.000001);
});

test("missing or invalid acquisition windows fail closed", () => {
  assert.equal(allocateSpendAcrossActiveWindow(1525, { firstDate: "", lastDate: "" }, "2026-01-01", "2026-09-30"), null);
});
