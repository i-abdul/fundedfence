import Link from "next/link";
import { Brand } from "@/components/Brand";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";

export default function LoginPage() {
  return <main className="auth-page"><div className="auth-brand"><Brand /></div><section className="auth-card"><div className="auth-shield"><span className="brand-mark"><span /></span></div><p className="eyebrow">Secure workspace access</p><h1>Welcome back.</h1><p>PropShield uses your ChatGPT identity on the hosted app. It does not store a separate password.</p><a className="button button-primary full" href={chatGPTSignInPath("/dashboard")}>Sign in with ChatGPT</a><div className="auth-divider"><span />Protected by the hosting identity layer<span /></div><ul><li>Server-side identity checks</li><li>Tenant-scoped account access</li><li>Revocable connector credentials</li></ul><p className="auth-switch">New to PropShield? <Link href="/signup">Create your workspace</Link></p></section><Link className="auth-back" href="/">← Back to PropShield</Link></main>;
}
