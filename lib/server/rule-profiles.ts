import { canonicalStringify } from "@/lib/domain/connector-protocol";
import {
  canTransitionRule,
  isRuleLifecycleStatus,
  validateRuleDefinition,
  type RuleDefinition,
  type RuleLifecycleStatus,
} from "@/lib/domain/rule-profile";
import {
  FUNDEDNEXT_RULE_CAPTURED_AT,
  fundedNextRuleProfiles,
  type OfficialRuleSource,
} from "@/lib/product/fundednext-rule-catalog";
import type { AppUser } from "@/lib/server/auth";
import { sha256Hex, stableId } from "@/lib/server/crypto";
import type { AppDatabase, AppPreparedStatement } from "@/lib/server/database";

const FUNDEDNEXT_FIRM_ID = "firm_fundednext";

export type RuleProfileSourceView = OfficialRuleSource & {
  id: string;
  capturedAt: string;
  authorityClass: string;
};

export type RuleProfileVersionView = {
  id: string;
  version: number;
  status: RuleLifecycleStatus;
  effectiveAt: string;
  activatedAt: string | null;
  supersededAt: string | null;
  rollbackOfVersionId: string | null;
  definition: RuleDefinition;
  sources: RuleProfileSourceView[];
};

export type RuleProfileView = {
  firmName: string;
  programId: string;
  programCode: string;
  programName: string;
  phase: string;
  ruleSetId: string;
  activeVersionId: string | null;
  versions: RuleProfileVersionView[];
};

export type RuleWorkflowAction = "approve" | "activate" | "rollback";

type RuleVersionRow = {
  firm_name: string;
  program_id: string;
  program_code: string;
  program_name: string;
  phase: string;
  rule_set_id: string;
  active_version_id: string | null;
  version_id: string;
  version: number;
  verification_status: string;
  effective_at: string;
  activated_at: string | null;
  superseded_at: string | null;
  rollback_of_version_id: string | null;
  definition_json: string;
};

type RuleSourceRow = {
  id: string;
  rule_version_id: string;
  title: string;
  url: string;
  captured_at: string;
  authority_class: string;
  evidence_json: string;
};

type WorkflowVersionRow = {
  id: string;
  rule_set_id: string;
  program_id: string;
  version: number;
  verification_status: string;
  definition_json: string;
  content_hash: string;
  interpretation_notes: string;
  created_by_user_id: string | null;
  validated_by_user_id: string | null;
  active_version_id: string | null;
};

type AccountAssignmentRow = {
  id: string;
  account_size_minor: string;
  rule_version_id: string | null;
};

export function isRuleAdmin(email: string): boolean {
  const configured = (process.env.RULE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(email.trim().toLowerCase());
}

export async function ensureFundedNextRuleCatalog(database: AppDatabase): Promise<void> {
  const seedVersionIds = fundedNextRuleProfiles.map((profile) => profile.versionId);
  const placeholders = seedVersionIds.map(() => "?").join(", ");
  const existing = await database.prepare(`SELECT COUNT(*) AS seed_count FROM rule_versions WHERE id IN (${placeholders})`)
    .bind(...seedVersionIds).first<{ seed_count: number | string }>();
  if (Number(existing?.seed_count ?? 0) === seedVersionIds.length) return;
  const now = new Date().toISOString();
  const statements: AppPreparedStatement[] = [
    database.prepare("INSERT INTO prop_firms (id, name, status, created_at, updated_at) VALUES (?, 'FundedNext', 'source-captured', ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, updated_at = excluded.updated_at")
      .bind(FUNDEDNEXT_FIRM_ID, FUNDEDNEXT_RULE_CAPTURED_AT, now),
  ];

  for (const profile of fundedNextRuleProfiles) {
    const definition = validateRuleDefinition(profile.definition);
    const definitionJson = canonicalStringify(definition);
    const contentHash = await sha256Hex(definitionJson);
    const notes = definition.interpretationNotes.join("\n");
    statements.push(
      database.prepare("INSERT INTO prop_firm_programs (id, prop_firm_id, name, program_code, phase, market, status, platform, account_currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'source-captured', 'MT5', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, program_code = excluded.program_code, phase = excluded.phase, market = excluded.market, status = excluded.status, platform = excluded.platform, account_currency = excluded.account_currency, updated_at = excluded.updated_at")
        .bind(profile.programId, FUNDEDNEXT_FIRM_ID, definition.programName, definition.programCode, definition.phase, definition.market, definition.currency, FUNDEDNEXT_RULE_CAPTURED_AT, now),
      database.prepare("INSERT INTO rule_sets (id, program_id, account_size_minor, active_version_id, created_at, updated_at) VALUES (?, ?, '*', NULL, ?, ?) ON CONFLICT(id) DO UPDATE SET program_id = excluded.program_id, account_size_minor = excluded.account_size_minor, updated_at = excluded.updated_at")
        .bind(profile.ruleSetId, profile.programId, FUNDEDNEXT_RULE_CAPTURED_AT, now),
      database.prepare("INSERT OR IGNORE INTO rule_versions (id, rule_set_id, version, effective_at, expires_at, verification_status, definition_json, content_hash, interpretation_notes, created_by_user_id, validated_by_user_id, reviewed_by_user_id, activated_by_user_id, approved_by_user_id, activated_at, superseded_at, rollback_of_version_id, created_at, updated_at) VALUES (?, ?, 1, ?, NULL, 'validated', ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)")
        .bind(profile.versionId, profile.ruleSetId, FUNDEDNEXT_RULE_CAPTURED_AT, definitionJson, contentHash, notes, FUNDEDNEXT_RULE_CAPTURED_AT, FUNDEDNEXT_RULE_CAPTURED_AT),
      database.prepare("INSERT OR IGNORE INTO rule_version_transitions (id, rule_version_id, from_status, to_status, actor_type, actor_id, reason, occurred_at) VALUES (?, ?, 'draft', 'source-attached', 'system', 'official-source-capture', 'Official FundedNext sources attached.', ?)")
        .bind(`${profile.versionId}_source_attached`, profile.versionId, FUNDEDNEXT_RULE_CAPTURED_AT),
      database.prepare("INSERT OR IGNORE INTO rule_version_transitions (id, rule_version_id, from_status, to_status, actor_type, actor_id, reason, occurred_at) VALUES (?, ?, 'source-attached', 'validated', 'system', 'schema-validator', 'Definition passed the versioned rule contract and source-evidence validation.', ?)")
        .bind(`${profile.versionId}_validated`, profile.versionId, FUNDEDNEXT_RULE_CAPTURED_AT),
    );

    for (const source of profile.sources) {
      const sourceId = await stableId("rulesrc", `${profile.versionId}:${source.url}`);
      const evidenceJson = canonicalStringify(source.facts);
      statements.push(
        database.prepare("INSERT OR IGNORE INTO rule_sources (id, rule_version_id, source_type, authority_class, title, url, captured_at, content_hash, evidence_json, created_at, updated_at) VALUES (?, ?, 'official-help-center', 'confirmed-rule', ?, ?, ?, ?, ?, ?, ?)")
          .bind(sourceId, profile.versionId, source.title, source.url, FUNDEDNEXT_RULE_CAPTURED_AT, await sha256Hex(evidenceJson), evidenceJson, FUNDEDNEXT_RULE_CAPTURED_AT, FUNDEDNEXT_RULE_CAPTURED_AT),
      );
    }

    // Accounts created before the rule engine stored a program foreign key. The
    // pairing label includes both values, so this only backfills an exact known profile.
    statements.push(
      database.prepare("UPDATE trading_accounts SET program_id = ?, updated_at = ? WHERE program_id IS NULL AND label LIKE ? AND label LIKE ?")
        .bind(profile.programId, now, `%${definition.programName}%`, `%${definition.phase}%`),
    );
  }
  await database.batch(statements);
}

export async function listRuleProfiles(database: AppDatabase): Promise<RuleProfileView[]> {
  await ensureFundedNextRuleCatalog(database);
  const [versionRows, sourceRows] = await Promise.all([
    database.prepare("SELECT pf.name AS firm_name, p.id AS program_id, p.program_code, p.name AS program_name, p.phase, rs.id AS rule_set_id, rs.active_version_id, rv.id AS version_id, rv.version, rv.verification_status, rv.effective_at, rv.activated_at, rv.superseded_at, rv.rollback_of_version_id, rv.definition_json FROM prop_firms pf JOIN prop_firm_programs p ON p.prop_firm_id = pf.id JOIN rule_sets rs ON rs.program_id = p.id JOIN rule_versions rv ON rv.rule_set_id = rs.id WHERE pf.id = ? ORDER BY p.name, p.phase, rv.version DESC")
      .bind(FUNDEDNEXT_FIRM_ID).all<RuleVersionRow>(),
    database.prepare("SELECT src.id, src.rule_version_id, src.title, src.url, src.captured_at, src.authority_class, src.evidence_json FROM rule_sources src JOIN rule_versions rv ON rv.id = src.rule_version_id JOIN rule_sets rs ON rs.id = rv.rule_set_id JOIN prop_firm_programs p ON p.id = rs.program_id WHERE p.prop_firm_id = ? ORDER BY src.title")
      .bind(FUNDEDNEXT_FIRM_ID).all<RuleSourceRow>(),
  ]);
  const sourcesByVersion = new Map<string, RuleProfileSourceView[]>();
  for (const row of sourceRows.results) {
    const list = sourcesByVersion.get(row.rule_version_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      url: row.url,
      capturedAt: row.captured_at,
      authorityClass: row.authority_class,
      facts: parseRecord(row.evidence_json),
    });
    sourcesByVersion.set(row.rule_version_id, list);
  }

  const profiles = new Map<string, RuleProfileView>();
  for (const row of versionRows.results) {
    if (!isRuleLifecycleStatus(row.verification_status)) throw new Error(`Unknown rule lifecycle status: ${row.verification_status}`);
    const profile = profiles.get(row.rule_set_id) ?? {
      firmName: row.firm_name,
      programId: row.program_id,
      programCode: row.program_code,
      programName: row.program_name,
      phase: row.phase,
      ruleSetId: row.rule_set_id,
      activeVersionId: row.active_version_id,
      versions: [],
    };
    profile.versions.push({
      id: row.version_id,
      version: Number(row.version),
      status: row.verification_status,
      effectiveAt: row.effective_at,
      activatedAt: row.activated_at,
      supersededAt: row.superseded_at,
      rollbackOfVersionId: row.rollback_of_version_id,
      definition: validateRuleDefinition(JSON.parse(row.definition_json)),
      sources: sourcesByVersion.get(row.version_id) ?? [],
    });
    profiles.set(row.rule_set_id, profile);
  }
  return [...profiles.values()];
}

export async function transitionRuleVersion(
  database: AppDatabase,
  user: AppUser,
  action: RuleWorkflowAction,
  versionId: string,
  reason: string,
): Promise<{ versionId: string; status: RuleLifecycleStatus; affectedAccounts: number }> {
  if (!isRuleAdmin(user.email)) throw new Error("Your account is not authorized to approve or activate rule versions.");
  await ensureFundedNextRuleCatalog(database);
  const actorId = await stableId("usr", user.email.toLowerCase());
  const target = await workflowVersion(database, versionId);
  if (!target || !isRuleLifecycleStatus(target.verification_status)) throw new Error("The requested rule version does not exist.");
  const status = target.verification_status;
  const now = new Date().toISOString();
  const transitionReason = reason.trim() || defaultReason(action);

  if (action === "approve") {
    if (!canTransitionRule(status, "approved")) throw new Error(`A ${status} rule version cannot be approved.`);
    if (target.created_by_user_id === actorId || target.validated_by_user_id === actorId) throw new Error("The reviewer must be independent from the rule author and validator.");
    await database.batch([
      database.prepare("UPDATE rule_versions SET verification_status = 'approved', reviewed_by_user_id = ?, approved_by_user_id = ?, updated_at = ? WHERE id = ? AND verification_status = 'validated'")
        .bind(actorId, actorId, now, versionId),
      transitionStatement(database, versionId, status, "approved", actorId, transitionReason, now),
    ]);
    return { versionId, status: "approved", affectedAccounts: 0 };
  }

  if (action === "activate") {
    if (!canTransitionRule(status, "effective")) throw new Error(`A ${status} rule version cannot be activated.`);
    const definition = validateRuleDefinition(JSON.parse(target.definition_json));
    const accounts = await assignableAccounts(database, target.program_id, definition.applicableAccountSizesMinor);
    const statements: AppPreparedStatement[] = [];
    if (target.active_version_id && target.active_version_id !== versionId) {
      const active = await workflowVersion(database, target.active_version_id);
      if (active?.verification_status === "effective") {
        statements.push(
          database.prepare("UPDATE rule_versions SET verification_status = 'superseded', superseded_at = ?, updated_at = ? WHERE id = ? AND verification_status = 'effective'")
            .bind(now, now, active.id),
          transitionStatement(database, active.id, "effective", "superseded", actorId, `Superseded by ${versionId}.`, now),
        );
      }
    }
    statements.push(
      database.prepare("UPDATE rule_versions SET verification_status = 'effective', activated_by_user_id = ?, activated_at = ?, updated_at = ? WHERE id = ? AND verification_status = 'approved'")
        .bind(actorId, now, now, versionId),
      database.prepare("UPDATE rule_sets SET active_version_id = ?, updated_at = ? WHERE id = ?")
        .bind(versionId, now, target.rule_set_id),
      transitionStatement(database, versionId, status, "effective", actorId, transitionReason, now),
      ...accountAssignmentStatements(database, accounts, versionId, "rule-version-activation", now),
    );
    await database.batch(statements);
    return { versionId, status: "effective", affectedAccounts: accounts.length };
  }

  if (status !== "superseded") throw new Error("Only a superseded rule version can be rolled back.");
  const current = target.active_version_id ? await workflowVersion(database, target.active_version_id) : null;
  if (!current || current.verification_status !== "effective") throw new Error("No effective rule version is available to replace.");
  const maximum = await database.prepare("SELECT MAX(version) AS maximum_version FROM rule_versions WHERE rule_set_id = ?")
    .bind(target.rule_set_id).first<{ maximum_version: number | string | null }>();
  const nextVersion = Number(maximum?.maximum_version ?? 0) + 1;
  const rollbackVersionId = `rulever_${crypto.randomUUID().replace(/-/g, "")}`;
  const definition = validateRuleDefinition(JSON.parse(target.definition_json));
  const accounts = await assignableAccounts(database, target.program_id, definition.applicableAccountSizesMinor);
  const sources = await database.prepare("SELECT source_type, authority_class, title, url, captured_at, content_hash, evidence_json FROM rule_sources WHERE rule_version_id = ?")
    .bind(target.id).all<{ source_type: string; authority_class: string; title: string; url: string; captured_at: string; content_hash: string; evidence_json: string }>();
  const statements: AppPreparedStatement[] = [
    database.prepare("UPDATE rule_versions SET verification_status = 'superseded', superseded_at = ?, updated_at = ? WHERE id = ? AND verification_status = 'effective'")
      .bind(now, now, current.id),
    transitionStatement(database, current.id, "effective", "superseded", actorId, `Superseded by rollback ${rollbackVersionId}.`, now),
    database.prepare("INSERT INTO rule_versions (id, rule_set_id, version, effective_at, expires_at, verification_status, definition_json, content_hash, interpretation_notes, created_by_user_id, validated_by_user_id, reviewed_by_user_id, activated_by_user_id, approved_by_user_id, activated_at, superseded_at, rollback_of_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, 'effective', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)")
      .bind(rollbackVersionId, target.rule_set_id, nextVersion, now, target.definition_json, target.content_hash, target.interpretation_notes, actorId, actorId, actorId, actorId, actorId, now, target.id, now, now),
    transitionStatement(database, rollbackVersionId, "approved", "effective", actorId, transitionReason, now),
    database.prepare("UPDATE rule_sets SET active_version_id = ?, updated_at = ? WHERE id = ?")
      .bind(rollbackVersionId, now, target.rule_set_id),
    ...accountAssignmentStatements(database, accounts, rollbackVersionId, "rule-version-rollback", now),
  ];
  for (const source of sources.results) {
    statements.push(
      database.prepare("INSERT INTO rule_sources (id, rule_version_id, source_type, authority_class, title, url, captured_at, content_hash, evidence_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(await stableId("rulesrc", `${rollbackVersionId}:${source.url}`), rollbackVersionId, source.source_type, source.authority_class, source.title, source.url, source.captured_at, source.content_hash, source.evidence_json, now, now),
    );
  }
  await database.batch(statements);
  return { versionId: rollbackVersionId, status: "effective", affectedAccounts: accounts.length };
}

async function workflowVersion(database: AppDatabase, versionId: string): Promise<WorkflowVersionRow | null> {
  return database.prepare("SELECT rv.id, rv.rule_set_id, rs.program_id, rv.version, rv.verification_status, rv.definition_json, rv.content_hash, rv.interpretation_notes, rv.created_by_user_id, rv.validated_by_user_id, rs.active_version_id FROM rule_versions rv JOIN rule_sets rs ON rs.id = rv.rule_set_id WHERE rv.id = ? LIMIT 1")
    .bind(versionId).first<WorkflowVersionRow>();
}

async function assignableAccounts(database: AppDatabase, programId: string, sizes: string[]): Promise<AccountAssignmentRow[]> {
  const rows = await database.prepare("SELECT id, account_size_minor, rule_version_id FROM trading_accounts WHERE program_id = ? AND status = 'connected'")
    .bind(programId).all<AccountAssignmentRow>();
  return rows.results.filter((row) => sizes.includes(row.account_size_minor));
}

function accountAssignmentStatements(database: AppDatabase, accounts: AccountAssignmentRow[], versionId: string, reason: string, now: string): AppPreparedStatement[] {
  const statements: AppPreparedStatement[] = [];
  for (const account of accounts) {
    statements.push(
      database.prepare("UPDATE trading_accounts SET rule_version_id = ?, updated_at = ? WHERE id = ?")
        .bind(versionId, now, account.id),
      database.prepare("INSERT OR IGNORE INTO rule_recalculation_jobs (id, trading_account_id, from_rule_version_id, to_rule_version_id, status, reason, requested_at, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, ?, ?)")
        .bind(`recalc_${crypto.randomUUID().replace(/-/g, "")}`, account.id, account.rule_version_id, versionId, reason, now, now, now),
    );
  }
  return statements;
}

function transitionStatement(database: AppDatabase, versionId: string, from: RuleLifecycleStatus, to: RuleLifecycleStatus, actorId: string, reason: string, now: string): AppPreparedStatement {
  return database.prepare("INSERT INTO rule_version_transitions (id, rule_version_id, from_status, to_status, actor_type, actor_id, reason, occurred_at) VALUES (?, ?, ?, ?, 'user', ?, ?, ?)")
    .bind(`ruletransition_${crypto.randomUUID().replace(/-/g, "")}`, versionId, from, to, actorId, reason, now);
}

function defaultReason(action: RuleWorkflowAction): string {
  if (action === "approve") return "Official sources and interpretation reviewed and approved.";
  if (action === "activate") return "Approved rule version activated for matching accounts.";
  return "Previous rule definition restored as a new effective version.";
}

function parseRecord(value: string): Record<string, string | number | boolean | null> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Rule source evidence is invalid.");
  return parsed as Record<string, string | number | boolean | null>;
}
