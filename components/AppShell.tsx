import Link from "next/link";
import type { ReactNode } from "react";
import { getSessionIdleTimeoutSeconds } from "@/lib/server/auth";
import { Brand } from "./Brand";
import { SessionActivityGuard } from "./SessionActivityGuard";

const navigation = [
  ["Overview", "/dashboard", "OV"],
  ["Rules", "/rules", "RL"],
  ["Positions", "/dashboard#positions", "PS"],
  ["Timeline", "/dashboard#timeline", "TL"],
  ["Simulator", "/dashboard#simulator", "SM"],
] as const;

export function AppShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="app-frame">
      <SessionActivityGuard idleTimeoutSeconds={getSessionIdleTimeoutSeconds()} />
      <aside className="sidebar">
        <div className="sidebar-top"><Brand /></div>
        <nav className="side-nav" aria-label="Product navigation">
          {navigation.map(([label, href, glyph]) => (
            <Link href={href} key={label} className={active === label ? "active" : ""}>
              <span className="nav-glyph" aria-hidden="true">{glyph}</span><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-account">
          <span className="account-avatar">FF</span>
          <span><strong>Account workspace</strong><small>Protected preview</small></span>
          <form action="/api/auth/logout" method="post">
            <button className="signout-button" type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="app-main">
        <header className="mobile-header">
          <Brand />
          <div className="mobile-actions">
            <Link className="quiet-link" href="/onboarding">Connect</Link>
            <form action="/api/auth/logout" method="post">
              <button className="signout-button" type="submit">Sign out</button>
            </form>
          </div>
        </header>
        {children}
      </div>
      <nav className="mobile-nav" aria-label="Mobile product navigation">
        {navigation.slice(0, 4).map(([label, href, glyph]) => (
          <Link href={href} key={label} className={active === label ? "active" : ""}><span>{glyph}</span><small>{label}</small></Link>
        ))}
      </nav>
    </div>
  );
}
