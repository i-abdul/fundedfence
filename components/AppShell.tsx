import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./Brand";

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
          <span className="account-avatar">AR</span>
          <span><strong>Account workspace</strong><small>Protected preview</small></span>
          <span aria-hidden="true">···</span>
        </div>
      </aside>
      <div className="app-main">
        <header className="mobile-header"><Brand /><Link className="quiet-link" href="/onboarding">Connect</Link></header>
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
