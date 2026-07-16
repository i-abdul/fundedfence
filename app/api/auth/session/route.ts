import { getSessionIdleTimeoutSeconds, refreshSessionActivity } from "@/lib/server/auth";

export async function POST(): Promise<Response> {
  const user = await refreshSessionActivity();
  if (!user) {
    return Response.json({ authenticated: false }, {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  }
  return Response.json({
    authenticated: true,
    idleTimeoutSeconds: getSessionIdleTimeoutSeconds(),
  }, { headers: { "cache-control": "no-store" } });
}
