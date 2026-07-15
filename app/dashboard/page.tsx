import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";
import { getAppUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAppUser();
  return <AppShell active="Overview"><DashboardView userLabel={user?.displayName} /></AppShell>;
}
