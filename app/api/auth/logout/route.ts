import { clearSession } from "@/lib/server/auth";

export async function POST(request: Request): Promise<Response> {
  await clearSession();
  return Response.redirect(new URL("/", new URL(request.url).origin), 303);
}
