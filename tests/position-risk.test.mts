import assert from "node:assert/strict";
import test from "node:test";
import { calculatePositionRisk } from "../lib/domain/position-risk.ts";

test("calculates additional loss from current price to stop using broker tick metadata", () => {
  assert.equal(calculatePositionRisk({
    direction: "buy",
    currentPricePoints: "110000",
    stopLossPricePoints: "109500",
    tickSizePoints: "1",
    tickValueLossMinorPerLot: "100",
    volumeUnits: "10000",
  }), 50_000n);

  assert.equal(calculatePositionRisk({
    direction: "sell",
    currentPricePoints: "110000",
    stopLossPricePoints: "110500",
    tickSizePoints: "1",
    tickValueLossMinorPerLot: "100",
    volumeUnits: "4000",
  }), 20_000n);
});

test("rounds fractional ticks and minor units conservatively", () => {
  assert.equal(calculatePositionRisk({
    direction: "buy",
    currentPricePoints: "100",
    stopLossPricePoints: "88",
    tickSizePoints: "5",
    tickValueLossMinorPerLot: "125",
    volumeUnits: "5000",
  }), 188n);
});

test("returns unknown without a stop and zero when the stop cannot add loss", () => {
  assert.equal(calculatePositionRisk({
    direction: "buy",
    currentPricePoints: "100",
    stopLossPricePoints: null,
    tickSizePoints: "1",
    tickValueLossMinorPerLot: "100",
    volumeUnits: "10000",
  }), null);
  assert.equal(calculatePositionRisk({
    direction: "buy",
    currentPricePoints: "100",
    stopLossPricePoints: "105",
    tickSizePoints: "1",
    tickValueLossMinorPerLot: "100",
    volumeUnits: "10000",
  }), 0n);
});

test("rejects invalid contract metadata", () => {
  assert.throws(() => calculatePositionRisk({
    direction: "buy",
    currentPricePoints: "100",
    stopLossPricePoints: "90",
    tickSizePoints: "0",
    tickValueLossMinorPerLot: "100",
    volumeUnits: "10000",
  }), /tick size/i);
  assert.throws(() => calculatePositionRisk({
    direction: "buy",
    currentPricePoints: "100",
    stopLossPricePoints: "90",
    tickSizePoints: "1",
    tickValueLossMinorPerLot: "0",
    volumeUnits: "10000",
  }), /tick value/i);
});
