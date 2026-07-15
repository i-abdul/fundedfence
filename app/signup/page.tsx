import Link from "next/link";
import { Brand } from "@/components/Brand";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";

export default function SignupPage() {
  return <main className="auth-page"><div className="auth-brand"><Brand /></div><section className="auth-card"><div className="auth-shield"><span className="brand-mark"><span /></span></div><p className="eyebrow">Your risk workspace</p><h1>Start with clarity.</h1><p>Create a PropShield workspace through the hosting identity layer, then choose the account context and pair MT5.</p><a className="button button-primary full" href={chatGPTSignInPath("/onboarding")}>Continue with ChatGPT</a><div className="auth-divider"><span />No separate PropShield password<span /></div><ul><li>No MT5 password collection</li><li>Single-use connector pairing</li><li>Data export and deletion foundation</li></ul><p className="auth-switch">Already have a workspace? <Link href="/login">Sign in</Link></p></section><Link className="auth-back" href="/">← Back to PropShield</Link></main>;
}
