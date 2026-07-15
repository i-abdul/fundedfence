import { createOrUpdateUser, hashPassword, normalizeEmail, setSession } from "@/lib/server/auth";

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const origin = new URL(request.url).origin;
  try {
    const email = normalizeEmail(String(form.get("email") ?? ""));
    const displayName = String(form.get("displayName") ?? "").trim() || email;
    const password = String(form.get("password") ?? "");
    const user = await createOrUpdateUser(email, displayName, await hashPassword(password));
    await setSession(user);
    return redirectResponse(form, origin, "/onboarding");
  } catch (error) {
    return redirectResponse(form, origin, "/signup", error instanceof Error ? error.message : "Sign up failed.");
  }
}

function redirectResponse(form: FormData, origin: string, fallback: string, error?: string): Response {
  const returnTo = safeReturnTo(String(form.get("return_to") ?? fallback));
  const location = error ? `${fallback}?error=${encodeURIComponent(error)}&return_to=${encodeURIComponent(returnTo)}` : returnTo;
  return Response.redirect(new URL(location, origin), 303);
}

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
