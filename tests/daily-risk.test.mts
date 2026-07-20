import assert from "node:assert/strict";
import test from "node:test";
import { brokerSecondsToMidnight, evaluateDailyRisk, freshBrokerResetSeconds, validateDailyRiskPlan, type DailyRiskDeal, type DailyRiskPlan, type DailyRiskPosition } from "../lib/domain/daily-risk.ts";

const plan: DailyRiskPlan = {
  id: "plan_test",
  resetKey: "2026-07-19",
  version: 1,
  riskBudgetMinor: "100000",
  maxRiskPerTradeMinor: "60000",
  maxTrades: 2,
  lossStopMinor: "50000",
  profitLockMinor: "75000",
  preservationMode: "profit-lock",
  profitLockTriggeredAt: null,
  updatedAt: "2026-07-19T10:00:00.000Z",
};

const position: DailyRiskPosition = {
  ticket: "1001",
  symbol: "EURUSD",
  direction: "buy",
  volumeUnits: "10000",
  currentPricePoints: "110000",
  stopLossPricePoints: "109500",
  tickSizePoints: "1",
  tickValueLossMinorPerLot: "100",
};

function evaluate(overrides: Partial<Parameters<typeof evaluateDailyRisk>[0]> = {}) {
  return evaluateDailyRisk({ resetKey: "2026-07-19", observedAt: "2026-07-19T21:40:00.000Z", serverTime: "2026.07.19 23:40:00", snapshotId: "snap_test", equityMinor: "10080000", startOfDayEquityMinor: "10000000", plan, positions: [position], deals: [], ...overrides });
}

test("validates exact daily plan limits", () => {
  assert.doesNotThrow(() => validateDailyRiskPlan(plan));
  assert.throws(() => validateDailyRiskPlan({ ...plan, maxRiskPerTradeMinor: "100001" }), /cannot exceed/i);
  assert.throws(() => validateDailyRiskPlan({ ...plan, riskBudgetMinor: "1.5" }), /minor units/i);
  assert.throws(() => validateDailyRiskPlan({ ...plan, maxTrades: 0 }), /between 1 and 100/i);
});

test("calculates broker reset seconds without using the host timezone", () => {
  assert.equal(brokerSecondsToMidnight("2026.07.19 23:59:59"), 1);
  assert.equal(brokerSecondsToMidnight("2026-07-20T00:00:00"), 86_400);
  assert.equal(brokerSecondsToMidnight("invalid"), null);
  assert.equal(freshBrokerResetSeconds("2026.07.19 23:59:59", "2026-07-19T20:59:58.000Z", Date.parse("2026-07-19T20:59:59.000Z")), null);
  assert.equal(freshBrokerResetSeconds("2026.07.19 12:00:00", "2026-07-19T09:00:00.000Z", Date.parse("2026-07-19T09:00:10.000Z")), 43_190);
  assert.equal(freshBrokerResetSeconds("2026.07.19 12:00:00", "2026-07-19T08:59:00.000Z", Date.parse("2026-07-19T09:00:00.000Z")), null);
});

test("detects missing and moved-away stops without inventing unknown exposure", () => {
  const missing = evaluate({ positions: [{ ...position, stopLossPricePoints: null }] });
  assert.ok(missing.findings.some((item) => item.actionType === "stop.missing"));
  assert.equal(missing.knownRiskMinor, null);
  assert.ok(missing.unavailable.some((item) => item.actionType === "exposure.combined"));
  assert.ok(!missing.evaluatedTypes.includes("exposure.combined"));

  const movedBuy = evaluate({ positions: [{ ...position, previousStopLossPricePoints: "109700" }] });
  assert.ok(movedBuy.findings.some((item) => item.actionType === "stop.moved-away"));
  const movedSell = evaluate({ positions: [{ ...position, direction: "sell", stopLossPricePoints: "110500", previousStopLossPricePoints: "110300" }] });
  assert.ok(movedSell.findings.some((item) => item.actionType === "stop.moved-away"));
  assert.ok(!evaluate({ positions: [{ ...position, previousStopLossPricePoints: "109300" }] }).findings.some((item) => item.actionType === "stop.moved-away"));
});

test("prioritizes plan, exposure, loss-stop, profit-lock, and reset findings", () => {
  const result = evaluate({ equityMinor: "9940000", positions: [{ ...position, volumeUnits: "30000" }] });
  assert.ok(result.findings.some((item) => item.actionType === "exposure.trade-limit"));
  assert.ok(result.findings.some((item) => item.actionType === "exposure.combined"));
  assert.ok(result.findings.some((item) => item.actionType === "plan.loss-stop"));
  assert.ok(result.findings.some((item) => item.actionType === "timing.reset-proximity"));
  assert.ok(result.unavailable.some((item) => item.actionType === "timing.market-close"));

  const profitLock = evaluate();
  assert.ok(profitLock.findings.some((item) => item.actionType === "plan.profit-lock"));
});

test("aggregates partial entry fills and detects lot escalation", () => {
  const deals = [
    deal("d1", "o1", "p1", 0, "4000", "10:00:00"),
    deal("d2", "o1", "p1", 0, "6000", "10:00:01"),
    deal("d3", "o2", "p2", 0, "16000", "11:00:00"),
    deal("d4", "o3", "p3", 0, "1000", "12:00:00"),
  ];
  const result = evaluate({ deals });
  assert.equal(result.tradeCount, 3);
  assert.ok(result.findings.some((item) => item.actionType === "plan.trade-limit"));
  assert.ok(!result.findings.some((item) => item.actionType === "behaviour.lot-escalation"), "only the latest two entries determine current escalation");
  assert.ok(evaluate({ deals: deals.slice(0, 3) }).findings.some((item) => item.actionType === "behaviour.lot-escalation"));
});

test("reports factual rapid and post-loss re-entry patterns", () => {
  const originalEntry = deal("original", "open", "p1", 0, "10000", "09:00:00");
  const partialExit = { ...deal("partial", "close1", "p1", 1, "4000", "09:50:00"), entryType: 1, profitMinor: "-3000" };
  const exit = { ...deal("exit", "close2", "p1", 1, "6000", "10:00:00"), entryType: 1, profitMinor: "-7000" };
  const entry = deal("entry", "reopen", "p2", 0, "10000", "10:05:00");
  assert.ok(!evaluate({ deals: [originalEntry, partialExit, entry] }).findings.some((item) => item.actionType === "behaviour.rapid-reentry"));
  const result = evaluate({ deals: [originalEntry, partialExit, exit, entry] });
  assert.ok(result.findings.some((item) => item.actionType === "behaviour.rapid-reentry"));
  assert.ok(result.findings.some((item) => item.actionType === "behaviour.post-loss-reentry"));
});

function deal(id: string, orderTicket: string, positionTicket: string, entryType: number, volumeUnits: string, time: string): DailyRiskDeal {
  return { id, orderTicket, positionTicket, symbol: "EURUSD", dealType: 0, entryType, volumeUnits, profitMinor: "0", commissionMinor: "0", swapMinor: "0", feeMinor: "0", occurredAt: `2026-07-19T${time}.000Z` };
}
