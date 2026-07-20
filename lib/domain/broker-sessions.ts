const DAY_SECONDS = 86_400;
const WEEK_SECONDS = 7 * DAY_SECONDS;

export type BrokerSymbolSession = {
  symbol: string;
  dayOfWeek: number;
  fromSeconds: number;
  toSeconds: number;
};

export type BrokerSessionTransition = {
  type: "opens" | "closes" | "changes";
  remainingSeconds: number;
  symbols: string[];
};

export function validateBrokerSessions(value: unknown): BrokerSymbolSession[] {
  if (!Array.isArray(value)) throw new Error("Snapshot symbolSessions must be an array.");
  if (value.length > 1_000) throw new Error("Snapshot symbol-session limit exceeded.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Snapshot symbol session is invalid.");
    const row = item as Record<string, unknown>;
    if (typeof row.symbol !== "string" || !row.symbol.trim() || row.symbol.length > 24) throw new Error("Snapshot symbol session symbol is invalid.");
    if (!Number.isInteger(row.dayOfWeek) || Number(row.dayOfWeek) < 0 || Number(row.dayOfWeek) > 6) throw new Error("Snapshot symbol session day is invalid.");
    if (!Number.isInteger(row.fromSeconds) || Number(row.fromSeconds) < 0 || Number(row.fromSeconds) >= DAY_SECONDS) throw new Error("Snapshot symbol session start is invalid.");
    if (!Number.isInteger(row.toSeconds) || Number(row.toSeconds) < 0 || Number(row.toSeconds) > DAY_SECONDS) throw new Error("Snapshot symbol session end is invalid.");
    return { symbol: row.symbol.trim(), dayOfWeek: Number(row.dayOfWeek), fromSeconds: Number(row.fromSeconds), toSeconds: Number(row.toSeconds) };
  });
}

export function calculateBrokerSessions(sessions: BrokerSymbolSession[], serverTime: string, observedAt: string, nowMs: number, maximumAgeSeconds = 15): {
  symbols: Array<{ symbol: string; isOpen: boolean; nextTransition: BrokerSessionTransition | null }>;
  nextTransition: BrokerSessionTransition | null;
} | null {
  const broker = parseBrokerTime(serverTime);
  const observedMs = Date.parse(observedAt);
  if (!broker || !Number.isFinite(observedMs) || !sessions.length) return null;
  const ageSeconds = Math.floor((nowMs - observedMs) / 1000);
  if (ageSeconds < 0 || ageSeconds > maximumAgeSeconds) return null;
  const current = (broker.dayOfWeek * DAY_SECONDS + broker.seconds + ageSeconds) % WEEK_SECONDS;
  const grouped = new Map<string, BrokerSymbolSession[]>();
  for (const session of sessions) grouped.set(session.symbol, [...(grouped.get(session.symbol) ?? []), session]);
  const symbols = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([symbol, rows]) => symbolState(symbol, rows, current));
  const upcoming = symbols.map((row) => row.nextTransition).filter((value): value is BrokerSessionTransition => value !== null);
  const remaining = Math.min(...upcoming.map((value) => value.remainingSeconds));
  const next = upcoming.filter((value) => value.remainingSeconds === remaining);
  return {
    symbols,
    nextTransition: next.length ? { type: next.every((value) => value.type === next[0].type) ? next[0].type : "changes", remainingSeconds: remaining, symbols: next.flatMap((value) => value.symbols) } : null,
  };
}

function symbolState(symbol: string, sessions: BrokerSymbolSession[], current: number): { symbol: string; isOpen: boolean; nextTransition: BrokerSessionTransition | null } {
  const intervals = sessions.map((session) => {
    if (!Number.isInteger(session.dayOfWeek) || session.dayOfWeek < 0 || session.dayOfWeek > 6 || !Number.isInteger(session.fromSeconds) || session.fromSeconds < 0 || session.fromSeconds >= DAY_SECONDS || !Number.isInteger(session.toSeconds) || session.toSeconds < 0 || session.toSeconds > DAY_SECONDS) throw new Error("Broker session is invalid.");
    const start = session.dayOfWeek * DAY_SECONDS + session.fromSeconds;
    const duration = session.fromSeconds === session.toSeconds || session.toSeconds === DAY_SECONDS ? DAY_SECONDS - session.fromSeconds : (session.toSeconds - session.fromSeconds + DAY_SECONDS) % DAY_SECONDS;
    return { start, end: start + duration };
  });
  const isOpen = openAt(intervals, current);
  const candidates = intervals.flatMap(({ start, end }) => [start, end]).flatMap((value) => [value, value + WEEK_SECONDS]).filter((value) => value > current && value <= current + WEEK_SECONDS).sort((a, b) => a - b);
  const transitionAt = candidates.find((value) => openAt(intervals, value - 1) !== openAt(intervals, value));
  return { symbol, isOpen, nextTransition: transitionAt === undefined ? null : { type: openAt(intervals, transitionAt) ? "opens" : "closes", remainingSeconds: transitionAt - current, symbols: [symbol] } };
}

function openAt(intervals: Array<{ start: number; end: number }>, value: number): boolean {
  const current = ((value % WEEK_SECONDS) + WEEK_SECONDS) % WEEK_SECONDS;
  return intervals.some(({ start, end }) => (current >= start && current < end) || (current + WEEK_SECONDS >= start && current + WEEK_SECONDS < end));
}

function parseBrokerTime(value: string): { dayOfWeek: number; seconds: number } | null {
  const match = /^(\d{4})[.-](\d{2})[.-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const second = Number(match[6] ?? 0);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  return { dayOfWeek: date.getUTCDay(), seconds: hour * 3_600 + minute * 60 + second };
}
