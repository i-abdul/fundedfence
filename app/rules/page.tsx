import { AppShell } from "@/components/AppShell";
import { requireAppUser } from "@/lib/server/auth";
import { requireDatabase } from "@/lib/server/runtime";
import { isRuleAdmin, listRuleProfiles } from "@/lib/server/rule-profiles";
import { RuleProfilesView } from "./RuleProfilesView";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const user = await requireAppUser("/rules");
  const database = await requireDatabase();
  const profiles = await listRuleProfiles(database);
  return (
    <AppShell active="Rules">
      <main className="dashboard-shell rules-page">
        <div className="dashboard-topbar">
          <div><p className="eyebrow">Versioned rules engine</p><h1>FundedNext rule profiles</h1><p className="page-intro">Official evidence, interpretation, approval, activation, and rollback in one audit trail.</p></div>
          <span className="status-pill healthy">Sources captured</span>
        </div>
        <RuleProfilesView profiles={profiles} canAdmin={isRuleAdmin(user.email)} />
        <footer className="product-footer"><span>Rule changes are never applied silently. Activation creates account-level recalculation jobs and preserves the previous version.</span></footer>
      </main>
    </AppShell>
  );
}
