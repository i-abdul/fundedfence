"use client";

import { useEffect, useState } from "react";
import type { AccountContext } from "@/lib/product/firm-catalog";

type PairingResult = { pairingCode: string; expiresAt: string; accountId: string };
type LiveState = {
  account?: {
    state?: string | null;
    last_heartbeat_at?: string | null;
    last_snapshot_at?: string | null;
  };
  snapshot?: unknown | null;
  dataFreshness?: "live" | "delayed" | "offline";
};

export function PairingPanel({ authenticated, signInPath, accountContext }: { authenticated: boolean; signInPath: string; accountContext: AccountContext }) {
  const [result, setResult] = useState<PairingResult | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!result?.accountId) return;
    const accountId = result.accountId;
    let cancelled = false;

    async function refreshLiveState() {
      try {
        const response = await fetch(`/api/v1/accounts/${accountId}/live`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as LiveState;
        if (!cancelled) setLiveState(payload);
      } catch {
        if (!cancelled) setLiveState((current) => current);
      }
    }

    void refreshLiveState();
    const interval = window.setInterval(refreshLiveState, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [result?.accountId]);

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
      <Diagnostics result={result} liveState={liveState} />
    </div>
  );
}

function Diagnostics({ result, liveState }: { result: PairingResult | null; liveState: LiveState | null }) {
  const connectionState = liveState?.account?.state ?? null;
  const freshness = liveState?.dataFreshness ?? "offline";
  const hasHeartbeat = Boolean(liveState?.account?.last_heartbeat_at);
  const hasSnapshot = Boolean(liveState?.account?.last_snapshot_at || liveState?.snapshot);
  const connectorTone = freshness === "live" ? "healthy" : hasHeartbeat || connectionState === "reconnecting" ? "caution" : "neutral";
  const connectorLabel = freshness === "live" ? "Live" : hasHeartbeat ? "Delayed" : connectionState === "reconnecting" ? "Paired" : "Waiting";
  const snapshotTone = hasSnapshot ? "healthy" : result ? "caution" : "neutral";
  const snapshotLabel = hasSnapshot ? "Received" : result ? "Waiting for first snapshot" : "Waiting";
  const heading = freshness === "live" ? "Live connector online" : hasHeartbeat ? "Connector recently seen" : result ? "Waiting for MT5 connector" : "Waiting for a read-only connector";

  return (
    <div className="diagnostic-card">
      <div className="diagnostic-heading"><span className="diagnostic-icon">⌁</span><p><strong>Connection diagnostics</strong><small>{heading}</small></p></div>
      <dl>
        <div><dt>Web app</dt><dd><i className="healthy" /> Ready</dd></div>
        <div><dt>Pairing code</dt><dd><i className={result ? "healthy" : "neutral"} /> {result ? "Generated" : "Not generated"}</dd></div>
        <div><dt>MT5 connector</dt><dd><i className={connectorTone} /> {connectorLabel}</dd></div>
        <div><dt>Account snapshot</dt><dd><i className={snapshotTone} /> {snapshotLabel}</dd></div>
      </dl>
    </div>
  );
}
