import assert from "node:assert/strict";
import test from "node:test";
import { mapCanonicalFxSymbol, normalizeFaireconomyFeed } from "../lib/domain/economic-calendar.ts";

test("normalizes Faireconomy events with stable identity and revision evidence", async () => {
  const input = { title: "CPI m/m", country: "CAD", date: "2026-07-20T08:30:00-04:00", impact: "High", forecast: "-0.2%", previous: "1.0%" };
  const first = (await normalizeFaireconomyFeed([input]))[0];
  const revised = (await normalizeFaireconomyFeed([{ ...input, forecast: "-0.1%" }]))[0];
  assert.equal(first.scheduledAt, "2026-07-20T12:30:00.000Z");
  assert.equal(first.impact, "high");
  assert.equal(first.externalId, revised.externalId);
  assert.notEqual(first.revisionHash, revised.revisionHash);
  assert.match(first.id, /^econ_[a-f0-9]{32}$/);
});

test("maps only reviewed canonical FX symbols", () => {
  assert.deepEqual(mapCanonicalFxSymbol("EURUSD"), { symbol: "EURUSD", status: "mapped", currencies: ["EUR", "USD"], method: "canonical-fx", reason: "Mapped from exact base and quote currency codes." });
  assert.equal(mapCanonicalFxSymbol("EURUSD.a").status, "unknown");
  assert.equal(mapCanonicalFxSymbol("XAUUSD").status, "unknown");
  assert.equal(mapCanonicalFxSymbol("US100").status, "unknown");
});

test("rejects malformed or excessive provider payloads", async () => {
  await assert.rejects(normalizeFaireconomyFeed({}), /array/i);
  await assert.rejects(normalizeFaireconomyFeed([{ title: "CPI", country: "USD", date: "not-a-date", impact: "High" }]), /date/i);
  await assert.rejects(normalizeFaireconomyFeed([{ title: "CPI", country: "USD", date: "2026-07-20T12:30:00", impact: "High" }]), /RFC 3339/i);
  const duplicate = { title: "CPI", country: "USD", date: "2026-07-20T08:30:00-04:00", impact: "High" };
  await assert.rejects(normalizeFaireconomyFeed([duplicate, duplicate]), /duplicate/i);
});
