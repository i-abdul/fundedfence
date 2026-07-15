import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getChatGPTUser();
  return <AppShell active="Overview"><DashboardView userLabel={user?.displayName} /></AppShell>;
}
