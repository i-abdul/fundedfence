import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
const intervalMs = positiveInteger(process.env.CONNECTION_MONITOR_INTERVAL_MS, 10_000);
const delayedAfterMs = positiveInteger(process.env.CONNECTION_DELAYED_AFTER_MS, 15_000);
const offlineAfterMs = positiveInteger(process.env.CONNECTION_OFFLINE_AFTER_MS, 60_000);
const runOnce = process.argv.includes("--once");

if (!connectionString) {
  console.error("POSTGRES_URL or DATABASE_URL is required.");
  process.exit(1);
}
if (offlineAfterMs <= delayedAfterMs) {
  console.error("CONNECTION_OFFLINE_AFTER_MS must exceed CONNECTION_DELAYED_AFTER_MS.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

try {
  do {
    try {
      const result = await monitorConnections(pool, Date.now());
      if (result.transitions > 0 || result.alerts > 0) {
        console.log(`Connection monitor: ${result.transitions} state transition(s), ${result.alerts} offline alert(s).`);
      }
    } catch (error) {
      console.error("Connection monitor cycle failed:", error instanceof Error ? error.message : error);
      if (runOnce) throw error;
    }
    if (!runOnce && !stopping) await delay(intervalMs);
  } while (!runOnce && !stopping);
} finally {
  await pool.end();
}

export async function monitorConnections(databasePool, nowMs) {
  const accounts = await databasePool.query(
    "SELECT ac.trading_account_id, ac.state, ac.last_heartbeat_at, ta.organization_id FROM account_connections ac JOIN trading_accounts ta ON ta.id = ac.trading_account_id WHERE ta.status = 'connected' AND ac.last_heartbeat_at IS NOT NULL",
  );
  let transitions = 0;
  let alerts = 0;
  for (const account of accounts.rows) {
    const nowIso = new Date(nowMs).toISOString();
    const client = await databasePool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query("SELECT state, last_heartbeat_at FROM account_connections WHERE trading_account_id = $1 FOR UPDATE", [account.trading_account_id]);
      const current = currentResult.rows[0];
      const heartbeatMs = Date.parse(current?.last_heartbeat_at);
      if (!current || !Number.isFinite(heartbeatMs)) {
        await client.query("COMMIT");
        continue;
      }
      const ageMs = Math.max(0, nowMs - heartbeatMs);
      const nextState = ageMs > offlineAfterMs ? "offline" : ageMs > delayedAfterMs ? "delayed" : "live";
      if (current.state !== nextState) {
        await client.query("UPDATE account_connections SET state = $1, updated_at = $2 WHERE trading_account_id = $3", [nextState, nowIso, account.trading_account_id]);
        transitions++;
      }
      if (nextState === "offline") {
        const deduplicationKey = `connector-offline:${account.trading_account_id}:${current.last_heartbeat_at}`;
        const evidence = JSON.stringify({ lastHeartbeatAt: current.last_heartbeat_at, detectedAt: nowIso, ageSeconds: Math.floor(ageMs / 1000) });
        const alert = await client.query(
          "INSERT INTO alerts (id, trading_account_id, severity, alert_type, title, evidence_json, deduplication_key, acknowledged_at, created_at, updated_at) VALUES ($1, $2, 'critical', 'connector.offline', 'Live protection paused', $3, $4, NULL, $5, $5) ON CONFLICT(deduplication_key) DO NOTHING RETURNING id",
          [`alert_${randomUUID().replaceAll("-", "")}`, account.trading_account_id, evidence, deduplicationKey, nowIso],
        );
        if (alert.rowCount > 0) {
          const previous = await client.query("SELECT event_hash FROM audit_events WHERE organization_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 1", [account.organization_id]);
          const previousHash = previous.rows[0]?.event_hash ?? null;
          const payload = JSON.stringify({ alertType: "connector.offline", ...JSON.parse(evidence) });
          const eventHash = createHash("sha256").update(`${previousHash ?? ""}:${payload}`).digest("hex");
          await client.query(
            "INSERT INTO audit_events (id, organization_id, trading_account_id, actor_type, actor_id, event_type, occurred_at, correlation_id, payload_json, previous_hash, event_hash) VALUES ($1, $2, $3, 'system', 'connection-monitor', 'connector.offline', $4, $5, $6, $7, $8)",
            [`audit_${randomUUID().replaceAll("-", "")}`, account.organization_id, account.trading_account_id, nowIso, randomUUID(), payload, previousHash, eventHash],
          );
          alerts++;
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return { transitions, alerts };
}

function positiveInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
