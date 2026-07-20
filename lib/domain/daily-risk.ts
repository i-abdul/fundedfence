import { calculatePositionRisk } from "./position-risk.ts";

export const DAILY_RISK_DETECTOR_VERSION = "1.0.0";
export const LOT_ESCALATION_BPS = 15_000n;
export const RAPID_REENTRY_WINDOW_MS = 15 * 60_000;
export const RESET_WARNING_MINUTES = 30;

export function brokerSecondsToMidnight(serverTime: string): number | null {
  const match = /(?:[ T])(\d{2}):(\d{2})(?::(\d{2}))?/.exec(serverTime.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return 86_400 - (hour * 3_600 + minute * 60 + second);
}

export function freshBrokerResetSeconds(serverTime: string, observedAt: string, nowMs: number, maximumAgeSeconds = 15): number | null {
  const resetSeconds = brokerSecondsToMidnight(serverTime);
  const observedMs = Date.parse(observedAt);
  if (resetSeconds === null || !Number.isFinite(observedMs)) return null;
  const ageSeconds = Math.floor((nowMs - observedMs) / 1000);
  if (ageSeconds < 0 || ageSeconds > maximumAgeSeconds || resetSeconds <= ageSeconds) return null;
  return resetSeconds - ageSeconds;
}

export type DailyRiskPlan = {
  id: string;
  resetKey: string;
  version: number;
  riskBudgetMinor: string;
  maxRiskPerTradeMinor: string;
  maxTrades: number;
  lossStopMinor: string;
  profitLockMinor: string;
  preservationMode: "off" | "manual" | "profit-lock";
  profitLockTriggeredAt: string | null;
  updatedAt: string;
};

export type DailyRiskPosition = {
  ticket: string;
  symbol: string;
  direction: "buy" | "sell";
  volumeUnits: string;
  currentPricePoints: string;
  stopLossPricePoints: string | null;
  tickSizePoints: string | null;
  tickValueLossMinorPerLot: string | null;
  previousStopLossPricePoints?: string | null;
};

export type DailyRiskDeal = {
  id: string;
  orderTicket: string;
  positionTicket: string;
  symbol: string;
  dealType: number;
  entryType: number;
  volumeUnits: string;
  profitMinor: string;
  commissionMinor: string;
  swapMinor: string;
  feeMinor: string;
  occurredAt: string;
};

export type RiskFinding = {
  actionType: string;
  subjectKey: string;
  severity: "critical" | "high" | "medium" | "info";
  priority: number;
  title: string;
  evidence: Record<string, string | number | boolean | null>;
};

export type DailyRiskEvaluation = {
  findings: RiskFinding[];
  evaluatedTypes: string[];
  unavailable: Array<{ actionType: string; reason: string }>;
  knownRiskMinor: string | null;
  tradeCount: number;
  dailyPnlMinor: string | null;
};

export function validateDailyRiskPlan(value: Omit<DailyRiskPlan, "id" | "resetKey" | "version" | "profitLockTriggeredAt" | "updatedAt">): void {
  for (const [label, amount] of [
    ["Daily risk budget", value.riskBudgetMinor],
    ["Maximum risk per trade", value.maxRiskPerTradeMinor],
    ["Daily loss stop", value.lossStopMinor],
    ["Profit lock", value.profitLockMinor],
  ] as const) {
    if (!/^\d+$/.test(amount)) throw new Error(`${label} must be a non-negative amount in minor units.`);
  }
  if (BigInt(value.riskBudgetMinor) <= 0n || BigInt(value.maxRiskPerTradeMinor) <= 0n) throw new Error("Risk budget and maximum risk per trade must be positive.");
  if (BigInt(value.maxRiskPerTradeMinor) > BigInt(value.riskBudgetMinor)) throw new Error("Maximum risk per trade cannot exceed the daily risk budget.");
  if (!Number.isInteger(value.maxTrades) || value.maxTrades < 1 || value.maxTrades > 100) throw new Error("Maximum trades must be between 1 and 100.");
  if (!["off", "manual", "profit-lock"].includes(value.preservationMode)) throw new Error("Preservation mode is invalid.");
}

export function evaluateDailyRisk(input: {
  resetKey: string;
  observedAt: string;
  serverTime: string;
  snapshotId: string;
  equityMinor: string;
  startOfDayEquityMinor: string | null;
  plan: DailyRiskPlan | null;
  positions: DailyRiskPosition[];
  deals: DailyRiskDeal[];
}): DailyRiskEvaluation {
  const findings: RiskFinding[] = [];
  const evaluated = new Set<string>();
  const unavailable: DailyRiskEvaluation["unavailable"] = [];
  const evidence = { detectorVersion: DAILY_RISK_DETECTOR_VERSION, resetKey: input.resetKey, snapshotId: input.snapshotId };

  evaluated.add("stop.missing");
  evaluated.add("stop.moved-away");
  for (const position of input.positions) {
    if (position.stopLossPricePoints === null) findings.push(finding("stop.missing", position.ticket, "critical", 10, `${position.symbol} has no stop-loss`, { ...evidence, symbol: position.symbol, ticket: position.ticket }));
    if (position.previousStopLossPricePoints !== undefined && position.previousStopLossPricePoints !== null && position.stopLossPricePoints !== null) {
      const previous = BigInt(position.previousStopLossPricePoints);
      const current = BigInt(position.stopLossPricePoints);
      const movedAway = position.direction === "buy" ? current < previous : current > previous;
      if (movedAway) findings.push(finding("stop.moved-away", position.ticket, "high", 20, `${position.symbol} stop moved away`, { ...evidence, symbol: position.symbol, ticket: position.ticket, direction: position.direction, previousStopPricePoints: previous.toString(), currentStopPricePoints: current.toString() }));
    }
  }

  const positionRisks = input.positions.map((position) => ({ position, risk: riskAtStop(position) }));
  const allRiskKnown = positionRisks.every(({ risk }) => risk !== null);
  const knownRisk = positionRisks.reduce((sum, { risk }) => sum + (risk ?? 0n), 0n);
  if (input.plan) {
    if (allRiskKnown) {
      evaluated.add("exposure.trade-limit");
      for (const { position, risk } of positionRisks) {
        if (risk !== null && risk > BigInt(input.plan.maxRiskPerTradeMinor)) findings.push(finding("exposure.trade-limit", position.ticket, "high", 30, `${position.symbol} exceeds max risk per trade`, { ...evidence, planId: input.plan.id, planVersion: input.plan.version, symbol: position.symbol, ticket: position.ticket, riskMinor: risk.toString(), limitMinor: input.plan.maxRiskPerTradeMinor }));
      }
    } else {
      unavailable.push({ actionType: "exposure.trade-limit", reason: "One or more open positions lacks a stop or broker contract metadata." });
    }
    if (allRiskKnown) {
      evaluated.add("exposure.combined");
      if (knownRisk > BigInt(input.plan.riskBudgetMinor)) findings.push(finding("exposure.combined", "account", "critical", 15, "Combined stop risk exceeds today’s budget", { ...evidence, planId: input.plan.id, planVersion: input.plan.version, riskMinor: knownRisk.toString(), limitMinor: input.plan.riskBudgetMinor, positionCount: input.positions.length }));
    } else unavailable.push({ actionType: "exposure.combined", reason: "One or more open positions lacks a stop or broker contract metadata." });
  } else unavailable.push({ actionType: "plan", reason: "No daily plan is configured for this broker day." });

  const entries = entryOrders(input.deals);
  if (input.plan) {
    evaluated.add("plan.trade-limit");
    if (entries.length > input.plan.maxTrades) findings.push(finding("plan.trade-limit", "account", "high", 35, "Daily trade limit exceeded", { ...evidence, planId: input.plan.id, tradeCount: entries.length, limit: input.plan.maxTrades }));
  }

  let dailyPnl: bigint | null = null;
  if (input.startOfDayEquityMinor !== null) {
    dailyPnl = BigInt(input.equityMinor) - BigInt(input.startOfDayEquityMinor);
    if (input.plan) {
      evaluated.add("plan.loss-stop");
      evaluated.add("plan.profit-lock");
      if (dailyPnl <= -BigInt(input.plan.lossStopMinor) && BigInt(input.plan.lossStopMinor) > 0n) findings.push(finding("plan.loss-stop", "account", "critical", 5, "Manual daily loss stop reached", { ...evidence, planId: input.plan.id, dailyPnlMinor: dailyPnl.toString(), limitMinor: input.plan.lossStopMinor }));
      if (input.plan.preservationMode === "profit-lock" && BigInt(input.plan.profitLockMinor) > 0n && (input.plan.profitLockTriggeredAt !== null || dailyPnl >= BigInt(input.plan.profitLockMinor))) findings.push(finding("plan.profit-lock", "account", "high", 25, "Profit lock preservation mode is active", { ...evidence, planId: input.plan.id, dailyPnlMinor: dailyPnl.toString(), triggerMinor: input.plan.profitLockMinor }));
    }
  } else unavailable.push({ actionType: "plan.pnl", reason: "Start-of-day equity is unavailable." });

  evaluated.add("behaviour.lot-escalation");
  if (entries.length >= 2) {
    const previous = entries.at(-2)!;
    const latest = entries.at(-1)!;
    if (latest.volume * 10_000n > previous.volume * LOT_ESCALATION_BPS) findings.push(finding("behaviour.lot-escalation", latest.orderTicket, "medium", 60, "Latest entry size escalated by more than 50%", { ...evidence, previousOrderTicket: previous.orderTicket, latestOrderTicket: latest.orderTicket, previousVolumeUnits: previous.volume.toString(), latestVolumeUnits: latest.volume.toString(), thresholdBps: Number(LOT_ESCALATION_BPS) }));
  }

  evaluated.add("behaviour.rapid-reentry");
  evaluated.add("behaviour.post-loss-reentry");
  const rapid = latestRapidReentry(input.deals);
  if (rapid) {
    findings.push(finding("behaviour.rapid-reentry", rapid.entry.orderTicket, "medium", 70, `Rapid ${rapid.entry.symbol} re-entry detected`, { ...evidence, symbol: rapid.entry.symbol, exitDealId: rapid.exit.id, entryDealId: rapid.entry.id, elapsedSeconds: rapid.elapsedSeconds }));
    if (rapid.exitNet < 0n) findings.push(finding("behaviour.post-loss-reentry", rapid.entry.orderTicket, "high", 40, `Rapid ${rapid.entry.symbol} re-entry followed a loss`, { ...evidence, symbol: rapid.entry.symbol, exitDealId: rapid.exit.id, entryDealId: rapid.entry.id, exitNetMinor: rapid.exitNet.toString(), elapsedSeconds: rapid.elapsedSeconds }));
  }

  const minutesToReset = brokerMinutesToMidnight(input.serverTime);
  if (minutesToReset === null) unavailable.push({ actionType: "timing.reset-proximity", reason: "Broker server time cannot be parsed." });
  else {
    evaluated.add("timing.reset-proximity");
    if (input.positions.length > 0 && minutesToReset <= RESET_WARNING_MINUTES) findings.push(finding("timing.reset-proximity", "account", "medium", 50, "Open exposure is close to the broker reset", { ...evidence, minutesToReset, openPositionCount: input.positions.length, serverTime: input.serverTime }));
  }

  unavailable.push({ actionType: "timing.market-close", reason: "The connector does not provide authoritative symbol trading-session close times." });
  return { findings, evaluatedTypes: [...evaluated], unavailable, knownRiskMinor: allRiskKnown ? knownRisk.toString() : null, tradeCount: entries.length, dailyPnlMinor: dailyPnl?.toString() ?? null };
}

function finding(actionType: string, subjectKey: string, severity: RiskFinding["severity"], priority: number, title: string, evidence: RiskFinding["evidence"]): RiskFinding {
  return { actionType, subjectKey, severity, priority, title, evidence };
}

function riskAtStop(position: DailyRiskPosition): bigint | null {
  if (position.stopLossPricePoints === null || position.tickSizePoints === null || position.tickValueLossMinorPerLot === null) return null;
  try {
    return calculatePositionRisk({ direction: position.direction, currentPricePoints: position.currentPricePoints, stopLossPricePoints: position.stopLossPricePoints, tickSizePoints: position.tickSizePoints, tickValueLossMinorPerLot: position.tickValueLossMinorPerLot, volumeUnits: position.volumeUnits });
  } catch {
    return null;
  }
}

function entryOrders(deals: DailyRiskDeal[]): Array<{ orderTicket: string; volume: bigint; occurredAt: string }> {
  const orders = new Map<string, { orderTicket: string; volume: bigint; occurredAt: string }>();
  for (const deal of deals) {
    if (![0, 1].includes(deal.dealType) || ![0, 2].includes(deal.entryType)) continue;
    const current = orders.get(deal.orderTicket);
    orders.set(deal.orderTicket, { orderTicket: deal.orderTicket, volume: (current?.volume ?? 0n) + BigInt(deal.volumeUnits), occurredAt: current?.occurredAt ?? deal.occurredAt });
  }
  return [...orders.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function latestRapidReentry(deals: DailyRiskDeal[]): { exit: DailyRiskDeal; entry: DailyRiskDeal; exitNet: bigint; elapsedSeconds: number } | null {
  const sorted = [...deals].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  let latest: { exit: DailyRiskDeal; entry: DailyRiskDeal; exitNet: bigint; elapsedSeconds: number } | null = null;
  const positions = new Map<string, { symbol: string; entryVolume: bigint; exitVolume: bigint; exitNet: bigint; lastExit: DailyRiskDeal | null }>();
  for (const deal of sorted) {
    if (![0, 1].includes(deal.dealType)) continue;
    const position = positions.get(deal.positionTicket) ?? { symbol: deal.symbol, entryVolume: 0n, exitVolume: 0n, exitNet: 0n, lastExit: null };
    if (deal.entryType === 0) position.entryVolume += BigInt(deal.volumeUnits);
    if (deal.entryType === 1) {
      position.exitVolume += BigInt(deal.volumeUnits);
      position.exitNet += BigInt(deal.profitMinor) + BigInt(deal.commissionMinor) + BigInt(deal.swapMinor) + BigInt(deal.feeMinor);
      position.lastExit = deal;
    }
    positions.set(deal.positionTicket, position);
  }
  for (const closed of positions.values()) {
    if (closed.entryVolume === 0n || closed.exitVolume < closed.entryVolume || !closed.lastExit) continue;
    const exit = closed.lastExit;
    for (const entry of sorted) {
      if (entry.entryType !== 0 || entry.positionTicket === exit.positionTicket) continue;
      const elapsed = Date.parse(entry.occurredAt) - Date.parse(exit.occurredAt);
      if (elapsed < 0) continue;
      if (elapsed > RAPID_REENTRY_WINDOW_MS) break;
      if (entry.symbol === exit.symbol && [0, 2].includes(entry.entryType) && [0, 1].includes(entry.dealType)) {
        latest = { exit, entry, exitNet: closed.exitNet, elapsedSeconds: Math.round(elapsed / 1000) };
      }
    }
  }
  return latest;
}

function brokerMinutesToMidnight(serverTime: string): number | null {
  const seconds = brokerSecondsToMidnight(serverTime);
  return seconds === null ? null : Math.ceil(seconds / 60);
}
