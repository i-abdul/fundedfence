import assert from "node:assert/strict";
import test from "node:test";
import { calculateBrokerSessions } from "../lib/domain/broker-sessions.ts";

test("broker sessions derive current state and the next authoritative transition", () => {
  const observedAt = "2026-07-20T10:00:00.000Z";
  const result = calculateBrokerSessions([
    { symbol: "EURUSD", dayOfWeek: 1, fromSeconds: 9 * 3600, toSeconds: 17 * 3600 },
    { symbol: "GBPUSD", dayOfWeek: 1, fromSeconds: 11 * 3600, toSeconds: 18 * 3600 },
  ], "2026.07.20 10:00:00", observedAt, Date.parse(observedAt) + 5_000);

  assert.deepEqual(result, {
    symbols: [
      { symbol: "EURUSD", isOpen: true, nextTransition: { type: "closes", remainingSeconds: 25_195, symbols: ["EURUSD"] } },
      { symbol: "GBPUSD", isOpen: false, nextTransition: { type: "opens", remainingSeconds: 3_595, symbols: ["GBPUSD"] } },
    ],
    nextTransition: { type: "opens", remainingSeconds: 3_595, symbols: ["GBPUSD"] },
  });
  assert.equal(calculateBrokerSessions(
    [{ symbol: "EURUSD", dayOfWeek: 1, fromSeconds: 9 * 3600, toSeconds: 17 * 3600 }],
    "2026.07.24 18:00:00",
    "2026-07-24T18:00:00.000Z",
    Date.parse("2026-07-24T18:00:00.000Z"),
  )?.nextTransition?.remainingSeconds, 226_800);
  assert.deepEqual(calculateBrokerSessions(
    [{ symbol: "XAUUSD", dayOfWeek: 1, fromSeconds: 22 * 3600, toSeconds: 2 * 3600 }],
    "2026.07.20 23:00:00",
    "2026-07-20T23:00:00.000Z",
    Date.parse("2026-07-20T23:00:00.000Z"),
  )?.symbols[0], { symbol: "XAUUSD", isOpen: true, nextTransition: { type: "closes", remainingSeconds: 10_800, symbols: ["XAUUSD"] } });
  assert.equal(calculateBrokerSessions([{ symbol: "EURUSD", dayOfWeek: 1, fromSeconds: 0, toSeconds: 0 }], "2026.07.20 10:00:00", observedAt, Date.parse(observedAt) + 16_000), null);
});
