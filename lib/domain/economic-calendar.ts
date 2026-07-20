export const ECONOMIC_CALENDAR_PROVIDER = "faireconomy";
export const DEFAULT_ECONOMIC_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const FX_CURRENCIES = new Set(["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD"]);

export type EconomicEvent = {
  id: string;
  externalId: string;
  title: string;
  currency: string;
  impact: "low" | "medium" | "high" | "holiday" | "unknown";
  scheduledAt: string;
  forecast: string | null;
  previous: string | null;
  revisionHash: string;
  rawJson: string;
};

export type SymbolCurrencyMapping = {
  symbol: string;
  status: "mapped" | "unknown";
  currencies: string[];
  method: "canonical-fx" | null;
  reason: string;
};

export async function normalizeFaireconomyFeed(value: unknown): Promise<EconomicEvent[]> {
  if (!Array.isArray(value)) throw new Error("Faireconomy response must be an array.");
  if (value.length > 2_000) throw new Error("Faireconomy response exceeds the event limit.");
  const events: EconomicEvent[] = [];
  const identities = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Faireconomy event is invalid.");
    const record = item as Record<string, unknown>;
    const title = requiredText(record.title, "title", 200);
    const currency = requiredText(record.country, "currency", 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Faireconomy currency is invalid.");
    const sourceDate = requiredText(record.date, "date", 50);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(sourceDate)) throw new Error("Faireconomy date must be RFC 3339 with an explicit offset.");
    const parsedDate = Date.parse(sourceDate);
    if (!Number.isFinite(parsedDate)) throw new Error("Faireconomy date is invalid.");
    const scheduledAt = new Date(parsedDate).toISOString();
    const impact = normalizeImpact(record.impact);
    const forecast = optionalText(record.forecast, 100);
    const previous = optionalText(record.previous, 100);
    // ponytail: the feed has no event ID; same-title/currency/day is the narrowest stable key available.
    const externalId = (await sha256(`${currency}:${title.toLowerCase()}:${sourceDate.slice(0, 10)}`)).slice(0, 32);
    if (identities.has(externalId)) throw new Error("Faireconomy response contains duplicate derived event identities.");
    identities.add(externalId);
    const normalized = { title, currency, impact, scheduledAt, forecast, previous };
    const rawJson = JSON.stringify(record);
    if (rawJson.length > 10_000) throw new Error("Faireconomy event exceeds the raw evidence limit.");
    events.push({ id: `econ_${externalId}`, externalId, ...normalized, revisionHash: await sha256(JSON.stringify(normalized)), rawJson });
  }
  return events;
}

export function mapCanonicalFxSymbol(symbol: string): SymbolCurrencyMapping {
  if (!/^[A-Z]{6}$/.test(symbol)) return { symbol, status: "unknown", currencies: [], method: null, reason: "Only exact six-letter canonical FX symbols are mapped." };
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3);
  if (!FX_CURRENCIES.has(base) || !FX_CURRENCIES.has(quote)) return { symbol, status: "unknown", currencies: [], method: null, reason: "The symbol contains a currency or instrument class outside the reviewed FX set." };
  return { symbol, status: "mapped", currencies: [base, quote], method: "canonical-fx", reason: "Mapped from exact base and quote currency codes." };
}

function normalizeImpact(value: unknown): EconomicEvent["impact"] {
  if (typeof value !== "string") return "unknown";
  const impact = value.trim().toLowerCase();
  return impact === "low" || impact === "medium" || impact === "high" || impact === "holiday" ? impact : "unknown";
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new Error(`Faireconomy ${field} is invalid.`);
  return value.trim();
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > maximum) throw new Error("Faireconomy optional value is invalid.");
  return value;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
