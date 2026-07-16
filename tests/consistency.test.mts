import assert from "node:assert/strict";
import test from "node:test";
import { calculateConsistency } from "../lib/domain/consistency.ts";

test("calculates best-day, profitable-day, trade-count, and lot consistency metrics", () => {
  const result = calculateConsistency([
    { positionTicket: "1", entryType: 1, volumeUnits: "100000", profitMinor: "50000", commissionMinor: "-1000", swapMinor: "0", feeMinor: "0", occurredAt: "2026-07-15T10:00:00Z" },
    { positionTicket: "2", entryType: 1, volumeUnits: "200000", profitMinor: "30000", commissionMinor: "-1000", swapMinor: "-500", feeMinor: "0", occurredAt: "2026-07-16T10:00:00Z" },
    { positionTicket: "3", entryType: 1, volumeUnits: "100000", profitMinor: "-10000", commissionMinor: "-1000", swapMinor: "0", feeMinor: "0", occurredAt: "2026-07-16T12:00:00Z" },
  ]);
  assert.equal(result.totalNetProfitMinor, 66500n);
  assert.equal(result.bestDayProfitMinor, 49000n);
  assert.equal(result.bestDayShareBps, 7368);
  assert.equal(result.profitableDayCount, 2);
  assert.equal(result.tradingDayCount, 2);
  assert.equal(result.closedTradeCount, 3);
  assert.equal(result.averageClosedVolumeUnits, 133333n);
  assert.equal(result.largestToAverageVolumeBps, 15000);
  assert.equal(result.riskConsistencyStatus, "unknown");
});
