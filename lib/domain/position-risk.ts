import { minor, nonNegative, type MinorUnits } from "./money.ts";

const VOLUME_UNITS_PER_LOT = 10_000n;

export type PositionRiskInput = {
  direction: "buy" | "sell";
  currentPricePoints: string;
  stopLossPricePoints: string | null;
  tickSizePoints: string;
  tickValueLossMinorPerLot: string;
  volumeUnits: string;
};

export function calculatePositionRisk(input: PositionRiskInput): MinorUnits | null {
  if (input.stopLossPricePoints === null) return null;
  const current = minor(input.currentPricePoints);
  const stop = minor(input.stopLossPricePoints);
  const tickSize = minor(input.tickSizePoints);
  const tickValue = minor(input.tickValueLossMinorPerLot);
  const volume = minor(input.volumeUnits);
  if (tickSize <= 0n) throw new Error("Tick size must be positive.");
  if (tickValue <= 0n) throw new Error("Tick value must be positive.");
  if (volume < 0n) throw new Error("Volume cannot be negative.");

  const adverseDistance = input.direction === "buy" ? current - stop : stop - current;
  const adverseTicks = divideRoundUp(nonNegative(adverseDistance), tickSize);
  return divideRoundUp(adverseTicks * tickValue * volume, VOLUME_UNITS_PER_LOT);
}

function divideRoundUp(value: bigint, divisor: bigint): bigint {
  if (value === 0n) return 0n;
  return (value + divisor - 1n) / divisor;
}
