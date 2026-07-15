import Link from "next/link";
import { Brand } from "@/components/Brand";
import { requireAppUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireAppUser("/onboarding");
  return (
    <main className="setup-page">
      <header className="setup-header">
        <Brand />
        <span>Secure account setup</span>
        <div className="setup-header-actions">
          <Link href="/dashboard">Exit setup</Link>
          <form action="/api/auth/logout" method="post">
            <button className="signout-button" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <div className="setup-layout">
        <aside className="setup-steps" aria-label="Setup progress"><p className="eyebrow">Four calm steps</p><ol><li className="active"><span>1</span><p><strong>Account details</strong><small>Choose the monitoring context</small></p></li><li><span>2</span><p><strong>Confirm rules</strong><small>Review sourced definitions</small></p></li><li><span>3</span><p><strong>Connect MT5</strong><small>Pair the read-only EA</small></p></li><li><span>4</span><p><strong>Verify live data</strong><small>Check freshness and positions</small></p></li></ol><div className="setup-assurance"><span className="brand-mark"><span /></span><p><strong>No MT5 password required</strong><small>FundedFence pairs to the terminal already signed in on your computer.</small></p></div></aside>
        <section className="setup-form-card">
          <div className="setup-progress"><span>Step 1 of 4</span><div><i /><i /><i /><i /></div></div>
          <p className="eyebrow">Account context</p><h1>Tell us what you’re protecting.</h1><p className="setup-lead">This creates the account workspace. Monitoring remains paused until an approved ruleset and live connector are attached.</p>
          <form action="/pairing" method="get" className="setup-form">
            <label><span>Prop firm</span><select name="firm" defaultValue="validation-workspace"><option value="validation-workspace">Validation workspace — no live firm rules</option></select><small>Real firms are added only after official sources are reviewed.</small></label>
            <div className="form-grid"><label><span>Program</span><select name="program" defaultValue="evaluation"><option value="evaluation">Evaluation sandbox</option></select></label><label><span>Phase</span><select name="phase" defaultValue="phase-1"><option value="phase-1">Phase 1</option></select></label></div>
            <div className="form-grid"><label><span>Account size</span><select name="size" defaultValue="10000000"><option value="10000000">$100,000 USD</option><option value="5000000">$50,000 USD</option><option value="2500000">$25,000 USD</option></select></label><label><span>Platform</span><select name="platform" defaultValue="mt5"><option value="mt5">MetaTrader 5</option></select></label></div>
            <label className="check-row"><input type="checkbox" required /><span><strong>I understand these are illustrative rules.</strong><small>FundedFence will not activate protection for a real account until an authorized reviewer verifies the applicable rules and sources.</small></span></label>
            <div className="form-actions"><Link className="button button-secondary" href="/dashboard">Back to preview</Link><button className="button button-primary" type="submit">Continue to connector <span>→</span></button></div>
          </form>
        </section>
      </div>
    </main>
  );
}
