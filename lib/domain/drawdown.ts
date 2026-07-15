import {
  basisPointsOf,
  maximum,
  minimum,
  minor,
  nonNegative,
  type MinorUnits,
} from "./money.ts";

export type RiskStatus = "healthy" | "caution" | "critical" | "breached";
export type TrailingMode = "none" | "balance-until-initial";

export type DrawdownInput = {
  initialBalanceMinor: string;
  startOfDayBalanceMinor: string;
  highestBalanceMinor: string;
  currentEquityMinor: string;
  projectedStopEquityMinor: string;
  dailyLossLimitBps: number;
  maximumLossLimitBps: number;
  trailingLossLimitBps: number;
  trailingMode: TrailingMode;
  gapReserveMinor?: string;
};

export type DrawdownResult = {
  dailyFloorMinor: MinorUnits;
  maximumLossFloorMinor: MinorUnits;
  trailingFloorMinor: MinorUnits | null;
  effectiveTotalFloorMinor: MinorUnits;
  remainingDailyBufferMinor: MinorUnits;
  remainingTotalBufferMinor: MinorUnits;
  projectedRemainingBufferMinor: MinorUnits;
  safeAdditionalRiskMinor: MinorUnits;
  status: RiskStatus;
  explanation: string;
};

export function calculateDrawdown(input: DrawdownInput): DrawdownResult {
  const initial = minor(input.initialBalanceMinor);
  const startOfDay = minor(input.startOfDayBalanceMinor);
  const highestBalance = minor(input.highestBalanceMinor);
  const currentEquity = minor(input.currentEquityMinor);
  const projectedStopEquity = minor(input.projectedStopEquityMinor);
  const gapReserve = minor(input.gapReserveMinor ?? "0");

  if (initial <= 0n) throw new Error("Initial balance must be positive.");
  if (highestBalance < initial) throw new Error("Highest balance cannot be below initial balance.");

  const dailyAllowance = basisPointsOf(initial, input.dailyLossLimitBps);
  const maximumAllowance = basisPointsOf(initial, input.maximumLossLimitBps);
  const trailingAllowance = basisPointsOf(initial, input.trailingLossLimitBps);
  const dailyFloor = startOfDay - dailyAllowance;
  const maximumLossFloor = initial - maximumAllowance;

  let trailingFloor: MinorUnits | null = null;
  if (input.trailingMode === "balance-until-initial") {
    trailingFloor = minimum(highestBalance - trailingAllowance, initial);
  }

  const effectiveTotalFloor = trailingFloor === null
    ? maximumLossFloor
    : maximum(maximumLossFloor, trailingFloor);
  const remainingDailyBuffer = currentEquity - dailyFloor;
  const remainingTotalBuffer = currentEquity - effectiveTotalFloor;
  const projectedRemainingBuffer = projectedStopEquity - effectiveTotalFloor;
  const smallestCurrentBuffer = minimum(remainingDailyBuffer, remainingTotalBuffer);
  const safeAdditionalRisk = nonNegative(smallestCurrentBuffer - gapReserve);
  const status = classifyStatus(smallestCurrentBuffer, initial);

  return {
    dailyFloorMinor: dailyFloor,
    maximumLossFloorMinor: maximumLossFloor,
    trailingFloorMinor: trailingFloor,
    effectiveTotalFloorMinor: effectiveTotalFloor,
    remainingDailyBufferMinor: remainingDailyBuffer,
    remainingTotalBufferMinor: remainingTotalBuffer,
    projectedRemainingBufferMinor: projectedRemainingBuffer,
    safeAdditionalRiskMinor: safeAdditionalRisk,
    status,
    explanation:
      "Daily loss uses the configured start-of-day balance less a fixed allowance based on initial balance. " +
      "The effective total floor is the stricter of maximum loss and the configured balance trail; the trail locks at initial balance.",
  };
}

function classifyStatus(buffer: MinorUnits, initialBalance: MinorUnits): RiskStatus {
  if (buffer <= 0n) return "breached";
  const bufferBps = (buffer * 10_000n) / initialBalance;
  if (bufferBps <= 25n) return "critical";
  if (bufferBps <= 75n) return "caution";
  return "healthy";
}
