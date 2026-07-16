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
  const reconnect = await sendEnvelope(worker, env, replacementPair.accessToken, heartbeatEnvelope(replacementPair, 1, `evt_${replacementPair.deviceId}_1`));
  assert.equal(reconnect.status, 202);
  const firstReconciliation = await sendEnvelope(worker, env, replacementPair.accessToken, snapshotEnvelope(replacementPair, 2, {
    positions: [positionPayload("2001", "100000")],
    pendingOrders: [pendingOrderPayload("3001")],
  }));
  assert.equal(firstReconciliation.status, 202);
  const partialClose = await sendEnvelope(worker, env, replacementPair.accessToken, tradeEnvelope(replacementPair, 3));
  assert.equal(partialClose.status, 202);
  const secondReconciliation = await sendEnvelope(worker, env, replacementPair.accessToken, snapshotEnvelope(replacementPair, 4, {
    positions: [positionPayload("2001", "60000")],
    pendingOrders: [],
  }));
  assert.equal(secondReconciliation.status, 202);
  const normalizedDeal = await testPool.query("SELECT position_ticket, entry_type, volume_units, profit_minor, commission_minor, swap_minor, fee_minor FROM deals WHERE trading_account_id = $1 AND ticket = '4001'", [paired.accountId]);
  assert.deepEqual(normalizedDeal.rows[0], { position_ticket: "2001", entry_type: 1, volume_units: "40000", profit_minor: "1250", commission_minor: "-240", swap_minor: "-35", fee_minor: "-10" });
  const normalizedPosition = await testPool.query("SELECT volume_units FROM positions WHERE trading_account_id = $1 AND ticket = '2001'", [paired.accountId]);
  assert.equal(normalizedPosition.rows[0].volume_units, "60000");
  const normalizedOrder = await testPool.query("SELECT closed_at FROM pending_orders WHERE trading_account_id = $1 AND ticket = '3001'", [paired.accountId]);
  assert.ok(normalizedOrder.rows[0].closed_at);
  const connection = await testPool.query("SELECT state, last_heartbeat_at FROM account_connections WHERE trading_account_id = $1", [paired.accountId]);
  assert.equal(connection.rows[0].state, "live");
  assert.ok(connection.rows[0].last_heartbeat_at);
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
