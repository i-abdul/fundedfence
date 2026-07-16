import type { DailyLossRule, LossRule, RuleDefinition } from "@/lib/domain/rule-profile";

export type OfficialRuleSource = {
  title: string;
  url: string;
  facts: Record<string, string | number | boolean | null>;
};

export type SeedRuleProfile = {
  programId: string;
  ruleSetId: string;
  versionId: string;
  version: number;
  definition: RuleDefinition;
  sources: OfficialRuleSource[];
};

const capturedAt = "2026-07-16T00:00:00.000Z";
export const FUNDEDNEXT_RULE_CAPTURED_AT = capturedAt;

const lossIncludes: LossRule["includes"] = ["closed-pnl", "floating-pnl", "commission", "swap", "fees"];
const dailyReset: DailyLossRule["reset"] = { at: "00:00", timezone: "broker-server", daylightSaving: "GMT+3", standardTime: "GMT+2" };

const accountSizes = {
  "fundednext-free-trial": ["600000", "1500000", "2500000", "5000000", "10000000", "20000000"],
  "fundednext-stellar-2-step": ["600000", "1500000", "2500000", "5000000", "10000000", "20000000"],
  "fundednext-stellar-1-step": ["600000", "1500000", "2500000", "5000000", "10000000", "20000000"],
  "fundednext-stellar-lite": ["500000", "1000000", "2500000", "5000000", "10000000", "20000000"],
  "fundednext-stellar-instant": ["200000", "500000", "1000000", "2000000"],
} as const;

const sources = {
  freeTrial: {
    title: "FundedNext Free Trial Rules",
    url: "https://help.fundednext.com/en/articles/8902893-fundednext-free-trial-rules",
    facts: { process: "1-step", profitTargetPercent: 5, minimumTradingDays: 3, trialCalendarDays: 14, dailyLossPercent: 5, maximumLossPercent: 10, reset: "midnight server time", weekendHolding: true, newsTrading: true, expertAdvisorsAllowed: false, maximumOpenPositions: 30, platform: "MT5 except US clients" },
  },
  loss: {
    title: "Daily Loss Limit vs. Maximum Loss Limit",
    url: "https://help.fundednext.com/en/articles/9941519-daily-loss-limit-vs-maximum-loss-limit",
    facts: { reset: "00:00 broker server time", daylightSaving: "GMT+3", standardTime: "GMT+2", breachIncludesFloatingLoss: true },
  },
  daily: {
    title: "How can I calculate the daily loss limit?",
    url: "https://help.fundednext.com/en/articles/8019811-how-can-i-calculate-the-daily-loss-limit",
    facts: { basis: "initial balance", includesClosedAndOpenResults: true, includesCommissionSwapFees: true },
  },
  minimumDays: {
    title: "What is no minimum trading days in FundedNext?",
    url: "https://help.fundednext.com/en/articles/12729274-what-is-no-minimum-trading-days-in-fundednext",
    facts: { stellar2StepChallengeDays: 5, stellar1StepChallengeDays: 2, stellarLiteChallengeDays: 5, fundedAccountDays: 0 },
  },
  holding: {
    title: "Does FundedNext allow holding trades overnight and over the weekend?",
    url: "https://help.fundednext.com/en/articles/11982358-does-fundednext-allow-holding-trades-over-the-night-weekend",
    facts: { overnight: "allowed", weekend: "allowed", swapsAffectDailyLoss: true },
  },
  news: {
    title: "Is News Trading Allowed at FundedNext?",
    url: "https://help.fundednext.com/en/articles/10701447-is-news-trading-allowed-at-fundednext",
    facts: { challengeTrading: "allowed", fundedWindowMinutesBefore: 5, fundedWindowMinutesAfter: 5, qualifyingProfitPercent: 40, affectedInstrumentsOnly: true },
  },
  twoStepTarget: {
    title: "What Is the Profit Target of the Stellar 2-Step Challenge?",
    url: "https://help.fundednext.com/en/articles/8021071-what-is-the-profit-target-of-the-stellar-2-step-challenge",
    facts: { phase1Percent: 8, phase2Percent: 5, fundedPercent: null },
  },
  oneStepTarget: {
    title: "What is the Profit Target of the Stellar 1-Step Challenge?",
    url: "https://help.fundednext.com/en/articles/8030875-what-is-the-profit-target-of-the-stellar-1-step-challenge",
    facts: { phase1Percent: 10, fundedPercent: null },
  },
  liteTarget: {
    title: "What is the Profit Target in FundedNext Stellar Lite?",
    url: "https://help.fundednext.com/en/articles/9133001-what-is-the-profit-target-in-fundednext-stellar-lite",
    facts: { phase1Percent: 8, phase2Percent: 4, fundedPercent: null },
  },
  instantLoss: {
    title: "Daily and Maximum Loss Limits for Stellar Instant Accounts",
    url: "https://help.fundednext.com/en/articles/11641163-what-are-the-daily-loss-limit-and-the-maximum-loss-limit-for-the-stellar-instant-accounts",
    facts: { dailyLoss: null, maximumLossPercent: 6, model: "trailing", highWaterBasis: "balance", breachBasis: "equity", cap: "initial balance", resetsAfterWithdrawal: false },
  },
  instantRules: {
    title: "Rules for the Stellar Instant Account",
    url: "https://help.fundednext.com/en/articles/11641614-what-rules-do-i-need-to-follow-in-the-stellar-instant-account",
    facts: { copyTrading: "same owner only", singleConsistentIpRecommended: true, dedicatedVpnVpsAllowed: true },
  },
  instantNews: {
    title: "Is News Trading Allowed in Stellar Instant Accounts?",
    url: "https://help.fundednext.com/en/articles/11641410-is-news-trading-allowed-in-the-stellar-instant-accounts",
    facts: { windowMinutesBefore: 5, windowMinutesAfter: 5, qualifyingProfitPercent: 40, partialCloseAffectsEntireTrade: true },
  },
  instantDays: {
    title: "Minimum Trading Days for Stellar Instant",
    url: "https://help.fundednext.com/en/articles/11641219-are-there-any-minimum-trading-day-requirements-for-the-stellar-instant-account",
    facts: { minimumTradingDays: 0 },
  },
  instantConsistency: {
    title: "Consistency Rules for Stellar Instant",
    url: "https://help.fundednext.com/en/articles/11641328-are-there-any-consistency-rules-for-the-stellar-instant-account",
    facts: { consistencyRule: "none" },
  },
};

function staticLoss(limitBps: number): LossRule {
  return { limitBps, model: "static", breachBasis: "balance-or-equity", reference: "initial-balance", cadence: "intraday", includes: lossIncludes };
}

function dailyLoss(limitBps: number): DailyLossRule {
  return { ...staticLoss(limitBps), breachBasis: "equity", reset: dailyReset };
}

function definition(input: {
  programCode: keyof typeof accountSizes;
  programName: string;
  phase: string;
  targetBps: number | null;
  minimumDays: number;
  dailyBps: number | null;
  maximumLoss: LossRule;
  maximumDays?: number | null;
  expertAdvisors?: RuleDefinition["expertAdvisors"];
  maximumOpenPositions?: number | null;
  funded?: boolean;
  instant?: boolean;
}): RuleDefinition {
  const rewardAdjustment = Boolean(input.funded || input.instant);
  return {
    schemaVersion: "1.0",
    firmCode: "fundednext",
    programCode: input.programCode,
    programName: input.programName,
    phase: input.phase,
    market: "CFDs",
    platforms: ["MT5"],
    currency: "USD",
    applicableAccountSizesMinor: [...accountSizes[input.programCode]],
    profitTargetBps: input.targetBps,
    minimumTradingDays: input.minimumDays,
    maximumTradingDays: input.maximumDays ?? null,
    dailyLoss: input.dailyBps === null ? null : dailyLoss(input.dailyBps),
    maximumLoss: input.maximumLoss,
    holding: { overnight: "allowed", weekend: "allowed" },
    news: { mode: rewardAdjustment ? "allowed-reward-adjustment" : "allowed", windowMinutesBefore: rewardAdjustment ? 5 : 0, windowMinutesAfter: rewardAdjustment ? 5 : 0, qualifyingProfitBps: rewardAdjustment ? 4_000 : 10_000, affectedInstrumentsOnly: rewardAdjustment },
    consistency: { mode: input.instant ? "none" : "unknown" },
    copyTrading: { mode: input.instant ? "same-owner-only" : "unknown" },
    expertAdvisors: input.expertAdvisors ?? { mode: "unknown", note: "No program-specific expert-advisor source is attached to this profile." },
    maximumOpenPositions: input.maximumOpenPositions ?? null,
    inactivityDays: null,
    payoutEligibility: { status: input.funded || input.instant ? "requires-separate-profile" : "not-applicable" },
    interpretationNotes: [
      "Official-source interpretation captured on 2026-07-16; activation requires independent approval.",
      rewardAdjustment ? "News trading is allowed, but qualifying profitable executions in the official window receive the documented reward adjustment." : "Challenge-phase news trading is allowed without the funded-account reward adjustment.",
    ],
    unknownInputs: ["maximum lot size", "maximum position size", "prohibited instruments", "inactivity rule", "complete payout eligibility"],
  };
}

function seed(programCode: keyof typeof accountSizes, slug: string, rule: RuleDefinition, profileSources: OfficialRuleSource[], version = 1): SeedRuleProfile {
  if (rule.programCode !== programCode) throw new Error(`Rule profile ${slug} has a mismatched program code.`);
  return {
    programId: `program_${slug}`,
    ruleSetId: `ruleset_${slug}`,
    versionId: `rulever_${slug}_v${version}`,
    version,
    definition: rule,
    sources: profileSources,
  };
}

const commonChallengeSources = [sources.loss, sources.daily, sources.minimumDays, sources.holding, sources.news];

export const fundedNextRuleProfiles: SeedRuleProfile[] = [
  seed("fundednext-free-trial", "fundednext_free_trial", definition({ programCode: "fundednext-free-trial", programName: "Free Trial", phase: "Trial", targetBps: 500, minimumDays: 3, maximumDays: 14, dailyBps: 500, maximumLoss: staticLoss(1_000), expertAdvisors: { mode: "prohibited", note: "FundedNext says EAs are not permissible on Free Trial accounts; whether a strictly read-only monitoring EA is exempt requires confirmation from FundedNext." }, maximumOpenPositions: 30 }), [sources.freeTrial]),
  seed("fundednext-stellar-2-step", "fundednext_stellar_2_step_phase_1", definition({ programCode: "fundednext-stellar-2-step", programName: "Stellar 2-Step", phase: "Phase 1", targetBps: 800, minimumDays: 5, dailyBps: 500, maximumLoss: staticLoss(1_000) }), [sources.twoStepTarget, ...commonChallengeSources]),
  seed("fundednext-stellar-2-step", "fundednext_stellar_2_step_phase_2", definition({ programCode: "fundednext-stellar-2-step", programName: "Stellar 2-Step", phase: "Phase 2", targetBps: 500, minimumDays: 5, dailyBps: 500, maximumLoss: staticLoss(1_000) }), [sources.twoStepTarget, ...commonChallengeSources]),
  seed("fundednext-stellar-2-step", "fundednext_stellar_2_step_funded", definition({ programCode: "fundednext-stellar-2-step", programName: "Stellar 2-Step", phase: "Funded", targetBps: null, minimumDays: 0, dailyBps: 500, maximumLoss: staticLoss(1_000), funded: true }), [sources.twoStepTarget, ...commonChallengeSources]),
  seed("fundednext-stellar-1-step", "fundednext_stellar_1_step_phase_1", definition({ programCode: "fundednext-stellar-1-step", programName: "Stellar 1-Step", phase: "Phase 1", targetBps: 1_000, minimumDays: 2, dailyBps: 300, maximumLoss: staticLoss(600) }), [sources.oneStepTarget, ...commonChallengeSources]),
  seed("fundednext-stellar-1-step", "fundednext_stellar_1_step_funded", definition({ programCode: "fundednext-stellar-1-step", programName: "Stellar 1-Step", phase: "Funded", targetBps: null, minimumDays: 0, dailyBps: 300, maximumLoss: staticLoss(600), funded: true }), [sources.oneStepTarget, ...commonChallengeSources]),
  seed("fundednext-stellar-lite", "fundednext_stellar_lite_phase_1", definition({ programCode: "fundednext-stellar-lite", programName: "Stellar Lite", phase: "Phase 1", targetBps: 800, minimumDays: 5, dailyBps: 400, maximumLoss: staticLoss(800) }), [sources.liteTarget, ...commonChallengeSources]),
  seed("fundednext-stellar-lite", "fundednext_stellar_lite_phase_2", definition({ programCode: "fundednext-stellar-lite", programName: "Stellar Lite", phase: "Phase 2", targetBps: 400, minimumDays: 5, dailyBps: 400, maximumLoss: staticLoss(800) }), [sources.liteTarget, ...commonChallengeSources]),
  seed("fundednext-stellar-lite", "fundednext_stellar_lite_funded", definition({ programCode: "fundednext-stellar-lite", programName: "Stellar Lite", phase: "Funded", targetBps: null, minimumDays: 0, dailyBps: 400, maximumLoss: staticLoss(800), funded: true }), [sources.liteTarget, ...commonChallengeSources]),
  seed("fundednext-stellar-instant", "fundednext_stellar_instant_funded", definition({ programCode: "fundednext-stellar-instant", programName: "Stellar Instant", phase: "Instant funded", targetBps: null, minimumDays: 0, dailyBps: null, maximumLoss: { limitBps: 600, model: "trailing-until-initial", breachBasis: "equity", reference: "initial-balance", cadence: "intraday", includes: lossIncludes }, instant: true }), [sources.instantLoss, sources.instantRules, sources.instantNews, sources.instantDays, sources.instantConsistency]),
  seed("fundednext-stellar-instant", "fundednext_stellar_instant_funded", {
    ...definition({ programCode: "fundednext-stellar-instant", programName: "Stellar Instant", phase: "Instant funded", targetBps: null, minimumDays: 0, dailyBps: null, maximumLoss: { limitBps: 600, model: "trailing-until-initial", breachBasis: "equity", trailingBasis: "balance", reference: "initial-balance", cadence: "intraday", includes: lossIncludes }, instant: true }),
    interpretationNotes: [
      "Official-source interpretation captured on 2026-07-16; activation requires independent approval.",
      "Version 2 explicitly separates the highest-balance trailing reference from the equity breach basis.",
      "News trading is allowed, but qualifying profitable executions in the official window receive the documented reward adjustment.",
    ],
  }, [sources.instantLoss, sources.instantRules, sources.instantNews, sources.instantDays, sources.instantConsistency], 2),
];

export function findSeedRuleProfile(programCode: string | undefined, phase: string | undefined): SeedRuleProfile | undefined {
  return fundedNextRuleProfiles
    .filter((profile) => profile.definition.programCode === programCode && profile.definition.phase === phase)
    .sort((left, right) => right.version - left.version)[0];
}
