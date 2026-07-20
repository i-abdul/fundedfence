"use client";

import { useState } from "react";
import type { RuleLifecycleStatus } from "@/lib/domain/rule-profile";
import type { RuleProfileView, RuleWorkflowAction } from "@/lib/server/rule-profiles";

export function RuleProfilesView({ profiles, canAdmin }: { profiles: RuleProfileView[]; canAdmin: boolean }) {
  const [busyVersion, setBusyVersion] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runWorkflow(action: RuleWorkflowAction, versionId: string) {
    if ((action === "activate" || action === "rollback") && !window.confirm(`${action === "activate" ? "Activate" : "Restore"} this rule version for every matching account?`)) return;
    setBusyVersion(versionId);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/rule-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, versionId }),
      });
      const payload = await response.json() as { affectedAccounts?: number; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "The rule action was not completed.");
      setMessage(`Rule action completed. ${payload.affectedAccounts ?? 0} matching account(s) queued for recalculation.`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The rule action was not completed.");
      setBusyVersion(null);
    }
  }

  return (
    <>
      <section className="rule-engine-summary">
        <div><small>OFFICIAL PROFILES</small><strong>{profiles.length}</strong><span>FundedNext program phases</span></div>
        <div><small>SOURCE CAPTURE</small><strong>16 Jul 2026</strong><span>Versioned and hash-tracked</span></div>
        <div><small>WORKFLOW</small><strong>Review → activate</strong><span>No draft can silently affect an account</span></div>
      </section>
      {!canAdmin && <div className="rule-workflow-note" role="note">You can inspect every rule and source. Approval controls appear only for emails listed in <code>RULE_ADMIN_EMAILS</code>.</div>}
      {message && <div className="rule-workflow-message" role="status">{message}</div>}
      <section className="rule-profile-list">
        {profiles.map((profile) => {
          const version = profile.versions[0];
          const rule = version.definition;
          const action = actionFor(version.status);
          return (
            <article className="rule-profile-card" key={profile.ruleSetId}>
              <header>
                <div><p className="eyebrow">{profile.firmName} · {rule.market}</p><h2>{profile.programName}</h2><span>{profile.phase} · version {version.version}</span></div>
                <em className={`rule-lifecycle ${version.status}`}>{statusLabel(version.status)}</em>
              </header>
              <div className="rule-profile-metrics">
                <Metric label="Profit target" value={percent(rule.profitTargetBps)} />
                <Metric label="Daily loss" value={percent(rule.dailyLoss?.limitBps ?? null)} />
                <Metric label="Maximum loss" value={percent(rule.maximumLoss.limitBps)} />
                <Metric label="Minimum days" value={rule.minimumTradingDays === 0 ? "None" : String(rule.minimumTradingDays)} />
              </div>
              <div className="rule-profile-details">
                <dl>
                  <div><dt>Loss model</dt><dd>{humanize(rule.maximumLoss.model)}</dd></div>
                  <div><dt>Daily reset</dt><dd>{rule.dailyLoss ? "00:00 broker time" : "Not applicable"}</dd></div>
                  <div><dt>Overnight / weekend</dt><dd>{rule.holding.overnight} / {rule.holding.weekend}</dd></div>
                  <div><dt>News trading</dt><dd>{newsLabel(rule.news)}</dd></div>
                  {rule.maximumOpenPositions != null && <div><dt>Maximum open positions</dt><dd>{rule.maximumOpenPositions}</dd></div>}
                  {rule.expertAdvisors && <div><dt>Expert advisors</dt><dd>{humanize(rule.expertAdvisors.mode)}</dd></div>}
                </dl>
                <div className="rule-source-list">
                  <strong>{version.sources.length} official source{version.sources.length === 1 ? "" : "s"}</strong>
                  {version.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>{source.title}<span>↗</span></a>)}
                </div>
              </div>
              <details className="rule-interpretation">
                <summary>Interpretation, unknowns, and version history</summary>
                <div>
                  <strong>Interpretation</strong>
                  {rule.interpretationNotes.map((note) => <p key={note}>{note}</p>)}
                  {rule.expertAdvisors?.note && <p>{rule.expertAdvisors.note}</p>}
                  <strong>Still needs a separate official source</strong>
                  <p>{rule.unknownInputs.join(" · ")}</p>
                  <strong>Version history</strong>
                  <div className="rule-version-history">
                    {profile.versions.map((item) => {
                      const historicalAction = actionFor(item.status);
                      return <div key={item.id}><span>v{item.version} · {statusLabel(item.status)} · {percent(item.definition.maximumLoss.limitBps)} max loss · {item.sources.length} sources</span>{canAdmin && historicalAction === "rollback" && <button type="button" disabled={busyVersion === item.id} onClick={() => runWorkflow("rollback", item.id)}>Restore</button>}</div>;
                    })}
                  </div>
                </div>
              </details>
              <footer>
                <span>{profile.activeVersionId === version.id ? "Assigned as the effective profile" : "Not active on trading accounts"}</span>
                {canAdmin && action && <button className="button button-primary rule-action" disabled={busyVersion === version.id} onClick={() => runWorkflow(action, version.id)}>{busyVersion === version.id ? "Working…" : actionLabel(action)}</button>}
              </footer>
            </article>
          );
        })}
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

function actionFor(status: RuleLifecycleStatus): RuleWorkflowAction | null {
  if (status === "validated") return "approve";
  if (status === "approved") return "activate";
  if (status === "superseded") return "rollback";
  return null;
}

function actionLabel(action: RuleWorkflowAction): string {
  if (action === "approve") return "Approve version";
  if (action === "activate") return "Activate version";
  return "Restore as new version";
}

function statusLabel(status: RuleLifecycleStatus): string {
  return status === "source-attached" ? "Source attached" : status[0].toUpperCase() + status.slice(1);
}

function percent(bps: number | null): string {
  if (bps === null) return "None";
  return `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function humanize(value: string): string {
  return value.replaceAll("-", " ").replace(/^./, (character) => character.toUpperCase());
}

function newsLabel(news: RuleProfileView["versions"][number]["definition"]["news"]): string {
  if (news.mode === "allowed") return "Allowed";
  return `Allowed · ${percent(news.qualifyingProfitBps)} of profit from qualifying profitable trades is counted · ${news.windowMinutesBefore} min before / ${news.windowMinutesAfter} min after${news.affectedInstrumentsOnly ? " · affected instruments only" : ""}`;
}
