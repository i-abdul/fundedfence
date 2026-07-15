import { calculateDrawdown } from "@/lib/domain/drawdown";

export const demoAccount = {
  label: "Evaluation workspace",
  firm: "Illustrative ruleset",
  phase: "Phase 1 · validation sandbox",
  accountSize: "$100,000",
  balance: "$103,240.00",
  equity: "$102,870.00",
  profit: "+$3,240.00",
  profitProgress: 41,
  healthScore: 78,
  lastHeartbeat: "4 seconds ago",
  connectorVersion: "0.1.0 prototype",
};

export const demoDrawdown = calculateDrawdown({
  initialBalanceMinor: "10000000",
  startOfDayBalanceMinor: "10324000",
  highestBalanceMinor: "10324000",
  currentEquityMinor: "10287000",
  projectedStopEquityMinor: "10209000",
  dailyLossLimitBps: 500,
  maximumLossLimitBps: 1000,
  trailingLossLimitBps: 800,
  trailingMode: "balance-until-initial",
  gapReserveMinor: "40000",
});

export const demoPositions = [
  { symbol: "EURUSD", direction: "Long", volume: "0.40", entry: "1.08420", current: "1.08514", stop: "1.08180", pnl: "+$376", risk: "$960", health: "Protected" },
  { symbol: "XAUUSD", direction: "Short", volume: "0.12", entry: "2,418.60", current: "2,415.90", stop: "2,426.60", pnl: "+$324", risk: "$960", health: "Watch news" },
  { symbol: "GBPUSD", direction: "Long", volume: "0.22", entry: "1.27080", current: "1.26935", stop: "1.26740", pnl: "−$319", risk: "$748", health: "Within plan" },
];

export const ruleRows = [
  { name: "Daily loss", current: "$370 used", limit: "$5,000", buffer: "$4,630", status: "Healthy", tone: "healthy" },
  { name: "Maximum loss", current: "$0 used", limit: "$10,000", buffer: "$7,630", status: "Healthy", tone: "healthy" },
  { name: "Balance trail", current: "$95,240 floor", limit: "Locks at $100k", buffer: "$7,630", status: "Healthy", tone: "healthy" },
  { name: "Best day", current: "31.4%", limit: "40.0%", buffer: "8.6 pts", status: "Watch", tone: "caution" },
];
