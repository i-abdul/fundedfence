import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { getAppUser } from "@/lib/server/auth";

type AuthPageProps = {
  searchParams: Promise<{ error?: string; return_to?: string }>;
};

export default async function SignupPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.return_to ?? "/onboarding");
  const user = await getAppUser();
  if (user) redirect(returnTo);
  return (
    <main className="auth-page">
      <div className="auth-brand"><Brand /></div>
      <section className="auth-card">
        <div className="auth-shield"><span className="brand-mark"><span /></span></div>
        <p className="eyebrow">Your risk workspace</p>
        <h1>Start with clarity.</h1>
        <p>Create a FundedFence workspace, then choose the account context and pair MT5.</p>
        {params.error && <p className="form-error" role="alert">{params.error}</p>}
        <form className="auth-form" action="/api/auth/signup" method="post">
          <input type="hidden" name="return_to" value={returnTo} />
          <label><span>Name</span><input name="displayName" type="text" autoComplete="name" required /></label>
          <label><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
          <label><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
          <button className="button button-primary full" type="submit">Create workspace</button>
        </form>
        <a className="button button-secondary full" href="/api/auth/google/start">Continue with Google</a>
        <div className="auth-divider"><span />No MT5 password collection<span /></div>
        <ul><li>Single-use connector pairing</li><li>Read-only MT5 source</li><li>Data export and deletion foundation</li></ul>
        <p className="auth-switch">Already have a workspace? <Link href={`/login?return_to=${encodeURIComponent(returnTo)}`}>Sign in</Link></p>
      </section>
      <Link className="auth-back" href="/">Back to FundedFence</Link>
    </main>
  );
}

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/onboarding";
}
