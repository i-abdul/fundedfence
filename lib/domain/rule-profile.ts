export const RULE_DEFINITION_SCHEMA_VERSION = "1.0";

export const ruleLifecycleStatuses = [
  "draft",
  "source-attached",
  "validated",
  "approved",
  "effective",
  "superseded",
] as const;

export type RuleLifecycleStatus = typeof ruleLifecycleStatuses[number];

export type LossRule = {
  limitBps: number;
  model: "static" | "trailing-until-initial";
  breachBasis: "equity" | "balance-or-equity";
  reference: "initial-balance";
  cadence: "intraday";
  includes: Array<"closed-pnl" | "floating-pnl" | "commission" | "swap" | "fees">;
};

export type DailyLossRule = LossRule & {
  reset: {
    at: "00:00";
    timezone: "broker-server";
    daylightSaving: "GMT+3";
    standardTime: "GMT+2";
  };
};

export type RuleDefinition = {
  schemaVersion: typeof RULE_DEFINITION_SCHEMA_VERSION;
  firmCode: "fundednext";
  programCode: string;
  programName: string;
  phase: string;
  market: "CFDs";
  platforms: string[];
  currency: "USD";
  applicableAccountSizesMinor: string[];
  profitTargetBps: number | null;
  minimumTradingDays: number;
  maximumTradingDays: number | null;
  dailyLoss: DailyLossRule | null;
  maximumLoss: LossRule;
  holding: { overnight: "allowed" | "restricted" | "unknown"; weekend: "allowed" | "restricted" | "unknown" };
  news: {
    mode: "allowed" | "allowed-reward-adjustment";
    windowMinutesBefore: number;
    windowMinutesAfter: number;
    qualifyingProfitBps: number;
    affectedInstrumentsOnly: boolean;
  };
  consistency: { mode: "none" | "unknown" };
  copyTrading: { mode: "same-owner-only" | "unknown" };
  inactivityDays: number | null;
  payoutEligibility: { status: "not-applicable" | "requires-separate-profile" | "unknown" };
  interpretationNotes: string[];
  unknownInputs: string[];
};

export function validateRuleDefinition(value: unknown): RuleDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Rule definition must be an object.");
  const rule = value as Partial<RuleDefinition>;
  if (rule.schemaVersion !== RULE_DEFINITION_SCHEMA_VERSION) throw new Error("Unsupported rule-definition schema version.");
  if (rule.firmCode !== "fundednext") throw new Error("Unsupported firm code.");
  for (const field of ["programCode", "programName", "phase"] as const) {
    if (typeof rule[field] !== "string" || !rule[field]?.trim()) throw new Error(`Rule ${field} is required.`);
  }
  if (rule.market !== "CFDs" || rule.currency !== "USD") throw new Error("Rule market or currency is invalid.");
  if (!Array.isArray(rule.platforms) || rule.platforms.length === 0 || rule.platforms.some((item) => typeof item !== "string" || !item)) throw new Error("Rule platforms are invalid.");
  if (!Array.isArray(rule.applicableAccountSizesMinor) || rule.applicableAccountSizesMinor.length === 0 || rule.applicableAccountSizesMinor.some((item) => !/^\d+$/.test(item))) {
    throw new Error("Rule account-size applicability is invalid.");
  }
  optionalBps(rule.profitTargetBps, "profit target");
  if (!Number.isInteger(rule.minimumTradingDays) || Number(rule.minimumTradingDays) < 0) throw new Error("Minimum trading days are invalid.");
  if (rule.maximumTradingDays !== null && (!Number.isInteger(rule.maximumTradingDays) || Number(rule.maximumTradingDays) < 1)) throw new Error("Maximum trading days are invalid.");
  if (rule.dailyLoss !== null) validateLoss(rule.dailyLoss, true);
  validateLoss(rule.maximumLoss, false);
  if (!rule.holding || !rule.news || !rule.consistency || !rule.copyTrading || !rule.payoutEligibility) throw new Error("Rule restriction metadata is incomplete.");
  if (!Array.isArray(rule.interpretationNotes) || !Array.isArray(rule.unknownInputs)) throw new Error("Rule interpretation metadata is invalid.");
  return rule as RuleDefinition;
}

export function canTransitionRule(from: RuleLifecycleStatus, to: RuleLifecycleStatus): boolean {
  const transitions: Record<RuleLifecycleStatus, RuleLifecycleStatus[]> = {
    draft: ["source-attached"],
    "source-attached": ["validated"],
    validated: ["approved"],
    approved: ["effective"],
    effective: ["superseded"],
    superseded: [],
  };
  return transitions[from].includes(to);
}

export function isRuleLifecycleStatus(value: unknown): value is RuleLifecycleStatus {
  return typeof value === "string" && (ruleLifecycleStatuses as readonly string[]).includes(value);
}

function validateLoss(value: unknown, daily: boolean): asserts value is LossRule | DailyLossRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Loss rule is invalid.");
  const loss = value as Partial<DailyLossRule>;
  optionalBps(loss.limitBps, "loss limit", false);
  if (!["static", "trailing-until-initial"].includes(String(loss.model))) throw new Error("Loss model is invalid.");
  if (!["equity", "balance-or-equity"].includes(String(loss.breachBasis)) || loss.reference !== "initial-balance" || loss.cadence !== "intraday") throw new Error("Loss calculation basis is invalid.");
  if (!Array.isArray(loss.includes) || loss.includes.length === 0) throw new Error("Loss inclusions are required.");
  if (daily && (!loss.reset || loss.reset.at !== "00:00" || loss.reset.timezone !== "broker-server")) throw new Error("Daily reset definition is invalid.");
}

function optionalBps(value: unknown, field: string, allowNull = true): void {
  if (allowNull && value === null) return;
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 10_000) throw new Error(`Rule ${field} is invalid.`);
}
