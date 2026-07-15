import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <div className="auth-brand"><Brand /></div>
      <section className="auth-card">
        <div className="auth-shield"><span className="brand-mark"><span /></span></div>
        <p className="eyebrow">Account recovery</p>
        <h1>Password reset is next.</h1>
        <p>SMTP is not configured yet. Once mail is ready, FundedFence can send secure reset links from this screen.</p>
        <Link className="button button-primary full" href="/login">Return to sign in</Link>
        <p className="auth-switch">Need connector help? <Link href="/pairing">Open diagnostics</Link></p>
      </section>
      <Link className="auth-back" href="/">Back to FundedFence</Link>
    </main>
  );
}
