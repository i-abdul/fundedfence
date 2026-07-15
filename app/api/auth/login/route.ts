import { findUserByEmail, normalizeEmail, setSession, verifyPassword } from "@/lib/server/auth";

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const origin = new URL(request.url).origin;
  try {
    const email = normalizeEmail(String(form.get("email") ?? ""));
    const password = String(form.get("password") ?? "");
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new Error("Email or password is incorrect.");
    }
    await setSession({ email: user.email, displayName: user.display_name ?? user.email, fullName: user.display_name });
    return redirectResponse(form, origin, "/dashboard");
  } catch (error) {
    return redirectResponse(form, origin, "/login", error instanceof Error ? error.message : "Sign in failed.");
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
