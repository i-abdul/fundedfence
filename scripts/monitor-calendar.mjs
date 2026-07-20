import pg from "pg";
import { DEFAULT_ECONOMIC_CALENDAR_URL, ECONOMIC_CALENDAR_PROVIDER, normalizeFaireconomyFeed } from "../lib/domain/economic-calendar.ts";

const { Pool } = pg;
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("POSTGRES_URL or DATABASE_URL is required.");

const enabled = process.env.ECONOMIC_CALENDAR_ENABLED === "true";
const intervalMs = boundedNumber(process.env.CALENDAR_SYNC_INTERVAL_MS, 15 * 60_000, 60_000, 25 * 60_000);
const sourceUrl = process.env.ECONOMIC_CALENDAR_URL ?? DEFAULT_ECONOMIC_CALENDAR_URL;
const pool = new Pool({ connectionString });

async function sync() {
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetch(sourceUrl, { headers: { accept: "application/json", "user-agent": "FundedFence/0.1 calendar monitor" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Calendar provider returned HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 2_000_000) throw new Error("Calendar provider response exceeds the byte limit.");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 2_000_000) throw new Error("Calendar provider response exceeds the byte limit.");
    const events = await normalizeFaireconomyFeed(JSON.parse(new TextDecoder().decode(bytes)));
    if (!events.length) throw new Error("Calendar provider returned no events.");
    const coveredThrough = events.reduce((latest, event) => event.scheduledAt > latest ? event.scheduledAt : latest, events[0].scheduledAt);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const event of events) await client.query(
        "INSERT INTO economic_events (id, provider, external_id, title, currency, impact, scheduled_at, forecast, previous, revision_hash, raw_json, fetched_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $12) ON CONFLICT(provider, external_id) DO UPDATE SET title = excluded.title, currency = excluded.currency, impact = excluded.impact, scheduled_at = excluded.scheduled_at, forecast = excluded.forecast, previous = excluded.previous, revision_hash = excluded.revision_hash, raw_json = excluded.raw_json, fetched_at = excluded.fetched_at, updated_at = excluded.updated_at",
        [event.id, ECONOMIC_CALENDAR_PROVIDER, event.externalId, event.title, event.currency, event.impact, event.scheduledAt, event.forecast, event.previous, event.revisionHash, event.rawJson, fetchedAt],
      );
      for (const event of events) await client.query("INSERT INTO economic_event_revisions (id, economic_event_id, revision_hash, raw_json, observed_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT(economic_event_id, revision_hash) DO NOTHING", [`econrev_${event.externalId}_${event.revisionHash.slice(0, 16)}`, event.id, event.revisionHash, event.rawJson, fetchedAt]);
      await client.query("INSERT INTO calendar_sync_states (provider, status, fetched_at, covered_through, error, updated_at) VALUES ($1, 'healthy', $2, $3, NULL, $2) ON CONFLICT(provider) DO UPDATE SET status = excluded.status, fetched_at = excluded.fetched_at, covered_through = excluded.covered_through, error = NULL, updated_at = excluded.updated_at", [ECONOMIC_CALENDAR_PROVIDER, fetchedAt, coveredThrough]);
      await client.query("COMMIT");
      console.log(`Calendar sync stored ${events.length} events through ${coveredThrough}.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Calendar sync failed.";
    await pool.query("INSERT INTO calendar_sync_states (provider, status, fetched_at, covered_through, error, updated_at) VALUES ($1, 'error', NULL, NULL, $2, $3) ON CONFLICT(provider) DO UPDATE SET status = excluded.status, error = excluded.error, updated_at = excluded.updated_at", [ECONOMIC_CALENDAR_PROVIDER, message, fetchedAt]);
    console.error(message);
  }
}

async function main() {
  if (!enabled) console.log("Calendar sync is disabled. Set ECONOMIC_CALENDAR_ENABLED=true after provider approval.");
  while (true) {
    if (enabled) await sync();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

process.on("SIGTERM", async () => { await pool.end(); process.exit(0); });
await main();
