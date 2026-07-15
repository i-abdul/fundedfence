"use client";

import { useState } from "react";
import type { AccountContext } from "@/lib/product/firm-catalog";

type PairingResult = { pairingCode: string; expiresAt: string; accountId: string };

export function PairingPanel({ authenticated, signInPath, accountContext }: { authenticated: boolean; signInPath: string; accountContext: AccountContext }) {
  const [result, setResult] = useState<PairingResult | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function createCode() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/pairing-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountLabel: `${accountContext.accountSizeLabel} ${accountContext.phase}`,
          accountSizeMinor: accountContext.accountSizeMinor,
          accountPrice: accountContext.accountPrice,
          currency: accountContext.currency,
          firmId: accountContext.firmId,
          firmLabel: accountContext.firmLabel,
          programId: accountContext.programId,
          programLabel: accountContext.programLabel,
          phase: accountContext.phase,
          platform: accountContext.platform,
        }),
      });
      const payload = await response.json() as PairingResult & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Pairing code could not be created.");
      setResult(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pairing code could not be created.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pairing-panel">
      <div className="pairing-code-card">
        <div className="selected-account-card">
          <small>SELECTED ACCOUNT</small>
          <strong>{accountContext.firmLabel} · {accountContext.programLabel}</strong>
          <span>{accountContext.accountSizeLabel}{accountContext.accountPrice ? ` · ${accountContext.accountPrice}` : ""} · {accountContext.phase} · MT5</span>
          {accountContext.ruleStatus === "needs-verification" && <em>Rules need verification from your FundedNext account before protection is active.</em>}
        </div>
        <div className="pairing-code-header"><span><small>SINGLE-USE PAIRING CODE</small><strong>{result ? "Ready for MT5" : "Sign in to generate"}</strong></span><em>{result ? "10 MIN" : "SECURE"}</em></div>
        <div className="pairing-code" aria-live="polite">{result ? result.pairingCode.split("").map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>) : Array.from({ length: 6 }, (_, index) => <span key={index}>•</span>)}</div>
        {result ? <p>Expires {new Date(result.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. It cannot be reused.</p> : <p>The code is shown only after an authenticated account workspace is created.</p>}
        {message && <p className="form-error" role="alert">{message}</p>}
        {authenticated ? <button className="button button-primary full" type="button" onClick={createCode} disabled={loading}>{loading ? "Creating secure code…" : result ? "Replace pairing code" : "Generate pairing code"}</button> : <a className="button button-primary full" href={signInPath}>Sign in to generate code</a>}
      </div>
      <div className="diagnostic-card"><div className="diagnostic-heading"><span className="diagnostic-icon">⌁</span><p><strong>Connection diagnostics</strong><small>Waiting for a read-only connector</small></p></div><dl><div><dt>Web app</dt><dd><i className="healthy" /> Ready</dd></div><div><dt>Pairing code</dt><dd><i className={result ? "healthy" : "neutral"} /> {result ? "Active" : "Not generated"}</dd></div><div><dt>MT5 connector</dt><dd><i className="neutral" /> Waiting</dd></div><div><dt>Account snapshot</dt><dd><i className="neutral" /> Waiting</dd></div></dl></div>
    </div>
  );
}
