import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { getAppUser } from "@/lib/server/auth";

type AuthPageProps = {
  searchParams: Promise<{ error?: string; return_to?: string }>;
};

export default async function LoginPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.return_to ?? "/dashboard");
  const user = await getAppUser();
  if (user) redirect(returnTo);
  return (
    <main className="auth-page">
      <div className="auth-brand"><Brand /></div>
      <section className="auth-card">
        <div className="auth-shield"><span className="brand-mark"><span /></span></div>
        <p className="eyebrow">Secure workspace access</p>
        <h1>Welcome back.</h1>
        <p>Sign in with your FundedFence password, or connect Google once OAuth keys are configured.</p>
        {params.error && <p className="form-error" role="alert">{params.error}</p>}
        <form className="auth-form" action="/api/auth/login" method="post">
          <input type="hidden" name="return_to" value={returnTo} />
          <label><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
          <label><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button button-primary full" type="submit">Sign in</button>
        </form>
        <a className="button button-secondary full" href={`/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`}>Continue with Google</a>
        <div className="auth-divider"><span />App-owned sessions<span /></div>
        <ul><li>Server-side identity checks</li><li>Tenant-scoped account access</li><li>Revocable connector credentials</li></ul>
        <p className="auth-switch">New to FundedFence? <Link href={`/signup?return_to=${encodeURIComponent(returnTo)}`}>Create your workspace</Link></p>
      </section>
      <Link className="auth-back" href="/">Back to FundedFence</Link>
    </main>
  );
}

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}
