import assert from "node:assert/strict";
import test from "node:test";
import { calculateDrawdown } from "../lib/domain/drawdown.ts";

test("calculates deterministic daily, maximum, and locked trailing buffers", () => {
  const result = calculateDrawdown({
    initialBalanceMinor: "10000000",
    startOfDayBalanceMinor: "10324000",
    highestBalanceMinor: "10324000",
    currentEquityMinor: "10287000",
    projectedStopEquityMinor: "10209000",
    dailyLossLimitBps: 500,
    maximumLossLimitBps: 1000,
    trailingLossLimitBps: 800,
    trailingMode: "balance-until-initial",
    gapReserveMinor: "40000",
  });
  assert.equal(result.dailyFloorMinor, 9824000n);
  assert.equal(result.maximumLossFloorMinor, 9000000n);
  assert.equal(result.trailingFloorMinor, 9524000n);
  assert.equal(result.effectiveTotalFloorMinor, 9524000n);
  assert.equal(result.remainingDailyBufferMinor, 463000n);
  assert.equal(result.remainingTotalBufferMinor, 763000n);
  assert.equal(result.projectedRemainingBufferMinor, 685000n);
  assert.equal(result.safeAdditionalRiskMinor, 423000n);
  assert.equal(result.status, "healthy");
});

test("locks the trailing floor at initial balance", () => {
  const result = calculateDrawdown({ initialBalanceMinor: "10000000", startOfDayBalanceMinor: "11000000", highestBalanceMinor: "11000000", currentEquityMinor: "10500000", projectedStopEquityMinor: "10300000", dailyLossLimitBps: 500, maximumLossLimitBps: 1000, trailingLossLimitBps: 800, trailingMode: "balance-until-initial" });
  assert.equal(result.trailingFloorMinor, 10000000n);
  assert.equal(result.effectiveTotalFloorMinor, 10000000n);
});

test("marks a zero remaining buffer as breached and never returns negative safe risk", () => {
  const result = calculateDrawdown({ initialBalanceMinor: "10000000", startOfDayBalanceMinor: "10000000", highestBalanceMinor: "10000000", currentEquityMinor: "9500000", projectedStopEquityMinor: "9400000", dailyLossLimitBps: 500, maximumLossLimitBps: 1000, trailingLossLimitBps: 800, trailingMode: "none", gapReserveMinor: "50000" });
  assert.equal(result.remainingDailyBufferMinor, 0n);
  assert.equal(result.safeAdditionalRiskMinor, 0n);
  assert.equal(result.status, "breached");
});
