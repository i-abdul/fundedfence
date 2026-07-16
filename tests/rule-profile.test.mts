import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionRule, validateRuleDefinition } from "../lib/domain/rule-profile.ts";
import { fundedNextRuleProfiles } from "../lib/product/fundednext-rule-catalog.ts";

test("all FundedNext phase profiles satisfy the versioned rule contract", () => {
  assert.equal(fundedNextRuleProfiles.length, 11);
  assert.equal(new Set(fundedNextRuleProfiles.map((profile) => profile.ruleSetId)).size, 10);
  const versionIds = new Set<string>();
  for (const profile of fundedNextRuleProfiles) {
    const validated = validateRuleDefinition(profile.definition);
    assert.equal(validated.firmCode, "fundednext");
    assert.ok(validated.applicableAccountSizesMinor.length > 0);
    assert.ok(profile.sources.length > 0);
    assert.ok(!versionIds.has(profile.versionId));
    versionIds.add(profile.versionId);
  }
  const trial = fundedNextRuleProfiles.find((profile) => profile.definition.programCode === "fundednext-free-trial");
  assert.ok(trial);
  assert.equal(trial.definition.profitTargetBps, 500);
  assert.equal(trial.definition.minimumTradingDays, 3);
  assert.equal(trial.definition.maximumTradingDays, 14);
  assert.equal(trial.definition.expertAdvisors?.mode, "prohibited");
  assert.equal(trial.definition.maximumOpenPositions, 30);
  const instant = fundedNextRuleProfiles.find((profile) => profile.definition.programCode === "fundednext-stellar-instant" && profile.version === 2);
  assert.equal(instant?.definition.maximumLoss.trailingBasis, "balance");
});

test("rule lifecycle cannot skip independent review or activation", () => {
  assert.equal(canTransitionRule("draft", "source-attached"), true);
  assert.equal(canTransitionRule("source-attached", "validated"), true);
  assert.equal(canTransitionRule("validated", "approved"), true);
  assert.equal(canTransitionRule("approved", "effective"), true);
  assert.equal(canTransitionRule("validated", "effective"), false);
  assert.equal(canTransitionRule("effective", "approved"), false);
});

test("invalid account-size applicability is rejected", () => {
  const invalid = structuredClone(fundedNextRuleProfiles[0].definition);
  invalid.applicableAccountSizesMinor = ["$100,000"];
  assert.throws(() => validateRuleDefinition(invalid), /account-size applicability/);
});
