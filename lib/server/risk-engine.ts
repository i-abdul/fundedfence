import { canonicalStringify } from "@/lib/domain/connector-protocol";
import { calculateConsistency, consistencyResultJson, type ConsistencyDeal } from "@/lib/domain/consistency";
import { calculatePositionRisk } from "@/lib/domain/position-risk";
import {
  calculateGuardian,
  guardianResultJson,
  RISK_ENGINE_VERSION,
  RISK_EXPLANATION_VERSION,
  updateGuardianState,
  type GuardianInput,
  type GuardianState,
} from "@/lib/domain/risk-guardian";
import { validateRuleDefinition } from "@/lib/domain/rule-profile";
import { sha256Hex, stableId } from "@/lib/server/crypto";
import type { AppDatabase, AppPreparedStatement } from "@/lib/server/database";

type ActiveRuleRow = {
  account_size_minor: string;
  rule_version_id: string | null;
  verification_status: string | null;
  definition_json: string | null;
};

type RiskStateRow = {
  reset_key: string;
  initial_balance_minor: string;
  start_of_day_balance_minor: string;
  start_of_day_equity_minor: string;
  highest_balance_minor: string;
  highest_equity_minor: string;
  end_of_day_highest_balance_minor: string;
  end_of_day_highest_equity_minor: string;
  latest_balance_minor: string;
  latest_equity_minor: string;
  rule_version_id: string;
};

type SnapshotForRisk = {
  balanceMinor: string;
  equityMinor: string;
  serverTime: string;
};

type DealRow = {
  position_ticket: string;
  entry_type: number;
  volume_units: string;
  profit_minor: string;
  commission_minor: string;
  swap_minor: string;
  fee_minor: string;
  occurred_at: string;
};

export type PublicRiskCalculation = {
  id: string;
  ruleVersionId: string;
  status: string;
  engineVersion: string;
  explanationVersion: string;
  calculatedAt: string;
  output: Record<string, unknown>;
  explanations: string[];
};

export async function buildRiskCalculationStatements(database: AppDatabase, input: {
  tradingAccountId: string;
  snapshotId: string;
  snapshot: SnapshotForRisk;
  positions: unknown;
  calculatedAt: string;
}): Promise<AppPreparedStatement[]> {
  const active = await database.prepare("SELECT ta.account_size_minor, ta.rule_version_id, rv.verification_status, rv.definition_json FROM trading_accounts ta LEFT JOIN rule_versions rv ON rv.id = ta.rule_version_id WHERE ta.id = ? LIMIT 1")
    .bind(input.tradingAccountId).first<ActiveRuleRow>();
  if (!active?.rule_version_id || active.verification_status !== "effective" || !active.definition_json) return [];
  const definition = validateRuleDefinition(JSON.parse(active.definition_json));
  const previousRow = await database.prepare("SELECT reset_key, initial_balance_minor, start_of_day_balance_minor, start_of_day_equity_minor, highest_balance_minor, highest_equity_minor, end_of_day_highest_balance_minor, end_of_day_highest_equity_minor, latest_balance_minor, latest_equity_minor, rule_version_id FROM account_risk_states WHERE trading_account_id = ? LIMIT 1")
    .bind(input.tradingAccountId).first<RiskStateRow>();
  const previous = previousRow && previousRow.rule_version_id === active.rule_version_id ? publicState(previousRow) : null;
  const state = updateGuardianState(previous, active.account_size_minor, input.snapshot);
  const allStopsAdditionalLossMinor = allStopsLoss(input.positions);
  const guardianInput: GuardianInput = {
    state,
    currentBalanceMinor: input.snapshot.balanceMinor,
    currentEquityMinor: input.snapshot.equityMinor,
    dailyRule: definition.dailyLoss ? {
      limitBps: definition.dailyLoss.limitBps,
      reference: "start-of-day-balance",
      breachBasis: definition.dailyLoss.breachBasis,
    } : null,
    totalRule: {
      limitBps: definition.maximumLoss.limitBps,
      model: definition.maximumLoss.model === "static" ? "static" : "trailing",
      breachBasis: definition.maximumLoss.breachBasis,
      trailingBasis: definition.maximumLoss.trailingBasis ?? (definition.maximumLoss.breachBasis === "balance-or-equity" ? "balance" : "equity"),
      cadence: definition.maximumLoss.cadence,
      lockAtInitialBalance: definition.maximumLoss.model === "trailing-until-initial",
    },
    allStopsAdditionalLossMinor,
    gapReserveMinor: "0",
  };
  const guardian = calculateGuardian(guardianInput);
  const deals = await database.prepare("SELECT position_ticket, entry_type, volume_units, profit_minor, commission_minor, swap_minor, fee_minor, occurred_at FROM deals WHERE trading_account_id = ? ORDER BY occurred_at ASC LIMIT 5000")
    .bind(input.tradingAccountId).all<DealRow>();
  const consistencyInputs = deals.results.map(publicDeal);
  const consistency = calculateConsistency(consistencyInputs);
  const consistencyInputHash = await sha256Hex(canonicalStringify(consistencyInputs));
  const consistencyReference = {
    dealCount: consistencyInputs.length,
    firstOccurredAt: consistencyInputs[0]?.occurredAt ?? null,
    throughOccurredAt: consistencyInputs.at(-1)?.occurredAt ?? null,
    inputHash: consistencyInputHash,
    source: "normalized-deals",
  };
  const output = { guardian: guardianResultJson(guardian), consistency: consistencyResultJson(consistency) };
  const calculationId = await stableId("riskcalc", `${input.snapshotId}:${active.rule_version_id}:${RISK_ENGINE_VERSION}`);
  const stateCreatedAt = previousRow ? null : input.calculatedAt;
  return [
    database.prepare("INSERT INTO account_risk_states (trading_account_id, rule_version_id, reset_key, initial_balance_minor, start_of_day_balance_minor, start_of_day_equity_minor, highest_balance_minor, highest_equity_minor, end_of_day_highest_balance_minor, end_of_day_highest_equity_minor, latest_balance_minor, latest_equity_minor, last_snapshot_id, state_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(trading_account_id) DO UPDATE SET rule_version_id = excluded.rule_version_id, reset_key = excluded.reset_key, initial_balance_minor = excluded.initial_balance_minor, start_of_day_balance_minor = excluded.start_of_day_balance_minor, start_of_day_equity_minor = excluded.start_of_day_equity_minor, highest_balance_minor = excluded.highest_balance_minor, highest_equity_minor = excluded.highest_equity_minor, end_of_day_highest_balance_minor = excluded.end_of_day_highest_balance_minor, end_of_day_highest_equity_minor = excluded.end_of_day_highest_equity_minor, latest_balance_minor = excluded.latest_balance_minor, latest_equity_minor = excluded.latest_equity_minor, last_snapshot_id = excluded.last_snapshot_id, state_version = account_risk_states.state_version + 1, updated_at = excluded.updated_at")
      .bind(input.tradingAccountId, active.rule_version_id, state.resetKey, state.initialBalanceMinor, state.startOfDayBalanceMinor, state.startOfDayEquityMinor, state.highestBalanceMinor, state.highestEquityMinor, state.endOfDayHighestBalanceMinor, state.endOfDayHighestEquityMinor, state.latestBalanceMinor, state.latestEquityMinor, input.snapshotId, stateCreatedAt ?? input.calculatedAt, input.calculatedAt),
    database.prepare("INSERT OR IGNORE INTO risk_calculations (id, trading_account_id, account_snapshot_id, rule_version_id, engine_version, explanation_version, status, input_json, intermediate_json, output_json, explanation_json, calculated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(calculationId, input.tradingAccountId, input.snapshotId, active.rule_version_id, RISK_ENGINE_VERSION, RISK_EXPLANATION_VERSION, guardian.status, canonicalStringify({ guardian: guardianInput, consistency: consistencyReference }), canonicalStringify(guardian.intermediates), canonicalStringify(output), canonicalStringify(guardian.explanations), input.calculatedAt, input.calculatedAt),
    database.prepare("UPDATE account_connections SET risk_calculated_at = ?, updated_at = ? WHERE trading_account_id = ?")
      .bind(input.calculatedAt, input.calculatedAt, input.tradingAccountId),
    database.prepare("UPDATE rule_recalculation_jobs SET status = 'completed', completed_at = ?, updated_at = ? WHERE trading_account_id = ? AND to_rule_version_id = ? AND status = 'pending'")
      .bind(input.calculatedAt, input.calculatedAt, input.tradingAccountId, active.rule_version_id),
  ];
}

export async function latestRiskCalculation(database: AppDatabase, accountId: string): Promise<PublicRiskCalculation | null> {
  const row = await database.prepare("SELECT rc.id, rc.rule_version_id, rc.status, rc.engine_version, rc.explanation_version, rc.output_json, rc.explanation_json, rc.calculated_at FROM risk_calculations rc JOIN trading_accounts ta ON ta.id = rc.trading_account_id AND ta.rule_version_id = rc.rule_version_id WHERE rc.trading_account_id = ? ORDER BY rc.calculated_at DESC, rc.id DESC LIMIT 1")
    .bind(accountId).first<{ id: string; rule_version_id: string; status: string; engine_version: string; explanation_version: string; output_json: string; explanation_json: string; calculated_at: string }>();
  if (!row) return null;
  return {
    id: row.id,
    ruleVersionId: row.rule_version_id,
    status: row.status,
    engineVersion: row.engine_version,
    explanationVersion: row.explanation_version,
    calculatedAt: row.calculated_at,
    output: parseObject(row.output_json),
    explanations: parseStrings(row.explanation_json),
  };
}

export async function simulateLatestRiskCalculation(database: AppDatabase, accountId: string, options: {
  withdrawalMinor?: string | null;
  gapReserveMinor?: string;
  payoutPeriod?: { startsAt: string; endsAt: string } | null;
}): Promise<{ basedOnCalculationId: string; engineVersion: string; guardian: Record<string, unknown>; consistency: Record<string, unknown> } | null> {
  const row = await database.prepare("SELECT rc.id, rc.engine_version, rc.input_json, rc.output_json FROM risk_calculations rc JOIN trading_accounts ta ON ta.id = rc.trading_account_id AND ta.rule_version_id = rc.rule_version_id WHERE rc.trading_account_id = ? ORDER BY rc.calculated_at DESC, rc.id DESC LIMIT 1")
    .bind(accountId).first<{ id: string; engine_version: string; input_json: string; output_json: string }>();
  if (!row) return null;
  const stored = parseObject(row.input_json);
  if (!stored.guardian || typeof stored.guardian !== "object" || Array.isArray(stored.guardian)) throw new Error("Stored guardian input is invalid.");
  const guardianInput = stored.guardian as GuardianInput;
  const result = calculateGuardian({
    ...guardianInput,
    gapReserveMinor: options.gapReserveMinor ?? guardianInput.gapReserveMinor ?? "0",
    withdrawalMinor: options.withdrawalMinor ?? null,
  });
  const storedOutput = parseObject(row.output_json);
  let consistency: Record<string, unknown> = {
    period: null,
    metrics: storedOutput.consistency && typeof storedOutput.consistency === "object" && !Array.isArray(storedOutput.consistency) ? storedOutput.consistency : {},
  };
  if (options.payoutPeriod) {
    const periodDeals = await database.prepare("SELECT position_ticket, entry_type, volume_units, profit_minor, commission_minor, swap_minor, fee_minor, occurred_at FROM deals WHERE trading_account_id = ? AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at ASC")
      .bind(accountId, options.payoutPeriod.startsAt, options.payoutPeriod.endsAt).all<DealRow>();
    consistency = {
      period: options.payoutPeriod,
      metrics: consistencyResultJson(calculateConsistency(periodDeals.results.map(publicDeal))),
    };
  }
  return { basedOnCalculationId: row.id, engineVersion: row.engine_version, guardian: guardianResultJson(result), consistency };
}

function publicState(row: RiskStateRow): GuardianState {
  return {
    resetKey: row.reset_key,
    initialBalanceMinor: row.initial_balance_minor,
    startOfDayBalanceMinor: row.start_of_day_balance_minor,
    startOfDayEquityMinor: row.start_of_day_equity_minor,
    highestBalanceMinor: row.highest_balance_minor,
    highestEquityMinor: row.highest_equity_minor,
    endOfDayHighestBalanceMinor: row.end_of_day_highest_balance_minor,
    endOfDayHighestEquityMinor: row.end_of_day_highest_equity_minor,
    latestBalanceMinor: row.latest_balance_minor,
    latestEquityMinor: row.latest_equity_minor,
  };
}

function publicDeal(row: DealRow): ConsistencyDeal {
  return { positionTicket: row.position_ticket, entryType: Number(row.entry_type), volumeUnits: row.volume_units, profitMinor: row.profit_minor, commissionMinor: row.commission_minor, swapMinor: row.swap_minor, feeMinor: row.fee_minor, occurredAt: row.occurred_at };
}

function allStopsLoss(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  let total = 0n;
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const position = item as Record<string, unknown>;
    if (position.stopLossPricePoints == null || position.tickSizePoints == null || position.tickValueLossMinorPerLot == null) return null;
    if (position.direction !== "buy" && position.direction !== "sell") return null;
    if (![position.currentPricePoints, position.stopLossPricePoints, position.tickSizePoints, position.tickValueLossMinorPerLot, position.volumeUnits].every((item) => typeof item === "string")) return null;
    try {
      total += calculatePositionRisk({
        direction: position.direction,
        currentPricePoints: position.currentPricePoints as string,
        stopLossPricePoints: position.stopLossPricePoints as string,
        tickSizePoints: position.tickSizePoints as string,
        tickValueLossMinorPerLot: position.tickValueLossMinorPerLot as string,
        volumeUnits: position.volumeUnits as string,
      }) ?? 0n;
    } catch {
      return null;
    }
  }
  return total.toString();
}

function parseObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Stored risk output is invalid.");
  return parsed as Record<string, unknown>;
}

function parseStrings(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error("Stored risk explanation is invalid.");
  return parsed;
}
