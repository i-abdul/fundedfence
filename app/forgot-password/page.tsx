import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function ForgotPasswordPage() {
  return <main className="auth-page"><div className="auth-brand"><Brand /></div><section className="auth-card"><div className="auth-shield"><span className="brand-mark"><span /></span></div><p className="eyebrow">Account recovery</p><h1>No PropShield password to reset.</h1><p>Identity is managed by the hosting sign-in layer. Recover access through your ChatGPT account, then return to PropShield.</p><Link className="button button-primary full" href="/login">Return to sign in</Link><p className="auth-switch">Need connector help? <Link href="/pairing">Open diagnostics</Link></p></section><Link className="auth-back" href="/">← Back to PropShield</Link></main>;
}
