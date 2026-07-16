"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountContext } from "@/lib/product/firm-catalog";

type PairingResult = { pairingCode: string; expiresAt: string; accountId: string; replacingDevice?: boolean };
type PairingLifecycle = "active" | "used" | "expired";
type TrackedAccount = {
  accountId: string;
  label: string;
  status: string;
  connectionState: string | null;
  lastHeartbeatAt: string | null;
  lastSnapshotAt: string | null;
};
type PairingOverview = {
  trackedAccount: TrackedAccount | null;
  latestPairing: { accountId: string; expiresAt: string; status: PairingLifecycle } | null;
};
type LiveState = {
  account?: {
    id?: string;
    label?: string;
    status?: string;
    state?: string | null;
    last_heartbeat_at?: string | null;
    last_snapshot_at?: string | null;
  };
  snapshot?: unknown | null;
  dataFreshness?: "live" | "delayed" | "offline";
};

export function PairingPanel({ authenticated, signInPath, accountContext }: { authenticated: boolean; signInPath: string; accountContext: AccountContext }) {
  const router = useRouter();
  const [result, setResult] = useState<PairingResult | null>(null);
  const [overview, setOverview] = useState<PairingOverview | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;

    async function loadPairingOverview() {
      try {
        const response = await fetch("/api/v1/pairing-codes", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as PairingOverview;
        if (!cancelled) setOverview(payload);
      } catch {
        // Live polling below remains available when this recovery request fails.
      }
    }

    void loadPairingOverview();
    return () => { cancelled = true; };
  }, [authenticated]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const resultExpired = Boolean(result && Date.parse(result.expiresAt) <= now);
  const trackedAccountId = result && !resultExpired
    ? result.accountId
    : overview?.trackedAccount?.accountId ?? result?.accountId ?? null;

  useEffect(() => {
    if (!trackedAccountId) return;
    let cancelled = false;

    async function refreshLiveState() {
      try {
        const response = await fetch(`/api/v1/accounts/${trackedAccountId}/live`, { cache: "no-store" });
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
  }, [trackedAccountId]);

  async function createCode() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/pairing-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: paired && trackedAccountId ? trackedAccountId : undefined,
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
      setNow(Date.now());
      setLiveState(null);
      setOverview({
        trackedAccount: {
          accountId: payload.accountId,
          label: `${accountContext.accountSizeLabel} · ${accountContext.firmLabel} ${accountContext.programLabel}`,
          status: "pairing",
          connectionState: null,
          lastHeartbeatAt: null,
          lastSnapshotAt: null,
        },
        latestPairing: { accountId: payload.accountId, expiresAt: payload.expiresAt, status: "active" },
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pairing code could not be created.");
    } finally {
      setLoading(false);
    }
  }

  const paired = liveState?.account?.status === "connected" || overview?.trackedAccount?.status === "connected";
  const remainingMs = result ? Math.max(0, Date.parse(result.expiresAt) - now) : 0;
  const visibleCode = Boolean(result && !resultExpired && !paired);
  const restoredActiveCode = !result && overview?.latestPairing?.status === "active";
  const codeTitle = paired ? "Used by MT5" : resultExpired ? "Code expired" : visibleCode ? "Ready for MT5" : restoredActiveCode ? "Active code hidden" : "Generate a secure code";
  const codeBadge = paired ? "PAIRED" : visibleCode ? formatRemaining(remainingMs) : resultExpired ? "EXPIRED" : "SECURE";

  useEffect(() => {
    // Redirect only when this page generated the code that was just consumed.
    // An already-paired account can still open this page for diagnostics.
    if (!result || !paired) return;
    const redirectTimer = window.setTimeout(() => router.replace("/dashboard"), 1_200);
    return () => window.clearTimeout(redirectTimer);
  }, [paired, result, router]);

  return (
    <div className="pairing-panel">
      <div className="pairing-code-card">
        <div className="selected-account-card">
          <small>SELECTED ACCOUNT</small>
          <strong>{accountContext.firmLabel} · {accountContext.programLabel}</strong>
          <span>{accountContext.accountSizeLabel}{accountContext.accountPrice ? ` · ${accountContext.accountPrice}` : ""} · {accountContext.phase} · MT5</span>
          {accountContext.ruleStatus === "needs-verification" && <em>Rules need verification from your FundedNext account before protection is active.</em>}
        </div>
        <div className="pairing-code-header"><span><small>SINGLE-USE PAIRING CODE</small><strong>{codeTitle}</strong></span><em>{codeBadge}</em></div>
        <div className="pairing-code" aria-live="polite">
          {visibleCode
            ? result!.pairingCode.split("").map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)
            : Array.from({ length: 6 }, (_, index) => <span key={index}>•</span>)}
        </div>
        {visibleCode && <p>Expires in {formatRemaining(remainingMs)}. Replacing it immediately invalidates this code.</p>}
        {paired && <p>This single-use code has been consumed. Re-pairing will revoke this connector immediately and keep the same account workspace and history.</p>}
        {resultExpired && !paired && <p>This code can no longer be used. Generate a new one before pairing MT5.</p>}
        {restoredActiveCode && <p>An unexpired code exists, but codes are shown only once. Generate a replacement if you did not save it.</p>}
        {!result && !paired && !restoredActiveCode && <p>The code is shown only after an authenticated account workspace is created.</p>}
        {result && paired
          ? <p className="form-success" role="status">Pairing successful. Opening your dashboard…</p>
          : message && <p className="form-error" role="alert">{message}</p>}
        {authenticated
          ? <button className="button button-primary full" type="button" onClick={createCode} disabled={loading}>{loading ? "Creating secure code…" : paired ? "Re-pair this MT5 account" : visibleCode || restoredActiveCode ? "Replace pairing code" : "Generate pairing code"}</button>
          : <a className="button button-primary full" href={signInPath}>Sign in to generate code</a>}
      </div>
      <Diagnostics result={result} overview={overview} liveState={liveState} resultExpired={resultExpired} />
    </div>
  );
}

function Diagnostics({ result, overview, liveState, resultExpired }: { result: PairingResult | null; overview: PairingOverview | null; liveState: LiveState | null; resultExpired: boolean }) {
  const connectionState = liveState?.account?.state ?? overview?.trackedAccount?.connectionState ?? null;
  const freshness = liveState?.dataFreshness ?? "offline";
  const hasHeartbeat = Boolean(liveState?.account?.last_heartbeat_at ?? overview?.trackedAccount?.lastHeartbeatAt);
  const hasSnapshot = Boolean(liveState?.account?.last_snapshot_at ?? liveState?.snapshot ?? overview?.trackedAccount?.lastSnapshotAt);
  const paired = liveState?.account?.status === "connected" || overview?.trackedAccount?.status === "connected";
  const connectorTone = freshness === "live" ? "healthy" : freshness === "delayed" || paired ? "caution" : "neutral";
  const connectorLabel = freshness === "live" ? "Live" : freshness === "delayed" ? "Delayed" : hasHeartbeat ? "Offline" : paired || connectionState === "reconnecting" ? "Paired" : "Waiting";
  const snapshotTone = hasSnapshot ? "healthy" : paired || result ? "caution" : "neutral";
  const snapshotLabel = hasSnapshot ? "Received" : paired ? "Waiting for first snapshot" : "Waiting";
  const latestStatus = overview?.latestPairing?.status;
  const pairingLabel = paired || latestStatus === "used" ? "Used" : resultExpired || latestStatus === "expired" ? "Expired" : result || latestStatus === "active" ? "Active" : "Not generated";
  const pairingTone = pairingLabel === "Used" || pairingLabel === "Active" ? "healthy" : pairingLabel === "Expired" ? "caution" : "neutral";
  const heading = freshness === "live" ? "Live connector online" : freshness === "delayed" ? "Connector updates are delayed" : hasHeartbeat ? "Live protection is paused" : paired ? "Paired — waiting for connector data" : result ? "Waiting for MT5 connector" : "Waiting for a read-only connector";

  return (
    <div className="diagnostic-card">
      <div className="diagnostic-heading"><span className="diagnostic-icon">⌁</span><p><strong>Connection diagnostics</strong><small>{heading}</small></p></div>
      <dl>
        <div><dt>Web app</dt><dd><i className="healthy" /> Ready</dd></div>
        <div><dt>Pairing code</dt><dd><i className={pairingTone} /> {pairingLabel}</dd></div>
        <div><dt>MT5 connector</dt><dd><i className={connectorTone} /> {connectorLabel}</dd></div>
        <div><dt>Account snapshot</dt><dd><i className={snapshotTone} /> {snapshotLabel}</dd></div>
      </dl>
    </div>
  );
}

function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
