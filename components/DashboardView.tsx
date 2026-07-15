import Link from "next/link";
import { demoAccount, demoPositions, ruleRows } from "@/lib/product/demo-account";

export function DashboardView({ userLabel }: { userLabel?: string }) {
  return (
    <main className="dashboard-shell">
      <div className="demo-banner" role="note">
        <span className="demo-dot" /> Illustrative account — no verified firm rules or live connector data are shown.
        <Link href="/onboarding">Start secure setup</Link>
      </div>
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">{userLabel ? `${userLabel}'s workspace` : "Risk command centre"}</p>
          <h1>Account overview</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" aria-label="View notifications">3</button>
          <Link className="button button-primary button-small" href="/onboarding">Connect account</Link>
        </div>
      </div>

      <section className="account-strip" aria-label="Selected account">
        <div className="account-identity"><span className="mini-shield">FF</span><span><strong>{demoAccount.label}</strong><small>{demoAccount.firm} · MT5</small></span></div>
        <span className="phase-pill">{demoAccount.phase}</span>
        <div className="live-state"><span /> Live preview <small>{demoAccount.lastHeartbeat}</small></div>
      </section>

      <section className="health-grid">
        <article className="panel health-panel">
          <div className="panel-heading"><div><p className="eyebrow">Account health</p><h2>Clear to trade within plan</h2></div><span className="status-pill healthy">Healthy</span></div>
          <div className="health-content">
            <div className="risk-ring" aria-label="Account health score 78 out of 100">
              <div><strong>78</strong><span>/ 100</span><small>HEALTH SCORE</small></div>
            </div>
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

        <article className="panel balance-panel">
          <div className="panel-heading"><div><p className="eyebrow">Current state</p><h2>{demoAccount.accountSize} account</h2></div><button className="kebab" aria-label="Account options">···</button></div>
          <div className="balance-values"><span><small>Balance</small><strong>{demoAccount.balance}</strong></span><span><small>Equity</small><strong>{demoAccount.equity}</strong></span></div>
          <div className="profit-progress">
            <div><span>Profit target</span><strong>{demoAccount.profit} <small>of +$8,000</small></strong></div>
            <div className="progress-track"><span style={{ width: `${demoAccount.profitProgress}%` }} /></div>
            <p><span>{demoAccount.profitProgress}% complete</span><span>$4,760 remaining</span></p>
          </div>
        </article>
      </section>

      <section className="metric-grid" aria-label="Key risk metrics">
        <Metric label="Daily drawdown" value="$4,630" note="92.6% available" tone="healthy" />
        <Metric label="Total drawdown" value="$7,630" note="76.3% available" tone="healthy" />
        <Metric label="Trailing floor" value="$95,240" note="$7,630 above floor" tone="neutral" />
        <Metric label="Consistency" value="31.4%" note="8.6 pts below limit" tone="caution" />
      </section>

      <section className="dashboard-columns">
        <article className="panel positions-panel" id="positions">
          <div className="panel-heading"><div><p className="eyebrow">Exposure</p><h2>Open positions</h2></div><span className="panel-count">3 open</span></div>
          <div className="positions-table" role="table" aria-label="Illustrative open positions">
            <div className="position-row position-header" role="row"><span>Market</span><span>Position</span><span>Entry / current</span><span>Risk at stop</span><span>P&amp;L</span><span>Status</span></div>
            {demoPositions.map((position) => (
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
          <div className="panel-footer"><span>Projected equity at all stops: <strong>$100,202</strong></span><span>Remaining buffer: <strong>$1,962</strong></span></div>
        </article>

        <article className="panel daily-plan" id="simulator">
          <div className="panel-heading"><div><p className="eyebrow">Discipline</p><h2>Today’s plan</h2></div><span className="status-pill neutral">London + NY</span></div>
          <div className="plan-budget"><small>Risk budget remaining</small><strong>$1,332</strong><span>of $2,000</span><div className="progress-track"><span style={{ width: "66%" }} /></div></div>
          <dl className="plan-list"><div><dt>Max risk / trade</dt><dd>$500</dd></div><div><dt>Trades remaining</dt><dd>2 of 4</dd></div><div><dt>Stop after loss</dt><dd>−$1,500</dd></div><div><dt>Profit lock</dt><dd>+$1,200</dd></div></dl>
          <div className="plan-warning"><span>!</span><p><strong>High-impact news watch</strong><small>Illustrative warning · verify against the active ruleset.</small></p></div>
        </article>
      </section>

      <section className="panel rules-panel">
        <div className="panel-heading"><div><p className="eyebrow">Rules engine</p><h2>Rule status</h2></div><Link className="quiet-link" href="/rules">View calculations →</Link></div>
        <div className="rule-grid">
          {ruleRows.map((rule) => <div className="rule-card" key={rule.name}><span className={`rule-state ${rule.tone}`} /><div><small>{rule.name}</small><strong>{rule.buffer}</strong></div><p>{rule.current}<br /><span>{rule.limit}</span></p><em className={rule.tone}>{rule.status}</em></div>)}
        </div>
      </section>

      <section className="dashboard-columns lower" id="timeline">
        <article className="panel timeline-panel"><div className="panel-heading"><div><p className="eyebrow">Audit trail</p><h2>Account timeline</h2></div><span className="panel-count">Today</span></div><div className="timeline-list"><Timeline time="14:32" title="Risk state recalculated" detail="Snapshot sequence 8,214 · all rule buffers healthy" tone="healthy" /><Timeline time="14:29" title="Stop-loss changed" detail="EURUSD stop moved to 1.08180 · risk reduced by $240" tone="neutral" /><Timeline time="14:17" title="News caution window" detail="Illustrative event restriction begins in 13 minutes" tone="caution" /><Timeline time="13:58" title="Connector heartbeat" detail="Round-trip 184 ms · sequence continuous" tone="healthy" /></div></article>
        <article className="panel protection-panel"><span className="protection-mark">✓</span><p className="eyebrow">Read-only by design</p><h2>Your terminal stays in control.</h2><p>The connector observes account data and sends signed events. It contains no order placement, modification, or closing calls.</p><Link className="quiet-link" href="/pairing">Review connector setup →</Link></article>
      </section>
      <footer className="product-footer"><span>FundedFence provides risk-monitoring tools, not financial advice or a guarantee of challenge success.</span><span>Data shown here is illustrative.</span></footer>
    </main>
  );
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return <article className="metric-card"><div><span className={`metric-icon ${tone}`} aria-hidden="true" /><small>{label}</small></div><strong>{value}</strong><p>{note}</p></article>;
}

function Timeline({ time, title, detail, tone }: { time: string; title: string; detail: string; tone: string }) {
  return <div className="timeline-item"><time>{time}</time><span className={`timeline-dot ${tone}`} /><p><strong>{title}</strong><small>{detail}</small></p></div>;
}
