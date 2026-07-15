import { minor, nonNegative, type MinorUnits } from "./money.ts";

export type PositionRiskInput = {
  direction: "buy" | "sell";
  entryPricePoints: string;
  stopLossPricePoints: string | null;
  valuePerPointMinor: string;
  volumeUnits: string;
};

export function calculatePositionRisk(input: PositionRiskInput): MinorUnits | null {
  if (input.stopLossPricePoints === null) return null;
  const entry = minor(input.entryPricePoints);
  const stop = minor(input.stopLossPricePoints);
  const valuePerPoint = minor(input.valuePerPointMinor);
  const volume = minor(input.volumeUnits);
  const adverseDistance = input.direction === "buy" ? entry - stop : stop - entry;
  return nonNegative(adverseDistance) * valuePerPoint * volume;
}
