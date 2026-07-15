import Link from "next/link";
import { Brand } from "@/components/Brand";
import { firmCatalog } from "@/lib/product/firm-catalog";
import { requireAppUser } from "@/lib/server/auth";
import { AccountSetupForm } from "./AccountSetupForm";

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
          <p className="setup-lead">Select your FundedNext CFD trial/account context. Monitoring remains paused until the selected rule model and pricing size are verified against your actual FundedNext dashboard.</p>
          <AccountSetupForm firms={firmCatalog} />
        </section>
      </div>
    </main>
  );
}
