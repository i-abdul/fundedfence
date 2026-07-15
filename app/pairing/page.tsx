import Link from "next/link";
import { Brand } from "@/components/Brand";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { PairingPanel } from "./PairingPanel";

export const dynamic = "force-dynamic";

export default async function PairingPage() {
  const user = await getChatGPTUser();
  return (
    <main className="setup-page pairing-page">
      <header className="setup-header"><Brand /><span>MT5 connector</span><Link href="/dashboard">Exit setup</Link></header>
      <div className="pairing-layout">
        <section className="pairing-copy"><p className="eyebrow">Step 3 of 4</p><h1>Connect MT5 without sharing a password.</h1><p>The connector attaches to one chart, reads permitted account data, signs every message, and never sends trading instructions.</p><div className="read-only-callout"><span className="brand-mark"><span /></span><div><strong>Read-only guarantee</strong><p>The source contains no calls to OrderSend, trade classes, position modification, or position closing functions.</p></div></div><ol className="install-steps"><li><span>1</span><div><strong>Install the connector</strong><p>Download the reviewed <code>PropShieldConnector.mq5</code> source or use the signed desktop installer when released.</p><a href="/PropShieldConnector.mq5" download>Download EA source →</a></div></li><li><span>2</span><div><strong>Allow the approved URL</strong><p>In MT5, open Tools → Options → Expert Advisors and add this site’s HTTPS origin to allowed WebRequest URLs.</p></div></li><li><span>3</span><div><strong>Attach and pair</strong><p>Compile the EA, attach it to one chart, paste the six-digit code, and confirm the account shown in diagnostics.</p></div></li></ol><div className="manual-note"><strong>Manual installation only in this milestone.</strong><span>The signed Windows installer, terminal auto-detection, and automatic updates are tracked for the next connector loop.</span></div></section>
        <PairingPanel authenticated={Boolean(user)} signInPath={chatGPTSignInPath("/pairing")} />
      </div>
    </main>
  );
}
