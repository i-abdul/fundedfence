import { cookies } from "next/headers";
import { createOrUpdateUser, setSession } from "@/lib/server/auth";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const baseUrl = process.env.APP_BASE_URL ?? url.origin;
  try {
    const cookieStore = await cookies();
    const expectedState = cookieStore.get("fundedfence_google_state")?.value;
    if (!expectedState || url.searchParams.get("state") !== expectedState) throw new Error("Google sign-in state did not match.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Google did not return an authorization code.");
    const token = await exchangeCode(code, `${baseUrl}/api/auth/google/callback`);
    if (!token.access_token) throw new Error(token.error ?? "Google token exchange failed.");
    const profile = await fetchGoogleProfile(token.access_token);
    if (!profile.email_verified) throw new Error("Google email address is not verified.");
    const user = await createOrUpdateUser(profile.email, profile.name ?? profile.email, undefined, profile.sub);
    await setSession(user);
    cookieStore.delete("fundedfence_google_state");
    return Response.redirect(new URL("/dashboard", baseUrl), 303);
  } catch (error) {
    return Response.redirect(new URL(`/login?error=${encodeURIComponent(error instanceof Error ? error.message : "Google sign-in failed.")}`, baseUrl), 303);
  }
}

async function exchangeCode(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  return response.json() as Promise<GoogleTokenResponse>;
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Could not read Google profile.");
  return response.json() as Promise<GoogleUserInfo>;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
