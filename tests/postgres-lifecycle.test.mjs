import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;
const baseConnectionString = process.env.TEST_POSTGRES_URL ?? (process.env.RUN_POSTGRES_INTEGRATION === "1" ? process.env.POSTGRES_URL : undefined);
const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1" && Boolean(baseConnectionString);

test("PostgreSQL connector lifecycle, tenant isolation, replacement, replay, and reconnect", { skip: enabled ? false : "Set RUN_POSTGRES_INTEGRATION=1 and TEST_POSTGRES_URL to run." }, async (t) => {
  const schema = `ff_test_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: baseConnectionString });
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  const testPool = new Pool({ connectionString: baseConnectionString, options: `-c search_path=${schema}` });
  const isolatedConnectionUrl = new URL(baseConnectionString);
  isolatedConnectionUrl.searchParams.set("options", `-c search_path=${schema}`);
  const previousPostgresUrl = process.env.POSTGRES_URL;
  const previousRuleAdmins = process.env.RULE_ADMIN_EMAILS;
  t.after(async () => {
    if (previousPostgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = previousPostgresUrl;
    if (previousRuleAdmins === undefined) delete process.env.RULE_ADMIN_EMAILS;
    else process.env.RULE_ADMIN_EMAILS = previousRuleAdmins;
    await testPool.end();
    await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adminPool.end();
  });

  const migration = await readFile(new URL("../deploy/postgres/001_initial.sql", import.meta.url), "utf8");
  await testPool.query(migration);
  const database = postgresD1Adapter(testPool);
  const sessionSecret = "integration-session-secret-12345678901234567890";
  const pairingPepper = "integration-pairing-pepper-12345678901234567890";
  const connectorSecret = "integration-connector-secret-12345678901234567890";
  process.env.POSTGRES_URL = isolatedConnectionUrl.toString();
  process.env.APP_SESSION_SECRET = sessionSecret;
  process.env.PAIRING_PEPPER = pairingPepper;
  process.env.CONNECTOR_TOKEN_SECRET = connectorSecret;
  process.env.RULE_ADMIN_EMAILS = "owner-one@example.com";
  const env = {
    DB: database,
    APP_SESSION_SECRET: sessionSecret,
    PAIRING_PEPPER: pairingPepper,
    CONNECTOR_TOKEN_SECRET: connectorSecret,
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("postgres-integration", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const firstCookie = await sessionCookie("owner-one@example.com", "Owner One", sessionSecret);
  const secondCookie = await sessionCookie("owner-two@example.com", "Owner Two", sessionSecret);
  const idleCookie = await sessionCookie("owner-one@example.com", "Owner One", sessionSecret, Date.now() - 31 * 60_000);
  const idleSession = await api(worker, env, "/api/v1/accounts", { cookie: idleCookie });
  assert.equal(idleSession.status, 401);
  const touchedSession = await api(worker, env, "/api/auth/session", { method: "POST", cookie: firstCookie });
  assert.equal(touchedSession.status, 200);
  assert.match(touchedSession.headers.get("set-cookie") ?? "", /fundedfence_session=/);

  const firstCode = await createPairingCode(worker, env, firstCookie);
  const replacementCode = await createPairingCode(worker, env, firstCookie);
  assert.equal(replacementCode.accountId, firstCode.accountId);
  assert.equal(replacementCode.reusingWorkspace, true);
  assert.equal(replacementCode.replacingDevice, false);
  const replacedAttempt = await pairConnector(worker, env, firstCode.pairingCode);
  assert.equal(replacedAttempt.status, 401);
  assert.match(await replacedAttempt.text(), /pairing_rejected/);

  const concurrentPairAttempts = await Promise.all([
    pairConnector(worker, env, replacementCode.pairingCode),
    pairConnector(worker, env, replacementCode.pairingCode),
  ]);
  assert.equal(concurrentPairAttempts.filter((response) => response.status === 200).length, 1);
  assert.ok(concurrentPairAttempts.every((response) => [200, 400, 401].includes(response.status)));
  const pairedResponse = concurrentPairAttempts.find((response) => response.status === 200);
  assert.ok(pairedResponse);
  const paired = await pairedResponse.json();
  assert.equal(paired.accountId, replacementCode.accountId);

  const profilesResponse = await api(worker, env, "/api/v1/rule-profiles", { cookie: firstCookie });
  assert.equal(profilesResponse.status, 200);
  const profilePayload = await profilesResponse.json();
  assert.equal(profilePayload.canAdmin, true);
  const phaseOneProfile = profilePayload.profiles.find((profile) => profile.programCode === "fundednext-stellar-2-step" && profile.phase === "Phase 1");
  assert.ok(phaseOneProfile);
  assert.equal(phaseOneProfile.versions[0].status, "validated");
  assert.ok(phaseOneProfile.versions[0].sources.length >= 5);
  const ruleVersionId = phaseOneProfile.versions[0].id;
  const approval = await api(worker, env, "/api/v1/rule-profiles", { method: "POST", cookie: firstCookie, body: { action: "approve", versionId: ruleVersionId } });
  if (approval.status !== 200) assert.fail(`Rule approval failed: ${await approval.text()}`);
  const activation = await api(worker, env, "/api/v1/rule-profiles", { method: "POST", cookie: firstCookie, body: { action: "activate", versionId: ruleVersionId } });
  if (activation.status !== 200) assert.fail(`Rule activation failed: ${await activation.text()}`);
  const activationPayload = await activation.json();
  assert.equal(activationPayload.affectedAccounts, 1);
  const assignedRule = await testPool.query("SELECT program_id, rule_version_id FROM trading_accounts WHERE id = $1", [paired.accountId]);
  assert.equal(assignedRule.rows[0].program_id, phaseOneProfile.programId);
  assert.equal(assignedRule.rows[0].rule_version_id, ruleVersionId);
  const recalculation = await testPool.query("SELECT status, reason FROM rule_recalculation_jobs WHERE trading_account_id = $1 AND to_rule_version_id = $2", [paired.accountId, ruleVersionId]);
  assert.deepEqual(recalculation.rows[0], { status: "pending", reason: "rule-version-activation" });

  const refreshResponse = await api(worker, env, "/api/v1/connector/refresh", { method: "POST", headers: { authorization: `Bearer ${paired.refreshToken}` }, body: {} });
  assert.equal(refreshResponse.status, 200);
  const refreshedCredential = await refreshResponse.json();
  assert.match(refreshedCredential.accessToken, /^[^.]+\.[a-f0-9]{64}$/);

  const reusedAttempt = await pairConnector(worker, env, replacementCode.pairingCode);
  assert.equal(reusedAttempt.status, 401);
  assert.match(await reusedAttempt.text(), /pairing_rejected/);

  const acceptedEnvelope = heartbeatEnvelope(paired, 1, `evt_${paired.deviceId}_1`);
  const accepted = await sendEnvelope(worker, env, refreshedCredential.accessToken, acceptedEnvelope);
  assert.equal(accepted.status, 202);
  const duplicate = await sendEnvelope(worker, env, refreshedCredential.accessToken, acceptedEnvelope);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  const outOfOrder = await sendEnvelope(worker, env, refreshedCredential.accessToken, heartbeatEnvelope(paired, 1, `evt_${paired.deviceId}_replay`));
  assert.equal(outOfOrder.status, 409);
  assert.match(await outOfOrder.text(), /sequence_out_of_order/);

  const expiringCode = await createPairingCode(worker, env, firstCookie);
  await testPool.query("UPDATE pairing_codes SET expires_at = $1 WHERE trading_account_id = $2", [new Date(Date.now() - 1_000).toISOString(), expiringCode.accountId]);
  const expiredAttempt = await pairConnector(worker, env, expiringCode.pairingCode);
  assert.equal(expiredAttempt.status, 401);
  assert.match(await expiredAttempt.text(), /pairing_rejected/);

  const rePairCode = await createPairingCode(worker, env, firstCookie, paired.accountId);
  assert.equal(rePairCode.replacingDevice, true);
  assert.equal(rePairCode.accountId, paired.accountId);
  const revokedRefresh = await api(worker, env, "/api/v1/connector/refresh", { method: "POST", headers: { authorization: `Bearer ${paired.refreshToken}` }, body: {} });
  assert.equal(revokedRefresh.status, 401);
  assert.match(await revokedRefresh.text(), /connector_revoked/);
  const deviceState = await testPool.query("SELECT COUNT(*)::integer AS active_devices FROM connector_devices WHERE trading_account_id = $1 AND revoked_at IS NULL", [paired.accountId]);
  assert.equal(deviceState.rows[0].active_devices, 0);

  const otherAccount = await createPairingCode(worker, env, secondCookie);
  const isolatedLive = await api(worker, env, `/api/v1/accounts/${paired.accountId}/live`, { cookie: secondCookie });
  assert.equal(isolatedLive.status, 404);
  const isolatedList = await api(worker, env, "/api/v1/accounts", { cookie: secondCookie });
  assert.equal(isolatedList.status, 200);
  const isolatedAccounts = (await isolatedList.json()).accounts;
  assert.deepEqual(isolatedAccounts.map((account) => account.id), [otherAccount.accountId]);

  const replacementPairResponse = await pairConnector(worker, env, rePairCode.pairingCode);
  assert.equal(replacementPairResponse.status, 200);
  const replacementPair = await replacementPairResponse.json();
  assert.equal(replacementPair.accountId, paired.accountId);
  assert.notEqual(replacementPair.deviceId, paired.deviceId);
  const activeDevices = await testPool.query("SELECT COUNT(*)::integer AS active_devices FROM connector_devices WHERE trading_account_id = $1 AND revoked_at IS NULL", [paired.accountId]);
  assert.equal(activeDevices.rows[0].active_devices, 1);
  const offlineAt = new Date().toISOString();
  await testPool.query("INSERT INTO alerts (id, trading_account_id, severity, alert_type, title, evidence_json, deduplication_key, created_at, updated_at) VALUES ('alert_offline_test', $1, 'critical', 'connector.offline', 'Live protection paused', '{}', $2, $3, $3)", [paired.accountId, `${paired.accountId}:offline:test`, offlineAt]);
  const reconnect = await sendEnvelope(worker, env, replacementPair.accessToken, heartbeatEnvelope(replacementPair, 1, `evt_${replacementPair.deviceId}_1`));
  assert.equal(reconnect.status, 202);
  const resolvedOffline = await testPool.query("SELECT resolved_at FROM alerts WHERE id = 'alert_offline_test'");
  assert.ok(resolvedOffline.rows[0].resolved_at);
  const firstReconciliation = await sendEnvelope(worker, env, replacementPair.accessToken, snapshotEnvelope(replacementPair, 2, {
    positions: [positionPayload("2001", "100000")],
    pendingOrders: [pendingOrderPayload("3001")],
  }));
  assert.equal(firstReconciliation.status, 202);
  const firstRiskState = await testPool.query("SELECT rule_version_id, reset_key, initial_balance_minor, state_version FROM account_risk_states WHERE trading_account_id = $1", [paired.accountId]);
  assert.equal(firstRiskState.rows[0].rule_version_id, ruleVersionId);
  assert.equal(firstRiskState.rows[0].initial_balance_minor, "10000000");
  assert.equal(firstRiskState.rows[0].state_version, 1);
  const firstRiskCalculation = await testPool.query("SELECT engine_version, status, input_json, intermediate_json, output_json, explanation_json FROM risk_calculations WHERE trading_account_id = $1 ORDER BY calculated_at DESC LIMIT 1", [paired.accountId]);
  assert.equal(firstRiskCalculation.rows[0].engine_version, "1.0.0");
  assert.equal(firstRiskCalculation.rows[0].status, "healthy");
  const firstRiskOutput = JSON.parse(firstRiskCalculation.rows[0].output_json);
  assert.equal(firstRiskOutput.guardian.remainingDailyBufferMinor, "501250");
  assert.equal(firstRiskOutput.guardian.remainingTotalBufferMinor, "1000000");
  assert.equal(firstRiskOutput.guardian.scenarios.allStopsReached.breached, true);
  assert.ok(JSON.parse(firstRiskCalculation.rows[0].input_json).guardian);
  assert.ok(JSON.parse(firstRiskCalculation.rows[0].intermediate_json).resetKey);
  assert.ok(JSON.parse(firstRiskCalculation.rows[0].explanation_json).length >= 2);
  const calendarFetchedAt = new Date().toISOString();
  const calendarEventAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const calendarCoveredThrough = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  await testPool.query("INSERT INTO economic_events (id, provider, external_id, title, currency, impact, scheduled_at, forecast, previous, revision_hash, raw_json, fetched_at, created_at, updated_at) VALUES ('econ_ghost', 'faireconomy', 'ghost', 'Removed event', 'USD', 'high', $1, NULL, NULL, 'old-revision', '{}', $2, $2, $2)", [new Date(Date.now() + 30 * 60_000).toISOString(), new Date(Date.now() - 60 * 60_000).toISOString()]);
  await testPool.query("INSERT INTO economic_events (id, provider, external_id, title, currency, impact, scheduled_at, forecast, previous, revision_hash, raw_json, fetched_at, created_at, updated_at) VALUES ('econ_test_cpi', 'faireconomy', 'test-cpi', 'US CPI', 'USD', 'high', $1, '0.2%', '0.3%', 'revision-test', '{}', $2, $2, $2)", [calendarEventAt, calendarFetchedAt]);
  await testPool.query("INSERT INTO calendar_sync_states (provider, status, fetched_at, covered_through, error, updated_at) VALUES ('faireconomy', 'healthy', $1, $2, NULL, $1)", [calendarFetchedAt, calendarCoveredThrough]);
  const liveRiskResponse = await api(worker, env, `/api/v1/accounts/${paired.accountId}/live`, { cookie: firstCookie });
  assert.equal(liveRiskResponse.status, 200);
  const liveRiskPayload = await liveRiskResponse.json();
  assert.equal(liveRiskPayload.riskCalculation.engineVersion, "1.0.0");
  assert.equal(liveRiskPayload.riskCalculation.ruleVersionId, ruleVersionId);
  assert.equal(liveRiskPayload.commandCentre.news.availability, "calculated");
  assert.equal(liveRiskPayload.commandCentre.news.nextEvent.title, "US CPI");
  assert.deepEqual(liveRiskPayload.commandCentre.news.nextEvent.affectedSymbols, ["EURUSD", "GBPUSD"]);
  assert.equal(liveRiskPayload.commandCentre.news.nextEvent.qualification, "unverified");
  const savedPlan = await api(worker, env, `/api/v1/accounts/${paired.accountId}/daily-plan`, { method: "PUT", cookie: firstCookie, body: { riskBudgetMinor: "100000", maxRiskPerTradeMinor: "60000", maxTrades: 2, lossStopMinor: "50000", profitLockMinor: "75000", preservationMode: "profit-lock" } });
  assert.equal(savedPlan.status, 200);
  assert.equal((await savedPlan.json()).dailyPlan.version, 1);
  const isolatedPlan = await api(worker, env, `/api/v1/accounts/${paired.accountId}/daily-plan`, { cookie: secondCookie });
  assert.equal(isolatedPlan.status, 404);
  const plannedLive = await api(worker, env, `/api/v1/accounts/${paired.accountId}/live`, { cookie: firstCookie });
  const plannedPayload = await plannedLive.json();
  assert.equal(plannedPayload.dailyPlan.riskBudgetMinor, "100000");
  assert.ok(plannedPayload.riskActions.some((action) => action.type === "exposure.trade-limit"));
  assert.ok(plannedPayload.riskActions.some((action) => action.type === "exposure.combined"));
  assert.equal(plannedPayload.commandCentre.news.availability, "calculated");
  assert.equal(plannedPayload.commandCentre.sessions.availability, "calculated");
  assert.deepEqual(plannedPayload.commandCentre.sessions.symbols.map((row) => [row.symbol, row.isOpen]), [["EURUSD", true], ["GBPUSD", true]]);
  assert.equal(plannedPayload.commandCentre.notifications.activeCount >= 2, true);
  assert.equal(plannedPayload.commandCentre.tradingDay.historyComplete, false);
  const action = plannedPayload.riskActions[0];
  const acknowledged = await api(worker, env, `/api/v1/accounts/${paired.accountId}/risk-actions`, { method: "PATCH", cookie: firstCookie, body: { actionId: action.id, transition: "acknowledge" } });
  assert.equal(acknowledged.status, 200);
  const isolatedAction = await api(worker, env, `/api/v1/accounts/${paired.accountId}/risk-actions`, { method: "PATCH", cookie: secondCookie, body: { actionId: action.id, transition: "acknowledge" } });
  assert.equal(isolatedAction.status, 404);
  const actionCount = await testPool.query("SELECT COUNT(*)::integer AS count FROM alerts WHERE trading_account_id = $1 AND alert_type LIKE 'exposure.%'", [paired.accountId]);
  assert.equal(actionCount.rows[0].count, 2);
  const simulation = await api(worker, env, `/api/v1/accounts/${paired.accountId}/simulate`, { method: "POST", cookie: firstCookie, body: { withdrawalMinor: "100000", gapReserveMinor: "5000" } });
  assert.equal(simulation.status, 200);
  const simulationPayload = await simulation.json();
  assert.equal(simulationPayload.guardian.safeAdditionalRiskMinor, "496250");
  assert.equal(simulationPayload.guardian.scenarios.withdrawal.availability, "calculated");
  const isolatedSimulation = await api(worker, env, `/api/v1/accounts/${paired.accountId}/simulate`, { method: "POST", cookie: secondCookie, body: { withdrawalMinor: "100000" } });
  assert.equal(isolatedSimulation.status, 404);
  const missingStopPosition = { ...positionPayload("2001", "100000"), stopLossPricePoints: null };
  const missingStopSnapshot = await sendEnvelope(worker, env, replacementPair.accessToken, snapshotEnvelope(replacementPair, 3, { positions: [missingStopPosition], pendingOrders: [] }));
  assert.equal(missingStopSnapshot.status, 202);
  const missingStopAction = await testPool.query("SELECT id FROM alerts WHERE trading_account_id = $1 AND alert_type = 'stop.missing' AND resolved_at IS NULL", [paired.accountId]);
  assert.equal(missingStopAction.rowCount, 1);
  const manuallyResolved = await api(worker, env, `/api/v1/accounts/${paired.accountId}/risk-actions`, { method: "PATCH", cookie: firstCookie, body: { actionId: missingStopAction.rows[0].id, transition: "resolve", reason: "Checking the terminal." } });
  assert.equal(manuallyResolved.status, 200);
  const repeatedMissingStop = await sendEnvelope(worker, env, replacementPair.accessToken, snapshotEnvelope(replacementPair, 4, { positions: [missingStopPosition], pendingOrders: [] }));
  assert.equal(repeatedMissingStop.status, 202);
  const reopenedMissingStop = await testPool.query("SELECT resolved_at FROM alerts WHERE id = $1", [missingStopAction.rows[0].id]);
  assert.equal(reopenedMissingStop.rows[0].resolved_at, null);
  const partialClose = await sendEnvelope(worker, env, replacementPair.accessToken, tradeEnvelope(replacementPair, 5));
  assert.equal(partialClose.status, 202);
  const secondReconciliation = await sendEnvelope(worker, env, replacementPair.accessToken, snapshotEnvelope(replacementPair, 6, {
    positions: [positionPayload("2001", "60000")],
    pendingOrders: [],
  }));
  assert.equal(secondReconciliation.status, 202);
  const resolvedMissingStop = await testPool.query("SELECT resolved_at FROM alerts WHERE trading_account_id = $1 AND alert_type = 'stop.missing'", [paired.accountId]);
  assert.ok(resolvedMissingStop.rows[0].resolved_at);
  const riskHistory = await testPool.query("SELECT output_json FROM risk_calculations WHERE trading_account_id = $1 ORDER BY calculated_at ASC", [paired.accountId]);
  assert.equal(riskHistory.rowCount, 4);
  const latestRiskOutput = JSON.parse(riskHistory.rows[3].output_json);
  assert.equal(latestRiskOutput.consistency.closedTradeCount, 1);
  assert.equal(latestRiskOutput.consistency.bestDayShareBps, 10000);
  const payoutSimulation = await api(worker, env, `/api/v1/accounts/${paired.accountId}/simulate`, { method: "POST", cookie: firstCookie, body: { payoutPeriodStart: new Date(Date.now() - 86_400_000).toISOString(), payoutPeriodEnd: new Date(Date.now() + 86_400_000).toISOString() } });
  assert.equal(payoutSimulation.status, 200);
  const payoutPayload = await payoutSimulation.json();
  assert.equal(payoutPayload.consistency.metrics.closedTradeCount, 1);
  assert.ok(payoutPayload.consistency.period.startsAt);
  const completedRecalculation = await testPool.query("SELECT status, completed_at FROM rule_recalculation_jobs WHERE trading_account_id = $1 AND to_rule_version_id = $2", [paired.accountId, ruleVersionId]);
  assert.equal(completedRecalculation.rows[0].status, "completed");
  assert.ok(completedRecalculation.rows[0].completed_at);
  const normalizedDeal = await testPool.query("SELECT position_ticket, entry_type, volume_units, profit_minor, commission_minor, swap_minor, fee_minor FROM deals WHERE trading_account_id = $1 AND ticket = '4001'", [paired.accountId]);
  assert.deepEqual(normalizedDeal.rows[0], { position_ticket: "2001", entry_type: 1, volume_units: "40000", profit_minor: "1250", commission_minor: "-240", swap_minor: "-35", fee_minor: "-10" });
  const normalizedPosition = await testPool.query("SELECT volume_units FROM positions WHERE trading_account_id = $1 AND ticket = '2001'", [paired.accountId]);
  assert.equal(normalizedPosition.rows[0].volume_units, "60000");
  const normalizedOrder = await testPool.query("SELECT closed_at FROM pending_orders WHERE trading_account_id = $1 AND ticket = '3001'", [paired.accountId]);
  assert.ok(normalizedOrder.rows[0].closed_at);
  const connection = await testPool.query("SELECT state, last_heartbeat_at FROM account_connections WHERE trading_account_id = $1", [paired.accountId]);
  assert.equal(connection.rows[0].state, "live");
  assert.ok(connection.rows[0].last_heartbeat_at);
  const movedStop = { ...positionPayload("2001", "60000"), stopLossPricePoints: "109000" };
  assert.equal((await sendEnvelope(worker, env, replacementPair.accessToken, snapshotEnvelope(replacementPair, 7, { positions: [movedStop], pendingOrders: [] }))).status, 202);
  assert.equal((await sendEnvelope(worker, env, replacementPair.accessToken, snapshotEnvelope(replacementPair, 8, { positions: [movedStop], pendingOrders: [] }))).status, 202);
  const persistentMovedStop = await testPool.query("SELECT resolved_at FROM alerts WHERE trading_account_id = $1 AND alert_type = 'stop.moved-away'", [paired.accountId]);
  assert.equal(persistentMovedStop.rows[0].resolved_at, null);
  assert.equal((await sendEnvelope(worker, env, replacementPair.accessToken, snapshotEnvelope(replacementPair, 9, { positions: [positionPayload("2001", "60000")], pendingOrders: [] }))).status, 202);
  const restoredStop = await testPool.query("SELECT resolved_at FROM alerts WHERE trading_account_id = $1 AND alert_type = 'stop.moved-away'", [paired.accountId]);
  assert.ok(restoredStop.rows[0].resolved_at);
});

async function createPairingCode(worker, env, cookie, accountId) {
  const response = await api(worker, env, "/api/v1/pairing-codes", {
    method: "POST",
    cookie,
    body: {
      accountId,
      accountLabel: "$100,000 Phase 1",
      accountSizeMinor: "10000000",
      accountPrice: "$549.99",
      currency: "USD",
      firmId: "fundednext",
      firmLabel: "FundedNext",
      programId: "fundednext-stellar-2-step",
      programLabel: "Stellar 2-Step",
      phase: "Phase 1",
      platform: "mt5",
    },
  });
  if (response.status !== 201) assert.fail(`Expected pairing code creation to return 201: ${await response.text()}`);
  return response.json();
}

function pairConnector(worker, env, pairingCode) {
  return api(worker, env, "/api/v1/connector/pair", {
    method: "POST",
    body: {
      pairingCode,
      hashedLogin: "a".repeat(64),
      serverIdentity: "FundedNext-Server3",
      platformVersion: "5836",
      connectorVersion: "0.3.0",
    },
  });
}

function heartbeatEnvelope(pairing, sequence, idempotencyKey) {
  const now = new Date().toISOString();
  return {
    accountId: pairing.accountId,
    connectorId: pairing.deviceId,
    eventType: "heartbeat",
    idempotencyKey,
    occurredAt: now,
    payload: { connectorVersion: "0.3.0", ordersPending: 0, positionsOpen: 0, terminalConnected: true, tradeAllowed: true },
    protocolVersion: "1.1",
    sentAt: now,
    sequence,
    terminalIdentityHash: "a".repeat(64),
  };
}

function snapshotEnvelope(pairing, sequence, { positions, pendingOrders }) {
  const now = new Date().toISOString();
  const dayOfWeek = new Date(now).getUTCDay();
  const symbolSessions = [...new Set([...positions, ...pendingOrders].map((item) => item.symbol))].map((symbol) => ({ symbol, dayOfWeek, fromSeconds: 0, toSeconds: 0 }));
  return {
    accountId: pairing.accountId,
    connectorId: pairing.deviceId,
    eventType: "reconciliation",
    idempotencyKey: `evt_${pairing.deviceId}_${sequence}`,
    occurredAt: now,
    payload: {
      account: { balanceMinor: "10000000", equityMinor: "10001250", marginMinor: "25000", freeMarginMinor: "9976250", floatingPnlMinor: "1250", serverTime: now },
      positions,
      pendingOrders,
      pendingOrderCount: pendingOrders.length,
      symbolSessions,
    },
    protocolVersion: "1.1",
    sentAt: now,
    sequence,
    terminalIdentityHash: "a".repeat(64),
  };
}

function positionPayload(ticket, volumeUnits) {
  return {
    ticket,
    symbol: "EURUSD",
    direction: "buy",
    volumeUnits,
    openPricePoints: "110000",
    currentPricePoints: "110125",
    stopLossPricePoints: "109500",
    takeProfitPricePoints: "111000",
    priceDigits: 5,
    tickSizePoints: "1",
    tickValueLossMinorPerLot: "100",
    swapMinor: "-35",
    floatingPnlMinor: "1250",
    openedAt: new Date().toISOString(),
  };
}

function pendingOrderPayload(ticket) {
  return {
    ticket,
    symbol: "GBPUSD",
    orderType: 2,
    volumeInitialUnits: "50000",
    volumeCurrentUnits: "50000",
    openPricePoints: "128000",
    stopLossPricePoints: "127500",
    takeProfitPricePoints: "129000",
    placedAt: new Date().toISOString(),
    expiresAt: null,
  };
}

function tradeEnvelope(pairing, sequence) {
  const now = new Date().toISOString();
  return {
    accountId: pairing.accountId,
    connectorId: pairing.deviceId,
    eventType: "trade.transaction",
    idempotencyKey: `evt_${pairing.deviceId}_${sequence}`,
    occurredAt: now,
    payload: {
      transactionType: 6,
      orderTicket: "3002",
      dealTicket: "4001",
      positionTicket: "2001",
      deal: { ticket: "4001", orderTicket: "3002", positionTicket: "2001", symbol: "EURUSD", dealType: 1, entryType: 1, volumeUnits: "40000", pricePoints: "110125", profitMinor: "1250", commissionMinor: "-240", swapMinor: "-35", feeMinor: "-10", occurredAt: now },
    },
    protocolVersion: "1.1",
    sentAt: now,
    sequence,
    terminalIdentityHash: "a".repeat(64),
  };
}

async function sendEnvelope(worker, env, accessToken, envelope) {
  const body = JSON.stringify(envelope);
  const signature = await hmacHex(accessToken, body);
  return api(worker, env, "/api/v1/connector/events", {
    method: "POST",
    rawBody: body,
    headers: { authorization: `Bearer ${accessToken}`, "x-fundedfence-signature": signature },
  });
}

async function api(worker, env, path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set("cookie", options.cookie);
  let body;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
    headers.set("content-type", "application/json");
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set("content-type", "application/json");
  }
  return worker.fetch(new Request(`http://localhost${path}`, { method: options.method ?? "GET", headers, body }), env, { waitUntil() {}, passThroughOnException() {} });
}

async function sessionCookie(email, displayName, secret, lastActivityAt = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ email, displayName, expiresAt: Date.now() + 60_000, lastActivityAt })).toString("base64url");
  const signature = Buffer.from(await hmacBytes(secret, payload)).toString("base64url");
  return `fundedfence_session=${payload}.${signature}`;
}

async function hmacHex(secret, value) {
  return Buffer.from(await hmacBytes(secret, value)).toString("hex");
}

async function hmacBytes(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function postgresD1Adapter(pool) {
  return {
    prepare(sql) { return new TestPreparedStatement(pool, sql, []); },
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const statement of statements) await client.query(statement.postgresSql, statement.values);
        await client.query("COMMIT");
        return statements.map(() => ({ success: true }));
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

class TestPreparedStatement {
  constructor(pool, sql, values) {
    this.pool = pool;
    this.sql = sql;
    this.values = values;
  }
  get postgresSql() { return toPostgresSql(this.sql); }
  bind(...values) { return new TestPreparedStatement(this.pool, this.sql, values); }
  async first() { return (await this.pool.query(this.postgresSql, this.values)).rows[0] ?? null; }
  async all() { return { results: (await this.pool.query(this.postgresSql, this.values)).rows }; }
  async run() { await this.pool.query(this.postgresSql, this.values); return { success: true }; }
}

function toPostgresSql(sql) {
  let index = 0;
  const ignore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql);
  const converted = sql
    .replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO")
    .replace(/\bMAX\(0,\s*attempts_remaining\s*-\s*1\)/gi, "GREATEST(0, attempts_remaining - 1)")
    .replace(/\?/g, () => `$${++index}`);
  return ignore && !/\bON\s+CONFLICT\b/i.test(converted) ? `${converted} ON CONFLICT DO NOTHING` : converted;
}
