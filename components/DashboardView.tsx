"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { demoAccount, demoPositions, ruleRows } from "@/lib/product/demo-account";

type DashboardLiveState = {
  account?: {
    id?: string;
    label?: string;
    account_size_minor?: string;
    currency?: string;
    status?: string;
    rule_version_id?: string | null;
    state?: string | null;
    last_heartbeat_at?: string | null;
    last_snapshot_at?: string | null;
    risk_calculated_at?: string | null;
  };
  snapshot?: {
    observed_at?: string;
    balance_minor?: string;
    equity_minor?: string;
    margin_minor?: string;
    free_margin_minor?: string;
    floating_pnl_minor?: string;
    server_time?: string;
  } | null;
  positions?: Array<{
    ticket: string;
    symbol: string;
    direction: "buy" | "sell";
    volume_units: string;
    open_price_points: string;
    current_price_points: string;
    stop_loss_price_points: string | null;
    take_profit_price_points: string | null;
    price_digits: number | null;
    tick_size_points: string | null;
    tick_value_loss_minor_per_lot: string | null;
    swap_minor: string | null;
    floating_pnl_minor: string;
    risk_at_stop_minor: string | null;
  }>;
  riskSummary?: {
    known_risk_minor: string;
    positions_without_stop: number;
    positions_without_metadata: number;
    all_positions_covered: boolean;
  };
  riskCalculation?: {
    id: string;
    ruleVersionId: string;
    status: GuardianStatus;
    engineVersion: string;
    explanationVersion: string;
    calculatedAt: string;
    output: { guardian?: GuardianOutput; consistency?: ConsistencyOutput };
    explanations: string[];
  } | null;
  dailyPlan?: DailyRiskPlan | null;
  dailyPlanStatus?: {
    riskBudgetRemainingMinor: string | null;
    knownRiskMinor: string;
    riskCoverageComplete: boolean;
  } | null;
  riskActions?: RiskAction[];
  riskActionHistory?: RiskAction[];
  riskActionAvailability?: {
    marketClose: "unknown";
    marketCloseReason: string;
    healthScore: "not-calculated";
    healthScoreReason: string;
    dealHistory: "calculated" | "unknown";
    dealHistoryReason: string;
  };
  commandCentre?: CommandCentre;
  dataFreshness?: "live" | "delayed" | "offline";
};

type CommandCentre = {
  generatedAt: string;
  news: { availability: "unknown" | "calculated"; reason: string; coveredThrough: string | null; treatment: { mode: "allowed" | "allowed-reward-adjustment"; label: string; windowMinutesBefore: number; windowMinutesAfter: number; qualifyingProfitBps: number; affectedInstrumentsOnly: boolean } | null; nextEvent: null | { id: string; title: string; currency: string; impact: string; scheduledAt: string; remainingSeconds: number; affectedSymbols: string[]; qualification: "unverified"; windowStartsAt: string | null; windowEndsAt: string | null; source: { provider: string; authorityClass: string; revisionHash: string } } };
  sessions: { availability: "unknown" | "calculated"; reason: string; symbols: Array<{ symbol: string; isOpen: boolean }>; nextTransition: null | { type: "opens" | "closes" | "changes"; remainingSeconds: number; symbols: string[] } };
  tradingDay: { availability: "unknown" | "calculated"; reason: string; resetKey: string | null; resetRemainingSeconds: number | null; equityChangeMinor: string | null; entryCount: number | null; historyComplete: boolean };
  notifications: { activeCount: number; latest: Array<{ id: string; type: string; severity: string; title: string; detectedAt: string }>; email: "not-configured" };
  sessionAnalytics: { availability: "unknown" | "calculated"; reason: string; rows: Array<{ label: string; executionCount: number; netResultMinor: string }> };
};

type DailyRiskPlan = {
  id: string;
  resetKey: string;
  version: number;
  riskBudgetMinor: string;
  maxRiskPerTradeMinor: string;
  maxTrades: number;
  lossStopMinor: string;
  profitLockMinor: string;
  preservationMode: "off" | "manual" | "profit-lock";
  profitLockTriggeredAt: string | null;
  updatedAt: string;
};

type RiskAction = {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "info";
  priority: number;
  title: string;
  evidence: Record<string, unknown>;
  state: "open" | "acknowledged" | "resolved" | "dismissed";
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  dismissedAt: string | null;
  resolutionReason: string | null;
  lastDetectedAt: string;
};

type GuardianStatus = "healthy" | "caution" | "critical" | "breached";

type GuardianScenario = {
  availability: "calculated" | "unknown" | "not-requested";
  projectedBalanceMinor: string | null;
  projectedEquityMinor: string | null;
  remainingDailyBufferMinor: string | null;
  remainingTotalBufferMinor: string | null;
  breached: boolean | null;
  reason: string;
};

type GuardianOutput = {
  dailyFloorMinor: string | null;
  staticTotalFloorMinor: string;
  trailingTotalFloorMinor: string | null;
  effectiveTotalFloorMinor: string;
  currentDailyReferenceMinor: string | null;
  currentTotalReferenceMinor: string;
  remainingDailyBufferMinor: string | null;
  remainingTotalBufferMinor: string;
  closestBufferMinor: string;
  safeAdditionalRiskMinor: string;
  status: GuardianStatus;
  scenarios: {
    allStopsReached: GuardianScenario;
    nextReset: GuardianScenario;
    closePositionsNow: GuardianScenario;
    withdrawal: GuardianScenario;
  };
};

type ConsistencyOutput = {
  totalNetProfitMinor: string;
  bestDayProfitMinor: string;
  bestDayShareBps: number | null;
  profitableDayCount: number;
  tradingDayCount: number;
  closedTradeCount: number;
  largestClosedVolumeUnits: string;
  averageClosedVolumeUnits: string | null;
  largestToAverageVolumeBps: number | null;
  riskConsistencyStatus: "unknown";
};

type AccountListItem = {
  id: string;
  label: string;
  account_size_minor: string;
  currency: string;
  status: string;
  state: string | null;
  data_freshness: "live" | "delayed" | "offline";
};

export function DashboardView({ userLabel }: { userLabel?: string }) {
  const { liveState, loading, accounts, selectedAccountId, selectAccount, refresh } = useLiveAccount();
  const liveAccount = liveState?.account;
  const liveSnapshot = liveState?.snapshot;
  const liveMode = Boolean(liveAccount);
  const currency = liveAccount?.currency ?? "USD";
  const freshness = liveState?.dataFreshness ?? "offline";
  const livePositions = liveState?.positions ?? [];
  const riskSummary = liveState?.riskSummary;
  const riskCalculation = liveState?.riskCalculation ?? null;
  const guardian = riskCalculation?.output.guardian;
  const consistency = riskCalculation?.output.consistency;
  const riskActive = Boolean(guardian);
  const riskActions = liveState?.riskActions ?? [];
  const commandCentre = liveState?.commandCentre;

  return (
    <main className="dashboard-shell">
      <div className="demo-banner" role="note">
        <span className="demo-dot" />
        {liveMode
          ? liveSnapshot
            ? riskActive
              ? `Live MT5 data is protected by an immutable rule calculation from engine ${riskCalculation?.engineVersion}.`
              : "Live MT5 balances, positions, and stop risk are shown. Firm rule limits remain disabled until the selected profile is approved and activated."
            : freshness === "offline"
              ? "Live protection is paused because the connector has not supplied a current snapshot."
              : "The MT5 account is paired and FundedFence is waiting for its first snapshot."
          : loading
            ? "Checking for a connected MT5 account…"
            : "Illustrative account — no verified firm rules or live connector data are shown."}
        <Link href={liveMode ? "/pairing" : "/onboarding"}>{liveMode ? "Open diagnostics" : "Start secure setup"}</Link>
      </div>
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">{userLabel ? `${userLabel}'s workspace` : "Risk command centre"}</p>
          <h1>Account overview</h1>
        </div>
        <div className="topbar-actions">
          <a className="icon-button" aria-label="View active notifications" href="#notifications">{commandCentre?.notifications.activeCount ?? riskActions.length}</a>
          <Link className="button button-primary button-small" href="/onboarding">Connect account</Link>
        </div>
      </div>

      <section className="account-strip" aria-label="Selected account">
        <div className="account-identity"><span className="mini-shield">FF</span><span>{liveMode && accounts.length > 1 ? <select className="account-selector" aria-label="Select trading account" value={selectedAccountId ?? ""} onChange={(event) => selectAccount(event.target.value)}>{accounts.map((account) => <option value={account.id} key={account.id}>{account.label} · {freshnessLabel(account.data_freshness)}</option>)}</select> : <strong>{liveAccount?.label ?? demoAccount.label}</strong>}<small>{liveMode ? accounts.length > 1 ? `${accounts.length} account workspaces · MT5` : "Connected MT5 account" : `${demoAccount.firm} · MT5`}</small></span></div>
        <span className="phase-pill">{liveMode ? liveAccount?.status ?? "connected" : demoAccount.phase}</span>
        <div className={`live-state ${freshness}`}><span /> {liveMode ? freshnessLabel(freshness) : "Live preview"} <small>{liveMode ? heartbeatLabel(liveAccount?.last_heartbeat_at) : demoAccount.lastHeartbeat}</small></div>
      </section>

      <CommandCentrePanel key={commandCentre?.generatedAt ?? "preview"} command={commandCentre} currency={currency} />

      <section className="health-grid">
        {liveMode ? guardian ? <LiveHealth guardian={guardian} openPositionCount={livePositions.length} riskSummary={riskSummary} currency={currency} /> : <PendingHealth snapshotReady={Boolean(liveSnapshot)} openPositionCount={livePositions.length} riskSummary={riskSummary} currency={currency} /> : <DemoHealth />}

        <article className="panel balance-panel">
          <div className="panel-heading"><div><p className="eyebrow">Current state</p><h2>{liveMode ? `${formatMoney(liveAccount?.account_size_minor, currency)} account` : `${demoAccount.accountSize} account`}</h2></div><button className="kebab" aria-label="Account options">···</button></div>
          <div className="balance-values"><span><small>Balance</small><strong>{liveMode ? formatMoney(liveSnapshot?.balance_minor, currency) : demoAccount.balance}</strong></span><span><small>Equity</small><strong>{liveMode ? formatMoney(liveSnapshot?.equity_minor, currency) : demoAccount.equity}</strong></span></div>
          {liveMode
            ? <div className="profit-progress"><div><span>Rule calculation</span><strong><small>{riskCalculation ? `Engine ${riskCalculation.engineVersion}` : "Awaiting effective profile"}</small></strong></div><div className="progress-track"><span style={{ width: riskCalculation ? "100%" : "0%" }} /></div><p><span>{riskCalculation ? `Calculated ${formatTimestamp(riskCalculation.calculatedAt)}` : liveSnapshot ? `Snapshot ${formatTimestamp(liveSnapshot.observed_at)}` : "No snapshot received"}</span><span>{freshnessLabel(freshness)}</span></p></div>
            : <div className="profit-progress"><div><span>Profit target</span><strong>{demoAccount.profit} <small>of +$8,000</small></strong></div><div className="progress-track"><span style={{ width: `${demoAccount.profitProgress}%` }} /></div><p><span>{demoAccount.profitProgress}% complete</span><span>$4,760 remaining</span></p></div>}
        </article>
      </section>

      <section className="metric-grid" aria-label="Key risk metrics">
        {liveMode ? guardian ? <>
          <Metric label="Daily buffer" value={formatMoney(guardian.remainingDailyBufferMinor, currency)} note={guardian.dailyFloorMinor === null ? "No daily-loss rule in this profile" : `Floor ${formatMoney(guardian.dailyFloorMinor, currency)}`} tone={guardianTone(guardian.status)} />
          <Metric label="Total buffer" value={formatMoney(guardian.remainingTotalBufferMinor, currency)} note={`Floor ${formatMoney(guardian.effectiveTotalFloorMinor, currency)}`} tone={guardianTone(guardian.status)} />
          <Metric label={guardian.trailingTotalFloorMinor === null ? "Static floor" : "Trailing floor"} value={formatMoney(guardian.effectiveTotalFloorMinor, currency)} note={guardian.trailingTotalFloorMinor === null ? "Fixed from initial balance" : "High-water state preserved"} tone="neutral" />
          <Metric label="Best-day share" value={formatBps(consistency?.bestDayShareBps)} note={consistency ? `${consistency.tradingDayCount} trading days · ${consistency.closedTradeCount} closed trades` : "Waiting for normalized deal history"} tone="neutral" />
        </> : <>
          <Metric label="Daily buffer" value="—" note="Effective rule profile required" tone="neutral" />
          <Metric label="Total buffer" value="—" note="Effective rule profile required" tone="neutral" />
          <Metric label="Loss floor" value="—" note="Model not active" tone="neutral" />
          <Metric label="Consistency" value="—" note="Calculation not active" tone="neutral" />
        </> : <>
          <Metric label="Daily drawdown" value="$4,630" note="92.6% available" tone="healthy" />
          <Metric label="Total drawdown" value="$7,630" note="76.3% available" tone="healthy" />
          <Metric label="Trailing floor" value="$95,240" note="$7,630 above floor" tone="neutral" />
          <Metric label="Consistency" value="31.4%" note="8.6 pts below limit" tone="caution" />
        </>}
      </section>

      <section className="dashboard-columns">
        <article className="panel positions-panel" id="positions">
          <div className="panel-heading"><div><p className="eyebrow">Exposure</p><h2>Open positions</h2></div><span className="panel-count">{liveMode ? livePositions.length : 3} open</span></div>
          <div className="positions-table" role="table" aria-label={liveMode ? "Live open positions" : "Illustrative open positions"}>
            <div className="position-row position-header" role="row"><span>Market</span><span>Position</span><span>Entry / current</span><span>Risk at stop</span><span>P&amp;L</span><span>Status</span></div>
            {liveMode ? livePositions.map((position) => (
              <div className="position-row" role="row" key={position.ticket}>
                <span><strong>{position.symbol}</strong><small>{position.direction.toUpperCase()}</small></span>
                <span>{formatLots(position.volume_units)} lots</span>
                <span><strong>{formatPrice(position.open_price_points, position.price_digits)}</strong><small>{formatPrice(position.current_price_points, position.price_digits)}</small></span>
                <span><strong>{position.risk_at_stop_minor === null ? "Not calculated" : formatMoney(position.risk_at_stop_minor, currency)}</strong><small>{position.stop_loss_price_points === null ? "No stop-loss" : position.risk_at_stop_minor === null ? "Contract data pending" : `SL ${formatPrice(position.stop_loss_price_points, position.price_digits)}`}</small></span>
                <span className={position.floating_pnl_minor.startsWith("-") ? "negative" : "positive"}>{formatMoney(position.floating_pnl_minor, currency)}</span>
                <span><em className={position.stop_loss_price_points !== null ? "healthy" : "caution"}>{position.stop_loss_price_points !== null ? "Protected" : "Missing stop"}</em></span>
              </div>
            )) : demoPositions.map((position) => (
              <div className="position-row" role="row" key={position.symbol}>
                <span><strong>{position.symbol}</strong><small>{position.direction}</small></span>
                <span>{position.volume} lots</span>
                <span><strong>{position.entry}</strong><small>{position.current}</small></span>
                <span><strong>{position.risk}</strong><small>SL {position.stop}</small></span>
                <span className={position.pnl.startsWith("+") ? "positive" : "negative"}>{position.pnl}</span>
                <span><em className={position.health === "Watch news" ? "caution" : "healthy"}>{position.health}</em></span>
              </div>
            ))}
          </div>
          <div className="panel-footer">{liveMode ? <><span>Known risk at stops: <strong>{formatMoney(riskSummary?.known_risk_minor, currency)}</strong></span><span>{guardian?.scenarios.allStopsReached.availability === "calculated" ? <>All-stops buffer: <strong>{formatClosestScenarioBuffer(guardian.scenarios.allStopsReached, currency)}</strong></> : <>Stop coverage: <strong>{riskCoverageLabel(livePositions.length, riskSummary)}</strong></>}</span></> : <><span>Projected equity at all stops: <strong>$100,202</strong></span><span>Remaining buffer: <strong>$1,962</strong></span></>}</div>
        </article>

        {liveMode ? <DailyPlanPanel accountId={liveAccount?.id ?? ""} currency={currency} plan={liveState?.dailyPlan ?? null} status={liveState?.dailyPlanStatus ?? null} onChanged={refresh} /> : <article className="panel daily-plan" id="simulator">
          <div className="panel-heading"><div><p className="eyebrow">Discipline</p><h2>Today’s plan</h2></div><span className="status-pill neutral">London + NY</span></div>
          <>
            <div className="plan-budget"><small>Risk budget remaining</small><strong>$1,332</strong><span>of $2,000</span><div className="progress-track"><span style={{ width: "66%" }} /></div></div>
            <dl className="plan-list"><div><dt>Max risk / trade</dt><dd>$500</dd></div><div><dt>Trades remaining</dt><dd>2 of 4</dd></div><div><dt>Stop after loss</dt><dd>−$1,500</dd></div><div><dt>Profit lock</dt><dd>+$1,200</dd></div></dl>
            <div className="plan-warning"><span>!</span><p><strong>High-impact news watch</strong><small>Illustrative warning · verify against the active ruleset.</small></p></div>
          </>
        </article>}
      </section>

      <section className="panel rules-panel">
        <div className="panel-heading"><div><p className="eyebrow">Rules engine</p><h2>Rule status</h2></div><Link className="quiet-link" href="/rules">View calculations →</Link></div>
        <div className="rule-grid">
          {liveMode
            ? guardian
              ? <LiveRuleCards guardian={guardian} consistency={consistency} currency={currency} />
              : ["Daily drawdown", "Maximum drawdown", "Trailing model", "Consistency"].map((name) => <div className="rule-card" key={name}><span className="rule-state neutral" /><div><small>{name}</small><strong>—</strong></div><p>Versioned profile<br /><span>Awaiting activation</span></p><em className="neutral">Pending</em></div>)
            : ruleRows.map((rule) => <div className="rule-card" key={rule.name}><span className={`rule-state ${rule.tone}`} /><div><small>{rule.name}</small><strong>{rule.buffer}</strong></div><p>{rule.current}<br /><span>{rule.limit}</span></p><em className={rule.tone}>{rule.status}</em></div>)}
        </div>
      </section>

      <section className="dashboard-columns lower" id="timeline">
        <article className="panel timeline-panel"><div className="panel-heading"><div><p className="eyebrow">Audit trail</p><h2>Account timeline</h2></div><span className="panel-count">Today</span></div><div className="timeline-list">{liveMode ? <><Timeline time={formatTimelineTime(liveAccount?.last_heartbeat_at)} title={`Connector ${freshnessLabel(freshness).toLowerCase()}`} detail={liveAccount?.last_heartbeat_at ? `Last heartbeat ${heartbeatLabel(liveAccount.last_heartbeat_at)}` : "No heartbeat has been received"} tone={freshness === "live" ? "healthy" : "caution"} /><Timeline time={formatTimelineTime(liveSnapshot?.observed_at)} title={liveSnapshot ? "Account snapshot received" : "Waiting for first snapshot"} detail={liveSnapshot ? `Balance and equity observed at ${formatTimestamp(liveSnapshot.observed_at)}` : "Keep MT5 and the EA running"} tone={liveSnapshot ? "healthy" : "caution"} /></> : <><Timeline time="14:32" title="Risk state recalculated" detail="Snapshot sequence 8,214 · all rule buffers healthy" tone="healthy" /><Timeline time="14:29" title="Stop-loss changed" detail="EURUSD stop moved to 1.08180 · risk reduced by $240" tone="neutral" /><Timeline time="14:17" title="News caution window" detail="Illustrative event restriction begins in 13 minutes" tone="caution" /><Timeline time="13:58" title="Connector heartbeat" detail="Round-trip 184 ms · sequence continuous" tone="healthy" /></>}</div></article>
        {liveMode ? <RiskActionsPanel accountId={liveAccount?.id ?? ""} actions={riskActions} history={liveState?.riskActionHistory ?? []} availability={liveState?.riskActionAvailability} onChanged={refresh} /> : <article className="panel protection-panel"><span className="protection-mark">✓</span><p className="eyebrow">Priority actions</p><h2>Connect an account to activate the command centre.</h2><p>The read-only connector observes account data and sends signed events. It contains no order placement, modification, or closing calls.</p><Link className="quiet-link" href="/pairing">Review connector setup →</Link></article>}
      </section>
      <footer className="product-footer"><span>FundedFence provides risk-monitoring tools, not financial advice or a guarantee of challenge success.</span><span>{liveMode ? riskActive ? `Live telemetry and rule engine ${riskCalculation?.engineVersion} are active.` : "Live telemetry is active; firm rule outputs remain disabled." : "Data shown here is illustrative."}</span></footer>
    </main>
  );
}

function DemoHealth() {
  return (
    <article className="panel health-panel">
      <div className="panel-heading"><div><p className="eyebrow">Account health</p><h2>Clear to trade within plan</h2></div><span className="status-pill healthy">Healthy</span></div>
      <div className="health-content">
        <div className="risk-ring" aria-label="Illustrative account health score 78 out of 100"><div><strong>78</strong><span>/ 100</span><small>HEALTH SCORE</small></div></div>
        <div className="health-copy">
          <p>Your closest constraint is the daily loss limit. Planned stops remain inside the illustrative buffer.</p>
          <div className="health-metrics">
            <span><small>Daily buffer</small><strong>$4,630</strong></span>
            <span><small>Total buffer</small><strong>$7,630</strong></span>
            <span><small>Open risk</small><strong>$2,668</strong></span>
            <span><small>Safe additional risk</small><strong>$4,230</strong></span>
          </div>
        </div>
      </div>
    </article>
  );
}

function CommandCentrePanel({ command, currency }: { command: CommandCentre | undefined; currency: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const resetSeconds = command?.tradingDay.resetRemainingSeconds == null || elapsed > 15 ? null : Math.max(0, command.tradingDay.resetRemainingSeconds - elapsed);
  const newsExpired = elapsed > 30 * 60;
  const eventSeconds = command?.news.nextEvent && !newsExpired ? Math.max(0, command.news.nextEvent.remainingSeconds - elapsed) : null;
  const sessionSeconds = command?.sessions.nextTransition && elapsed <= 15 ? Math.max(0, command.sessions.nextTransition.remainingSeconds - elapsed) : null;
  return <section className="command-grid" aria-label="Daily command centre">
    <article className="panel command-card"><div className="panel-heading"><div><p className="eyebrow">Market context</p><h2>News &amp; sessions</h2></div><span className={`status-pill ${command?.news.availability === "calculated" && !newsExpired ? "caution" : "neutral"}`}>{newsExpired ? "stale" : command?.news.availability ?? "unknown"}</span></div><strong>{newsExpired ? "Calendar refresh overdue" : command?.news.nextEvent ? command.news.nextEvent.title : command?.news.treatment?.label ?? "No live calendar"}</strong>{command?.news.nextEvent && <p className="command-event-time">{eventSeconds === null ? "—" : formatDuration(eventSeconds)} · {command.news.nextEvent.currency} · {command.news.nextEvent.impact} impact</p>}<p>{newsExpired ? "The last successful dashboard refresh is too old for calendar timing." : command?.news.reason ?? "Connect an account to evaluate sourced market context."}</p>{command?.news.nextEvent && <small>Affects {command.news.nextEvent.affectedSymbols.join(", ")} · qualification unverified · {command.news.nextEvent.source.provider}</small>}{command?.news.treatment && <small>{command.news.treatment.mode === "allowed" ? "No reward-adjustment window in the effective profile." : `${formatBps(command.news.treatment.qualifyingProfitBps)} of profit from qualifying profitable trades is counted · ${command.news.treatment.windowMinutesBefore} min before / ${command.news.treatment.windowMinutesAfter} min after · ${command.news.treatment.affectedInstrumentsOnly ? "affected instruments only" : "all instruments"}`}</small>}<small>Sessions: {sessionSummary(command?.sessions, sessionSeconds)}</small></article>
    <article className="panel command-card"><div className="panel-heading"><div><p className="eyebrow">Broker clock</p><h2>Trading day</h2></div><span className={`status-pill ${resetSeconds === null ? "neutral" : "healthy"}`}>{resetSeconds === null ? "Unknown" : "Fresh"}</span></div><strong className="command-timer">{resetSeconds === null ? "—" : formatDuration(resetSeconds)}</strong><p>{resetSeconds === null ? command?.tradingDay.reason ?? "Waiting for live broker time." : `until broker reset · ${command?.tradingDay.resetKey}`}</p><small>Equity change {formatMoney(command?.tradingDay.equityChangeMinor, currency)} · entries {command?.tradingDay.entryCount ?? "unknown"}</small></article>
    <article className="panel command-card" id="notifications"><div className="panel-heading"><div><p className="eyebrow">In-app channel</p><h2>Notifications</h2></div><span className={`status-pill ${command?.notifications.activeCount ? "caution" : "neutral"}`}>{command?.notifications.activeCount ?? 0} active</span></div>{command?.notifications.latest.length ? <div className="command-list">{command.notifications.latest.map((item) => <p key={item.id}><strong>{item.title}</strong><small>{item.severity} · {formatTimestamp(item.detectedAt)}</small></p>)}</div> : <p>No active notifications. Unknown checks are not treated as clear.</p>}<small>Email not configured</small></article>
    <article className="panel command-card"><div className="panel-heading"><div><p className="eyebrow">Observed executions</p><h2>Session performance</h2></div><span className="status-pill neutral">Unknown</span></div><strong>Not calculated</strong><p>{command?.sessionAnalytics.reason ?? "No authoritative session definitions are stored."}</p><small>Named sessions will use exact net deal economics.</small></article>
  </section>;
}

function LiveHealth({ guardian, openPositionCount, riskSummary, currency }: { guardian: GuardianOutput; openPositionCount: number; riskSummary: DashboardLiveState["riskSummary"]; currency: string }) {
  const tone = guardianTone(guardian.status);
  const title = guardian.status === "healthy" ? "Within sourced loss limits" : guardian.status === "caution" ? "Risk buffer is narrowing" : guardian.status === "critical" ? "Very close to a loss limit" : "Loss limit breached";
  const closest = guardian.remainingDailyBufferMinor === null || BigInt(guardian.remainingTotalBufferMinor) < BigInt(guardian.remainingDailyBufferMinor) ? "maximum loss" : "daily loss";
  return (
    <article className="panel health-panel">
      <div className="panel-heading"><div><p className="eyebrow">Account health</p><h2>{title}</h2></div><span className={`status-pill ${tone}`}>{statusLabel(guardian.status)}</span></div>
      <div className="health-content">
        <div className={`risk-ring ${guardian.status === "healthy" ? "" : "pending"}`} aria-label={`Live rule status ${guardian.status}`}><div><strong>{guardian.status === "healthy" ? "OK" : "!"}</strong><span>LIVE</span><small>RULE STATUS</small></div></div>
        <div className="health-copy">
          <p>The closest sourced constraint is {closest}. Values come from the current MT5 snapshot and the effective immutable rule version.</p>
          <div className="health-metrics">
            <span><small>Daily buffer</small><strong>{guardian.remainingDailyBufferMinor === null ? "Not applicable" : formatMoney(guardian.remainingDailyBufferMinor, currency)}</strong></span>
            <span><small>Total buffer</small><strong>{formatMoney(guardian.remainingTotalBufferMinor, currency)}</strong></span>
            <span><small>Open risk</small><strong>{openRiskLabel(openPositionCount, riskSummary, currency)}</strong></span>
            <span><small>Safe additional risk</small><strong>{formatMoney(guardian.safeAdditionalRiskMinor, currency)}</strong></span>
          </div>
        </div>
      </div>
    </article>
  );
}

function PendingHealth({ snapshotReady, openPositionCount, riskSummary, currency }: { snapshotReady: boolean; openPositionCount: number; riskSummary: DashboardLiveState["riskSummary"]; currency: string }) {
  return (
    <article className="panel health-panel">
      <div className="panel-heading"><div><p className="eyebrow">Account health</p><h2>{snapshotReady ? "Rule verification required" : "Waiting for live account data"}</h2></div><span className="status-pill caution">Not active</span></div>
      <div className="health-content">
        <div className="risk-ring pending" aria-label="Account health score unavailable"><div><strong>—</strong><span>/ 100</span><small>NOT CALCULATED</small></div></div>
        <div className="health-copy">
          <p>{snapshotReady ? "The connector is supplying live balances. FundedFence will not calculate protection limits until a sourced, versioned FundedNext rule profile is approved." : "Keep MT5 running with the connector attached. Risk calculations start only after a current snapshot and an approved rule profile are available."}</p>
          <div className="health-metrics">
            <span><small>Daily buffer</small><strong>Pending rules</strong></span>
            <span><small>Total buffer</small><strong>Pending rules</strong></span>
            <span><small>Open risk</small><strong>{openRiskLabel(openPositionCount, riskSummary, currency)}</strong></span>
            <span><small>Safe additional risk</small><strong>Not calculated</strong></span>
          </div>
        </div>
      </div>
    </article>
  );
}

function LiveRuleCards({ guardian, consistency, currency }: { guardian: GuardianOutput; consistency: ConsistencyOutput | undefined; currency: string }) {
  const tone = guardianTone(guardian.status);
  const cards = [
    { name: "Daily drawdown", value: guardian.remainingDailyBufferMinor === null ? "N/A" : formatMoney(guardian.remainingDailyBufferMinor, currency), current: guardian.currentDailyReferenceMinor === null ? "No daily rule" : `Reference ${formatMoney(guardian.currentDailyReferenceMinor, currency)}`, limit: guardian.dailyFloorMinor === null ? "Not applicable" : `Floor ${formatMoney(guardian.dailyFloorMinor, currency)}`, status: guardian.dailyFloorMinor === null ? "N/A" : statusLabel(guardian.status), tone: guardian.dailyFloorMinor === null ? "neutral" : tone },
    { name: "Maximum drawdown", value: formatMoney(guardian.remainingTotalBufferMinor, currency), current: `Reference ${formatMoney(guardian.currentTotalReferenceMinor, currency)}`, limit: `Floor ${formatMoney(guardian.effectiveTotalFloorMinor, currency)}`, status: statusLabel(guardian.status), tone },
    { name: "Loss model", value: guardian.trailingTotalFloorMinor === null ? "Static" : "Trailing", current: `Effective ${formatMoney(guardian.effectiveTotalFloorMinor, currency)}`, limit: guardian.trailingTotalFloorMinor === null ? "Fixed initial-balance floor" : "High-water state preserved", status: "Active", tone: "neutral" },
    { name: "Consistency", value: formatBps(consistency?.bestDayShareBps), current: consistency ? `${consistency.tradingDayCount} trading days` : "No normalized history", limit: "Observed metric · no assumed limit", status: consistency ? "Observed" : "Pending", tone: "neutral" },
  ];
  return <>{cards.map((card) => <div className="rule-card" key={card.name}><span className={`rule-state ${card.tone}`} /><div><small>{card.name}</small><strong>{card.value}</strong></div><p>{card.current}<br /><span>{card.limit}</span></p><em className={card.tone}>{card.status}</em></div>)}</>;
}

function useLiveAccount(): { liveState: DashboardLiveState | null; loading: boolean; accounts: AccountListItem[]; selectedAccountId: string | null; selectAccount: (accountId: string) => void; refresh: () => void } {
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<DashboardLiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadAccounts() {
      try {
        const response = await fetch("/api/v1/accounts", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { accounts?: AccountListItem[] };
        const availableAccounts = payload.accounts ?? [];
        const savedAccountId = window.localStorage.getItem("fundedfence.selectedAccountId");
        const selected = availableAccounts.find((account) => account.id === savedAccountId)?.id ?? availableAccounts[0]?.id ?? null;
        if (!cancelled) {
          setAccounts(availableAccounts);
          setAccountId(selected);
          if (selected) window.localStorage.setItem("fundedfence.selectedAccountId", selected);
        }
      } catch {
        // The dashboard falls back to the clearly labelled preview when account recovery is unavailable.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadAccounts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function synchronizeSelection(event: StorageEvent) {
      if (event.key === "fundedfence.selectedAccountId" && event.newValue && accounts.some((account) => account.id === event.newValue)) {
        setLiveState(null);
        setAccountId(event.newValue);
      }
    }
    window.addEventListener("storage", synchronizeSelection);
    return () => window.removeEventListener("storage", synchronizeSelection);
  }, [accounts]);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/v1/accounts/${accountId}/live`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as DashboardLiveState;
        if (!cancelled) setLiveState(payload);
      } catch {
        // Keep the last known state visible and let freshness expose the interruption.
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accountId, refreshToken]);

  function selectAccount(selectedId: string) {
    if (!accounts.some((account) => account.id === selectedId)) return;
    setLiveState(null);
    setAccountId(selectedId);
    window.localStorage.setItem("fundedfence.selectedAccountId", selectedId);
  }

  return { liveState, loading, accounts, selectedAccountId: accountId, selectAccount, refresh: () => setRefreshToken((value) => value + 1) };
}

function DailyPlanPanel({ accountId, currency, plan, status, onChanged }: { accountId: string; currency: string; plan: DailyRiskPlan | null; status: DashboardLiveState["dailyPlanStatus"]; onChanged: () => void }) {
  const [editing, setEditing] = useState(!plan);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/v1/accounts/${accountId}/daily-plan`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ riskBudgetMinor: majorToMinor(form.get("riskBudget")), maxRiskPerTradeMinor: majorToMinor(form.get("maxRiskPerTrade")), maxTrades: Number(form.get("maxTrades")), lossStopMinor: majorToMinor(form.get("lossStop")), profitLockMinor: majorToMinor(form.get("profitLock")), preservationMode: form.get("preservationMode") }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "The daily plan could not be saved.");
      setEditing(false);
      setMessage("Daily plan saved.");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The daily plan could not be saved.");
    } finally { setBusy(false); }
  }
  return <article className="panel daily-plan" id="simulator">
    <div className="panel-heading"><div><p className="eyebrow">Discipline</p><h2>Today’s plan</h2></div><button className="button button-secondary button-small" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit"}</button></div>
    {editing ? <form className="plan-form" onSubmit={save}>
      <label><span>Daily risk budget ({currency})</span><input name="riskBudget" inputMode="decimal" defaultValue={minorToMajor(plan?.riskBudgetMinor)} required /></label>
      <label><span>Max risk / trade ({currency})</span><input name="maxRiskPerTrade" inputMode="decimal" defaultValue={minorToMajor(plan?.maxRiskPerTradeMinor)} required /></label>
      <label><span>Max trades</span><input name="maxTrades" type="number" min="1" max="100" defaultValue={plan?.maxTrades ?? 4} required /></label>
      <label><span>Manual loss stop ({currency})</span><input name="lossStop" inputMode="decimal" defaultValue={minorToMajor(plan?.lossStopMinor)} required /></label>
      <label><span>Profit lock ({currency})</span><input name="profitLock" inputMode="decimal" defaultValue={minorToMajor(plan?.profitLockMinor)} required /></label>
      <label><span>Preservation</span><select name="preservationMode" defaultValue={plan?.preservationMode ?? "off"}><option value="off">Off</option><option value="manual">Manual</option><option value="profit-lock">At profit lock</option></select></label>
      <button className="button button-primary button-small" disabled={busy}>{busy ? "Saving…" : "Save plan"}</button>
    </form> : <>
      <div className="plan-budget"><small>Risk budget remaining</small><strong>{status?.riskBudgetRemainingMinor === null ? "Not calculated" : formatMoney(status?.riskBudgetRemainingMinor, currency)}</strong><span>of {formatMoney(plan?.riskBudgetMinor, currency)}</span><div className="progress-track"><span style={{ width: status?.riskBudgetRemainingMinor && plan ? `${Number(BigInt(status.riskBudgetRemainingMinor) * 100n / BigInt(plan.riskBudgetMinor))}%` : "0%" }} /></div></div>
      <dl className="plan-list"><div><dt>Max risk / trade</dt><dd>{formatMoney(plan?.maxRiskPerTradeMinor, currency)}</dd></div><div><dt>Max trades</dt><dd>{plan?.maxTrades ?? "—"}</dd></div><div><dt>Stop after loss</dt><dd>{formatMoney(plan?.lossStopMinor, currency)}</dd></div><div><dt>Profit lock</dt><dd>{formatMoney(plan?.profitLockMinor, currency)}</dd></div></dl>
      <div className="plan-warning"><span>{status?.riskCoverageComplete ? "✓" : "!"}</span><p><strong>{plan ? `${plan.preservationMode === "off" ? "Standard" : "Preservation"} plan · version ${plan.version}` : "Daily plan is not active"}</strong><small>{status?.riskCoverageComplete ? `Known stop risk ${formatMoney(status.knownRiskMinor, currency)}.` : "Remaining budget stays unknown until every position has a stop and contract metadata."}</small></p></div>
    </>}
    {message && <p className="plan-message" role="status">{message}</p>}
  </article>;
}

function RiskActionsPanel({ accountId, actions, history, availability, onChanged }: { accountId: string; actions: RiskAction[]; history: RiskAction[]; availability: DashboardLiveState["riskActionAvailability"]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function transition(action: RiskAction, value: "acknowledge" | "resolve" | "dismiss") {
    const promptedReason = value === "acknowledge" ? "" : window.prompt(value === "dismiss" ? "Why are you dismissing this action?" : "Resolution note (optional)");
    if (promptedReason === null) return;
    const reason = promptedReason;
    if (value === "dismiss" && !reason.trim()) return;
    setBusy(action.id);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/accounts/${accountId}/risk-actions`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ actionId: action.id, transition: value, reason }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "The risk action could not be updated.");
      onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The risk action could not be updated."); }
    finally { setBusy(null); }
  }
  return <article className="panel actions-panel" id="actions">
    <div className="panel-heading"><div><p className="eyebrow">What to do now</p><h2>Priority actions</h2></div><span className={`status-pill ${actions.length ? "caution" : "neutral"}`}>{actions.length ? `${actions.length} open` : "Checks pending"}</span></div>
    <div className="action-list">{actions.length ? actions.map((action) => <div className="action-row" key={action.id}><span className={`action-severity ${action.severity}`} /><div><strong>{action.title}</strong><small>{action.type.replaceAll(".", " ")} · {action.state}</small><div className="action-buttons">{action.state === "open" && <button disabled={busy === action.id} onClick={() => transition(action, "acknowledge")}>Acknowledge</button>}<button disabled={busy === action.id} onClick={() => transition(action, "resolve")}>Resolve</button><button disabled={busy === action.id} onClick={() => transition(action, "dismiss")}>Dismiss</button></div></div></div>) : <p className="action-empty">No current plan or telemetry actions. Unknown checks are not treated as safe.</p>}</div>
    {history.length > 0 && <details className="action-history"><summary>Warning history ({history.length})</summary>{[...history].sort((a, b) => b.lastDetectedAt.localeCompare(a.lastDetectedAt)).slice(0, 5).map((action) => <p key={action.id}><strong>{action.title}</strong><span>{action.state} · {formatTimestamp(action.lastDetectedAt)}</span></p>)}</details>}
    <p className="action-unknown">Trade history: {availability?.dealHistoryReason ?? "Not calculated."}<br />Market close: {availability?.marketCloseReason ?? "Not calculated."}<br />Health score: {availability?.healthScoreReason ?? "Not calculated."}</p>
    {message && <p className="plan-message" role="alert">{message}</p>}
  </article>;
}

function formatMoney(value: string | null | undefined, currency: string): string {
  if (value == null || !/^-?\d+$/.test(value)) return "—";
  const minor = BigInt(value);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const major = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const number = `${negative ? "-" : ""}${major.toLocaleString("en-US")}.${fraction}`;
  return `${currency === "USD" ? "$" : `${currency} `}${number}`;
}

function majorToMinor(value: FormDataEntryValue | null): string {
  const text = String(value ?? "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error("Money values must use no more than two decimal places.");
  return (BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0")).toString();
}

function minorToMajor(value: string | undefined): string {
  if (!value || !/^\d+$/.test(value)) return "";
  const minor = BigInt(value);
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`;
}

function formatBps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

function sessionSummary(sessions: CommandCentre["sessions"] | undefined, transitionSeconds: number | null): string {
  if (!sessions || sessions.availability !== "calculated" || !sessions.symbols.length) return sessions?.reason ?? "No authoritative broker sessions.";
  const states = sessions.symbols.slice(0, 3).map((row) => `${row.symbol} ${row.isOpen ? "open" : "closed"}`).join(", ");
  const remaining = sessions.symbols.length > 3 ? `, +${sessions.symbols.length - 3} more` : "";
  const transition = sessions.nextTransition && transitionSeconds !== null ? `; ${sessions.nextTransition.symbols.join(", ")} ${sessions.nextTransition.type} in ${formatDuration(transitionSeconds)}` : "";
  return `${states}${remaining}${transition}`;
}

function guardianTone(status: GuardianStatus): "healthy" | "caution" {
  return status === "healthy" ? "healthy" : "caution";
}

function statusLabel(status: GuardianStatus): string {
  return status[0].toUpperCase() + status.slice(1);
}

function formatClosestScenarioBuffer(scenario: GuardianScenario, currency: string): string {
  const values = [scenario.remainingDailyBufferMinor, scenario.remainingTotalBufferMinor].filter((value): value is string => value !== null && /^-?\d+$/.test(value));
  if (!values.length) return "Unknown";
  return formatMoney(values.reduce((smallest, value) => BigInt(value) < BigInt(smallest) ? value : smallest), currency);
}

function freshnessLabel(freshness: "live" | "delayed" | "offline"): string {
  if (freshness === "live") return "Live";
  if (freshness === "delayed") return "Delayed";
  return "Offline";
}

function heartbeatLabel(value: string | null | undefined): string {
  if (!value) return "No heartbeat";
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (ageSeconds < 5) return "just now";
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  return `${Math.floor(ageSeconds / 60)}m ago`;
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return "pending";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "received";
  return new Date(parsed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatTimelineTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Date(parsed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatLots(value: string): string {
  if (!/^\d+$/.test(value)) return "—";
  const units = BigInt(value);
  const whole = units / 10_000n;
  const fraction = (units % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formatPrice(value: string | null | undefined, digits: number | null): string {
  if (value == null || digits == null || !Number.isInteger(digits) || digits < 0 || digits > 10 || !/^-?\d+$/.test(value)) return "—";
  const points = BigInt(value);
  const negative = points < 0n;
  const absolute = negative ? -points : points;
  if (digits === 0) return `${negative ? "-" : ""}${absolute}`;
  const divisor = 10n ** BigInt(digits);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(digits, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function openRiskLabel(openPositionCount: number, summary: DashboardLiveState["riskSummary"], currency: string): string {
  if (openPositionCount === 0) return formatMoney("0", currency);
  if (!summary) return "Pending metadata";
  const amount = formatMoney(summary.known_risk_minor, currency);
  return summary.all_positions_covered ? amount : `${amount} known`;
}

function riskCoverageLabel(openPositionCount: number, summary: DashboardLiveState["riskSummary"]): string {
  if (openPositionCount === 0) return "No open positions";
  if (!summary) return "Waiting for connector 0.3.0";
  if (summary.positions_without_stop > 0) return `${summary.positions_without_stop} missing stop${summary.positions_without_stop === 1 ? "" : "s"}`;
  if (summary.positions_without_metadata > 0) return `${summary.positions_without_metadata} awaiting contract data`;
  return "All open positions protected";
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return <article className="metric-card"><div><span className={`metric-icon ${tone}`} aria-hidden="true" /><small>{label}</small></div><strong>{value}</strong><p>{note}</p></article>;
}

function Timeline({ time, title, detail, tone }: { time: string; title: string; detail: string; tone: string }) {
  return <div className="timeline-item"><time>{time}</time><span className={`timeline-dot ${tone}`} /><p><strong>{title}</strong><small>{detail}</small></p></div>;
}
