import Link from "next/link";
import { Brand } from "@/components/Brand";
import { firmCatalog } from "@/lib/product/firm-catalog";
import { requireAppUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const allPrograms = firmCatalog.flatMap((firm) =>
  firm.programs.map((program) => ({ ...program, firmLabel: firm.label })),
);

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
        <aside className="setup-steps" aria-label="Setup progress">
          <p className="eyebrow">Four calm steps</p>
          <ol>
            <li className="active"><span>1</span><p><strong>Account details</strong><small>Choose the monitoring context</small></p></li>
            <li><span>2</span><p><strong>Confirm rules</strong><small>Review sourced definitions</small></p></li>
            <li><span>3</span><p><strong>Connect MT5</strong><small>Pair the read-only EA</small></p></li>
            <li><span>4</span><p><strong>Verify live data</strong><small>Check freshness and positions</small></p></li>
          </ol>
          <div className="setup-assurance"><span className="brand-mark"><span /></span><p><strong>No MT5 password required</strong><small>FundedFence pairs to the terminal already signed in on your computer.</small></p></div>
        </aside>
        <section className="setup-form-card">
          <div className="setup-progress"><span>Step 1 of 4</span><div><i /><i /><i /><i /></div></div>
          <p className="eyebrow">Account context</p>
          <h1>Tell us what you are protecting.</h1>
          <p className="setup-lead">Select your FundedNext trial/account context. Monitoring remains paused until the selected rule model is verified against your actual FundedNext dashboard.</p>
          <form action="/pairing" method="get" className="setup-form">
            <label>
              <span>Prop firm</span>
              <select name="firm" defaultValue="fundednext">
                {firmCatalog.map((firm) => <option value={firm.id} key={firm.id}>{firm.label}</option>)}
              </select>
              <small>FundedNext is available now. More firms can be added through the same catalog.</small>
            </label>
            <div className="form-grid">
              <label>
                <span>Program</span>
                <select name="program" defaultValue="fundednext-stellar-challenge">
                  {allPrograms.map((program) => <option value={program.id} key={program.id}>{program.firmLabel} · {program.label} · {program.market}</option>)}
                </select>
              </label>
              <label>
                <span>Phase</span>
                <select name="phase" defaultValue="Phase 1">
                  <option value="Phase 1">Phase 1</option>
                  <option value="Phase 2">Phase 2</option>
                  <option value="Evaluation">Evaluation</option>
                  <option value="Instant funded">Instant funded</option>
                  <option value="Funded">Funded</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                <span>Account size</span>
                <select name="size" defaultValue="10000000">
                  <option value="500000">$5,000 USD</option>
                  <option value="1000000">$10,000 USD</option>
                  <option value="2500000">$25,000 USD</option>
                  <option value="5000000">$50,000 USD</option>
                  <option value="10000000">$100,000 USD</option>
                  <option value="15000000">$150,000 USD</option>
                  <option value="20000000">$200,000 USD</option>
                </select>
              </label>
              <label><span>Platform</span><select name="platform" defaultValue="mt5"><option value="mt5">MetaTrader 5</option></select></label>
            </div>
            <label className="check-row"><input type="checkbox" required /><span><strong>I understand this rule model is not verified yet.</strong><small>FundedFence will not activate protection for a real account until we verify the official FundedNext rules and account parameters.</small></span></label>
            <div className="form-actions"><Link className="button button-secondary" href="/dashboard">Back to preview</Link><button className="button button-primary" type="submit">Continue to connector <span>→</span></button></div>
          </form>
        </section>
      </div>
    </main>
  );
}
