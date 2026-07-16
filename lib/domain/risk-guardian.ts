import { basisPointsOf, maximum, minimum, minor, nonNegative, type MinorUnits } from "./money.ts";

export const RISK_ENGINE_VERSION = "1.0.0";
export const RISK_EXPLANATION_VERSION = "1.0";

export type GuardianStatus = "healthy" | "caution" | "critical" | "breached";
export type BreachBasis = "balance" | "equity" | "balance-or-equity";
export type HighWaterBasis = "balance" | "equity";
export type TrailingCadence = "intraday" | "end-of-day";

export type DailyGuardianRule = {
  limitBps: number;
  reference: "start-of-day-balance" | "start-of-day-equity" | "higher-start-of-day";
  breachBasis: BreachBasis;
};

export type TotalGuardianRule = {
  limitBps: number;
  model: "static" | "trailing" | "hybrid";
  breachBasis: BreachBasis;
  trailingBasis?: HighWaterBasis;
  cadence?: TrailingCadence;
  lockAtInitialBalance?: boolean;
  staticLimitBps?: number;
};

export type GuardianState = {
  resetKey: string;
  initialBalanceMinor: string;
  startOfDayBalanceMinor: string;
  startOfDayEquityMinor: string;
  highestBalanceMinor: string;
  highestEquityMinor: string;
  endOfDayHighestBalanceMinor: string;
  endOfDayHighestEquityMinor: string;
  latestBalanceMinor: string;
  latestEquityMinor: string;
};

export type GuardianSnapshot = {
  balanceMinor: string;
  equityMinor: string;
  serverTime: string;
};

export type GuardianInput = {
  state: GuardianState;
  currentBalanceMinor: string;
  currentEquityMinor: string;
  dailyRule: DailyGuardianRule | null;
  totalRule: TotalGuardianRule;
  allStopsAdditionalLossMinor?: string | null;
  gapReserveMinor?: string;
  withdrawalMinor?: string | null;
};

export type GuardianScenario = {
  availability: "calculated" | "unknown" | "not-requested";
  projectedBalanceMinor: MinorUnits | null;
  projectedEquityMinor: MinorUnits | null;
  remainingDailyBufferMinor: MinorUnits | null;
  remainingTotalBufferMinor: MinorUnits | null;
  breached: boolean | null;
  reason: string;
};

export type GuardianResult = {
  dailyFloorMinor: MinorUnits | null;
  staticTotalFloorMinor: MinorUnits;
  trailingTotalFloorMinor: MinorUnits | null;
  effectiveTotalFloorMinor: MinorUnits;
  currentDailyReferenceMinor: MinorUnits | null;
  currentTotalReferenceMinor: MinorUnits;
  remainingDailyBufferMinor: MinorUnits | null;
  remainingTotalBufferMinor: MinorUnits;
  closestBufferMinor: MinorUnits;
  safeAdditionalRiskMinor: MinorUnits;
  status: GuardianStatus;
  scenarios: {
    allStopsReached: GuardianScenario;
    nextReset: GuardianScenario;
    closePositionsNow: GuardianScenario;
    withdrawal: GuardianScenario;
  };
  intermediates: Record<string, string | number | boolean | null>;
  explanations: string[];
};

export function updateGuardianState(previous: GuardianState | null, initialBalanceMinor: string, snapshot: GuardianSnapshot): GuardianState {
  const initial = minor(initialBalanceMinor);
  const balance = minor(snapshot.balanceMinor);
  const equity = minor(snapshot.equityMinor);
  if (initial <= 0n) throw new Error("Initial balance must be positive.");
  const resetKey = brokerResetKey(snapshot.serverTime);
  if (!previous) {
    return stringState({
      resetKey,
      initialBalanceMinor: initial,
      startOfDayBalanceMinor: balance,
      startOfDayEquityMinor: equity,
      highestBalanceMinor: maximum(initial, balance),
      highestEquityMinor: maximum(initial, equity),
      endOfDayHighestBalanceMinor: initial,
      endOfDayHighestEquityMinor: initial,
      latestBalanceMinor: balance,
      latestEquityMinor: equity,
    });
  }
  if (minor(previous.initialBalanceMinor) !== initial) throw new Error("Guardian state belongs to a different initial balance.");
  const rolledOver = previous.resetKey !== resetKey;
  return stringState({
    resetKey,
    initialBalanceMinor: initial,
    startOfDayBalanceMinor: rolledOver ? balance : minor(previous.startOfDayBalanceMinor),
    startOfDayEquityMinor: rolledOver ? equity : minor(previous.startOfDayEquityMinor),
    highestBalanceMinor: maximum(minor(previous.highestBalanceMinor), balance),
    highestEquityMinor: maximum(minor(previous.highestEquityMinor), equity),
    endOfDayHighestBalanceMinor: rolledOver
      ? maximum(minor(previous.endOfDayHighestBalanceMinor), minor(previous.latestBalanceMinor))
      : minor(previous.endOfDayHighestBalanceMinor),
    endOfDayHighestEquityMinor: rolledOver
      ? maximum(minor(previous.endOfDayHighestEquityMinor), minor(previous.latestEquityMinor))
      : minor(previous.endOfDayHighestEquityMinor),
    latestBalanceMinor: balance,
    latestEquityMinor: equity,
  });
}

export function calculateGuardian(input: GuardianInput): GuardianResult {
  const initial = minor(input.state.initialBalanceMinor);
  const balance = minor(input.currentBalanceMinor);
  const equity = minor(input.currentEquityMinor);
  const gapReserve = minor(input.gapReserveMinor ?? "0");
  if (initial <= 0n) throw new Error("Initial balance must be positive.");
  if (gapReserve < 0n) throw new Error("Gap reserve cannot be negative.");

  const dailyFloor = input.dailyRule ? dailyFloorFor(input.state, initial, input.dailyRule) : null;
  const staticLimit = input.totalRule.model === "hybrid" ? input.totalRule.staticLimitBps ?? input.totalRule.limitBps : input.totalRule.limitBps;
  const staticFloor = initial - basisPointsOf(initial, staticLimit);
  const trailingReference = trailingReferenceFor(input.state, input.totalRule);
  const trailingFloor = input.totalRule.model === "static" || trailingReference === null
    ? null
    : trailingFloorFor(trailingReference, initial, input.totalRule);
  const effectiveTotalFloor = input.totalRule.model === "static"
    ? staticFloor
    : input.totalRule.model === "hybrid"
      ? maximum(staticFloor, trailingFloor ?? staticFloor)
      : trailingFloor ?? staticFloor;
  const dailyReference = input.dailyRule ? breachValue(balance, equity, input.dailyRule.breachBasis) : null;
  const totalReference = breachValue(balance, equity, input.totalRule.breachBasis);
  const dailyBuffer = dailyFloor === null || dailyReference === null ? null : dailyReference - dailyFloor;
  const totalBuffer = totalReference - effectiveTotalFloor;
  const closestBuffer = dailyBuffer === null ? totalBuffer : minimum(dailyBuffer, totalBuffer);
  const safeAdditionalRisk = nonNegative(closestBuffer - gapReserve);
  const allStops = scenarioFromAdditionalLoss(input, dailyFloor, effectiveTotalFloor, input.allStopsAdditionalLossMinor);
  const nextResetDailyFloor = input.dailyRule ? nextResetFloor(balance, equity, initial, input.dailyRule) : null;
  const nextReset = scenario(balance, equity, nextResetDailyFloor, effectiveTotalFloor, input.dailyRule?.breachBasis ?? "equity", input.totalRule.breachBasis, "First-snapshot projection for the next broker reset.");
  const closePositions = scenario(equity, equity, dailyFloor, effectiveTotalFloor, input.dailyRule?.breachBasis ?? "equity", input.totalRule.breachBasis, "Closing positions converts current equity into balance before costs or slippage.");
  const withdrawal = withdrawalScenario(input, dailyFloor, effectiveTotalFloor);

  return {
    dailyFloorMinor: dailyFloor,
    staticTotalFloorMinor: staticFloor,
    trailingTotalFloorMinor: trailingFloor,
    effectiveTotalFloorMinor: effectiveTotalFloor,
    currentDailyReferenceMinor: dailyReference,
    currentTotalReferenceMinor: totalReference,
    remainingDailyBufferMinor: dailyBuffer,
    remainingTotalBufferMinor: totalBuffer,
    closestBufferMinor: closestBuffer,
    safeAdditionalRiskMinor: safeAdditionalRisk,
    status: classifyStatus(closestBuffer, initial),
    scenarios: { allStopsReached: allStops, nextReset, closePositionsNow: closePositions, withdrawal },
    intermediates: {
      resetKey: input.state.resetKey,
      dailyLimitBps: input.dailyRule?.limitBps ?? null,
      totalLimitBps: input.totalRule.limitBps,
      totalModel: input.totalRule.model,
      trailingBasis: input.totalRule.trailingBasis ?? null,
      trailingCadence: input.totalRule.cadence ?? null,
      trailingReferenceMinor: trailingReference?.toString() ?? null,
      lockAtInitialBalance: Boolean(input.totalRule.lockAtInitialBalance),
      gapReserveMinor: gapReserve.toString(),
    },
    explanations: [
      input.dailyRule ? `Daily floor uses ${input.dailyRule.reference} and the broker reset key ${input.state.resetKey}.` : "This profile has no daily-loss rule.",
      totalExplanation(input.totalRule),
      "A buffer at or below zero is classified as breached. Unknown scenario inputs remain explicitly unknown.",
    ],
  };
}

export function guardianResultJson(result: GuardianResult): Record<string, unknown> {
  return JSON.parse(JSON.stringify(result, (_key, value) => typeof value === "bigint" ? value.toString() : value)) as Record<string, unknown>;
}

export function brokerResetKey(serverTime: string): string {
  const match = /^(\d{4})[.-](\d{2})[.-](\d{2})(?:[ T]|$)/.exec(serverTime.trim());
  if (!match) throw new Error("Broker server time must begin with YYYY.MM.DD or YYYY-MM-DD.");
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function dailyFloorFor(state: GuardianState, initial: MinorUnits, rule: DailyGuardianRule): MinorUnits {
  const startBalance = minor(state.startOfDayBalanceMinor);
  const startEquity = minor(state.startOfDayEquityMinor);
  const reference = rule.reference === "start-of-day-balance"
    ? startBalance
    : rule.reference === "start-of-day-equity"
      ? startEquity
      : maximum(startBalance, startEquity);
  return reference - basisPointsOf(initial, rule.limitBps);
}

function nextResetFloor(balance: MinorUnits, equity: MinorUnits, initial: MinorUnits, rule: DailyGuardianRule): MinorUnits {
  const reference = rule.reference === "start-of-day-balance" ? balance : rule.reference === "start-of-day-equity" ? equity : maximum(balance, equity);
  return reference - basisPointsOf(initial, rule.limitBps);
}

function trailingReferenceFor(state: GuardianState, rule: TotalGuardianRule): MinorUnits | null {
  if (rule.model === "static") return null;
  const basis = rule.trailingBasis ?? "equity";
  const cadence = rule.cadence ?? "intraday";
  if (cadence === "end-of-day") return minor(basis === "balance" ? state.endOfDayHighestBalanceMinor : state.endOfDayHighestEquityMinor);
  return minor(basis === "balance" ? state.highestBalanceMinor : state.highestEquityMinor);
}

function trailingFloorFor(reference: MinorUnits, initial: MinorUnits, rule: TotalGuardianRule): MinorUnits {
  const floor = reference - basisPointsOf(initial, rule.limitBps);
  return rule.lockAtInitialBalance ? minimum(floor, initial) : floor;
}

function breachValue(balance: MinorUnits, equity: MinorUnits, basis: BreachBasis): MinorUnits {
  if (basis === "balance") return balance;
  if (basis === "equity") return equity;
  return minimum(balance, equity);
}

function scenarioFromAdditionalLoss(input: GuardianInput, dailyFloor: MinorUnits | null, totalFloor: MinorUnits, lossValue: string | null | undefined): GuardianScenario {
  if (lossValue == null) return { availability: "unknown", projectedBalanceMinor: null, projectedEquityMinor: null, remainingDailyBufferMinor: null, remainingTotalBufferMinor: null, breached: null, reason: "Not calculated because one or more open positions lacks a stop or broker contract metadata." };
  const loss = minor(lossValue);
  if (loss < 0n) throw new Error("All-stops additional loss cannot be negative.");
  return scenario(minor(input.currentBalanceMinor), minor(input.currentEquityMinor) - loss, dailyFloor, totalFloor, input.dailyRule?.breachBasis ?? "equity", input.totalRule.breachBasis, "Projects every known stop-loss being reached without inventing gap slippage.");
}

function withdrawalScenario(input: GuardianInput, dailyFloor: MinorUnits | null, totalFloor: MinorUnits): GuardianScenario {
  if (input.withdrawalMinor == null) return { availability: "not-requested", projectedBalanceMinor: null, projectedEquityMinor: null, remainingDailyBufferMinor: null, remainingTotalBufferMinor: null, breached: null, reason: "Provide a withdrawal amount to calculate this scenario." };
  const withdrawal = minor(input.withdrawalMinor);
  if (withdrawal < 0n) throw new Error("Withdrawal cannot be negative.");
  return scenario(minor(input.currentBalanceMinor) - withdrawal, minor(input.currentEquityMinor) - withdrawal, dailyFloor, totalFloor, input.dailyRule?.breachBasis ?? "equity", input.totalRule.breachBasis, "Withdrawal projection keeps historical loss floors unchanged unless the sourced rule explicitly resets them.");
}

function scenario(balance: MinorUnits, equity: MinorUnits, dailyFloor: MinorUnits | null, totalFloor: MinorUnits, dailyBasis: BreachBasis, totalBasis: BreachBasis, reason: string): GuardianScenario {
  const dailyBuffer = dailyFloor === null ? null : breachValue(balance, equity, dailyBasis) - dailyFloor;
  const totalBuffer = breachValue(balance, equity, totalBasis) - totalFloor;
  return {
    availability: "calculated",
    projectedBalanceMinor: balance,
    projectedEquityMinor: equity,
    remainingDailyBufferMinor: dailyBuffer,
    remainingTotalBufferMinor: totalBuffer,
    breached: totalBuffer <= 0n || (dailyBuffer !== null && dailyBuffer <= 0n),
    reason,
  };
}

function classifyStatus(buffer: MinorUnits, initial: MinorUnits): GuardianStatus {
  if (buffer <= 0n) return "breached";
  const bps = (buffer * 10_000n) / initial;
  if (bps <= 25n) return "critical";
  if (bps <= 75n) return "caution";
  return "healthy";
}

function totalExplanation(rule: TotalGuardianRule): string {
  if (rule.model === "static") return "Total loss uses a static floor below the initial balance.";
  const lock = rule.lockAtInitialBalance ? " and locks at the initial balance" : " throughout the account lifetime";
  return `${rule.model === "hybrid" ? "Hybrid loss uses the stricter static and trailing floors" : "Total loss uses a trailing floor"} based on ${rule.cadence ?? "intraday"} ${rule.trailingBasis ?? "equity"}${lock}.`;
}

function stringState(value: { resetKey: string } & Record<Exclude<keyof GuardianState, "resetKey">, MinorUnits>): GuardianState {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === "bigint" ? item.toString() : item])) as GuardianState;
}
