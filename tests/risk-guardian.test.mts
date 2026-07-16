import assert from "node:assert/strict";
import test from "node:test";
import { brokerResetKey, calculateGuardian, updateGuardianState } from "../lib/domain/risk-guardian.ts";

const first = updateGuardianState(null, "10000000", { balanceMinor: "10000000", equityMinor: "10000000", serverTime: "2026.07.16 23:58:00" });
const sameDay = updateGuardianState(first, "10000000", { balanceMinor: "10300000", equityMinor: "10400000", serverTime: "2026.07.16 23:59:50" });
const nextDay = updateGuardianState(sameDay, "10000000", { balanceMinor: "10200000", equityMinor: "10150000", serverTime: "2026.07.17 00:00:04" });

test("rolls start-of-day state at broker midnight and preserves intraday and EOD high-watermarks", () => {
  assert.equal(first.resetKey, "2026-07-16");
  assert.equal(sameDay.highestEquityMinor, "10400000");
  assert.equal(nextDay.resetKey, "2026-07-17");
  assert.equal(nextDay.startOfDayBalanceMinor, "10200000");
  assert.equal(nextDay.endOfDayHighestBalanceMinor, "10300000");
  assert.equal(nextDay.endOfDayHighestEquityMinor, "10400000");
});

test("calculates static daily and total buffers plus all-stop and next-reset scenarios", () => {
  const result = calculateGuardian({
    state: nextDay,
    currentBalanceMinor: "10200000",
    currentEquityMinor: "10150000",
    dailyRule: { limitBps: 500, reference: "start-of-day-balance", breachBasis: "equity" },
    totalRule: { limitBps: 1000, model: "static", breachBasis: "balance-or-equity" },
    allStopsAdditionalLossMinor: "250000",
    gapReserveMinor: "50000",
  });
  assert.equal(result.dailyFloorMinor, 9700000n);
  assert.equal(result.effectiveTotalFloorMinor, 9000000n);
  assert.equal(result.remainingDailyBufferMinor, 450000n);
  assert.equal(result.remainingTotalBufferMinor, 1150000n);
  assert.equal(result.safeAdditionalRiskMinor, 400000n);
  assert.equal(result.scenarios.allStopsReached.remainingDailyBufferMinor, 200000n);
  assert.equal(result.scenarios.nextReset.remainingDailyBufferMinor, 450000n);
});

test("supports intraday equity trailing until initial, EOD balance trailing throughout, and hybrid floors", () => {
  const untilInitial = calculateGuardian({ state: sameDay, currentBalanceMinor: "10300000", currentEquityMinor: "10200000", dailyRule: null, totalRule: { limitBps: 600, model: "trailing", breachBasis: "equity", trailingBasis: "equity", cadence: "intraday", lockAtInitialBalance: true }, allStopsAdditionalLossMinor: null });
  assert.equal(untilInitial.trailingTotalFloorMinor, 9800000n);
  assert.equal(untilInitial.scenarios.allStopsReached.availability, "unknown");

  const eodThroughout = calculateGuardian({ state: nextDay, currentBalanceMinor: "10200000", currentEquityMinor: "10150000", dailyRule: null, totalRule: { limitBps: 500, model: "trailing", breachBasis: "balance-or-equity", trailingBasis: "balance", cadence: "end-of-day", lockAtInitialBalance: false } });
  assert.equal(eodThroughout.trailingTotalFloorMinor, 9800000n);

  const hybrid = calculateGuardian({ state: sameDay, currentBalanceMinor: "10300000", currentEquityMinor: "10200000", dailyRule: null, totalRule: { limitBps: 800, staticLimitBps: 1000, model: "hybrid", breachBasis: "equity", trailingBasis: "balance", cadence: "intraday" } });
  assert.equal(hybrid.staticTotalFloorMinor, 9000000n);
  assert.equal(hybrid.trailingTotalFloorMinor, 9500000n);
  assert.equal(hybrid.effectiveTotalFloorMinor, 9500000n);
});

test("projects close and withdrawal effects without mutating historical floors", () => {
  const result = calculateGuardian({ state: nextDay, currentBalanceMinor: "10200000", currentEquityMinor: "10150000", dailyRule: { limitBps: 500, reference: "start-of-day-balance", breachBasis: "equity" }, totalRule: { limitBps: 1000, model: "static", breachBasis: "balance-or-equity" }, withdrawalMinor: "400000" });
  assert.equal(result.scenarios.closePositionsNow.projectedBalanceMinor, 10150000n);
  assert.equal(result.scenarios.withdrawal.projectedBalanceMinor, 9800000n);
  assert.equal(result.scenarios.withdrawal.remainingDailyBufferMinor, 50000n);
});

test("parses broker reset keys without assuming the host timezone", () => {
  assert.equal(brokerResetKey("2026-07-16T23:59:59"), "2026-07-16");
  assert.throws(() => brokerResetKey("16/07/2026 23:59"), /Broker server time/);
});
