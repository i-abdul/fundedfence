import { cookies } from "next/headers";

export async function GET(request: Request): Promise<Response> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.APP_BASE_URL ?? new URL(request.url).origin;
  if (!clientId) return Response.redirect(new URL("/login?error=Google%20sign-in%20is%20not%20configured%20yet.", baseUrl), 303);
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("fundedfence_google_state", state, { httpOnly: true, sameSite: "lax", secure: baseUrl.startsWith("https://"), maxAge: 600, path: "/" });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 303);
}
