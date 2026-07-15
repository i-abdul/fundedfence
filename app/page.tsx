import Link from "next/link";
import { Brand } from "@/components/Brand";

const protection = [
  ["01", "Know the real buffer", "Translate versioned account rules into clear daily, total, trailing, and consistency headroom."],
  ["02", "Catch danger early", "See projected risk at every stop and receive calm warnings before an accidental rule breach."],
  ["03", "Keep an evidence trail", "Signed connector events and reproducible calculations create an audit-ready account timeline."],
] as const;

export default function Home() {
  return (
    <main className="marketing-page">
      <nav className="marketing-nav"><Brand /><div><Link href="#product">Product</Link><Link href="#security">Security</Link><Link href="#foundation">Foundation</Link></div><div><Link className="nav-signin" href="/login">Sign in</Link><Link className="button button-primary button-small" href="/onboarding">Connect MT5</Link></div></nav>
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-copy"><div className="trust-chip"><span /> Read-only MT5 protection layer</div><h1>Protect your prop account <em>before</em> one bad trade ends the challenge.</h1><p>Monitor the rules that matter, understand the risk already open, and get warned before drawdown, consistency, or connection issues put the account at risk.</p><div className="hero-actions"><Link className="button button-primary" href="/onboarding">Connect your account <span>→</span></Link><Link className="button button-secondary" href="/dashboard">Explore the dashboard</Link></div><div className="hero-assurances"><span><b>✓</b> No trade execution</span><span><b>✓</b> No MT5 passwords</span><span><b>✓</b> Explainable calculations</span></div></div>
        <div className="hero-product" id="product" aria-label="Illustrative FundedFence dashboard preview">
          <div className="product-window"><div className="window-bar"><span className="mini-brand"><i>FF</i> FundedFence</span><span className="preview-label">ILLUSTRATIVE DATA</span><span className="window-live"><i /> Live preview</span></div><div className="preview-body"><div className="preview-heading"><span><small>ACCOUNT HEALTH</small><strong>Clear to trade within plan</strong></span><em>HEALTHY</em></div><div className="preview-health"><div className="preview-ring"><span><strong>78</strong><small>/100</small></span></div><div className="preview-buffers"><p>Closest constraint <strong>Daily loss limit</strong></p><div><span><small>DAILY BUFFER</small><strong>$4,630</strong></span><span><small>TOTAL BUFFER</small><strong>$7,630</strong></span><span><small>OPEN RISK</small><strong>$2,668</strong></span></div></div></div><div className="preview-rule-row"><span><i className="healthy" /><small>Daily drawdown</small><strong>$4,630</strong><em>92.6% available</em></span><span><i className="healthy" /><small>Total drawdown</small><strong>$7,630</strong><em>76.3% available</em></span><span><i className="neutral" /><small>Trailing floor</small><strong>$95,240</strong><em>$7,630 clear</em></span></div><div className="preview-position"><span><b>EURUSD</b><small>LONG · 0.40</small></span><span><small>RISK AT STOP</small><b>$960</b></span><span className="positive"><small>FLOATING P&amp;L</small><b>+$376</b></span><em>PROTECTED</em></div></div></div>
          <div className="floating-alert"><span>!</span><p><small>RISK CHECK</small><strong>All planned stops remain inside the buffer.</strong></p></div>
        </div>
      </section>

      <section className="proof-strip"><p>Built for disciplined prop traders</p><div><span>REAL-TIME RULE MONITORING</span><span>TRAILING DRAWDOWN</span><span>CONSISTENCY</span><span>NEWS WINDOWS</span><span>AUDIT EVIDENCE</span></div></section>

      <section className="protection-section" id="foundation"><div className="section-intro"><p className="eyebrow">A calmer way to manage risk</p><h2>One clear answer:<br />can the account afford this?</h2><p>FundedFence turns complex program rules and live MT5 state into a practical view of what is safe, what needs attention, and why.</p></div><div className="protection-list">{protection.map(([number, title, copy]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div><i>→</i></article>)}</div></section>

      <section className="security-section" id="security"><div className="security-card"><div><p className="eyebrow">Trust starts at the connector</p><h2>Read-only. Signed. Minimal.</h2><p>The MT5 connector only observes permitted account and trade data. It is explicitly prohibited from placing, changing, or closing trades.</p><div className="security-points"><span><b>01</b>No trading password collection</span><span><b>02</b>Short-lived device credentials</span><span><b>03</b>Replay and duplicate protection</span><span><b>04</b>Account-scoped audit ledger</span></div></div><div className="connector-diagram"><div className="terminal-node"><small>YOUR TERMINAL</small><strong>MT5</strong><span>Account data only</span></div><div className="connector-path"><span>signed HTTPS</span><i>············→</i><em>READ ONLY</em></div><div className="shield-node"><span className="brand-mark"><span /></span><small>FundedFence</small><strong>Risk engine</strong></div></div></div></section>

      <section className="cta-section"><div><p className="eyebrow">Build discipline into the challenge</p><h2>See the buffer before<br />you take the risk.</h2></div><div><p>Start with the secure account setup. Firm rules remain unverified until an authorized reviewer publishes a sourced version.</p><Link className="button button-light" href="/onboarding">Start account setup <span>→</span></Link></div></section>
      <footer className="marketing-footer"><Brand /><p>Risk monitoring for prop accounts. Not financial advice, a trading signal service, or a guarantee of challenge success.</p><div><Link href="/dashboard">Product preview</Link><Link href="/pairing">Connector</Link><Link href="/rules">Rule model</Link></div></footer>
    </main>
  );
}
