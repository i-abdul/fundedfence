export function jsonError(status: number, code: string, message: string, correlationId = crypto.randomUUID()): Response {
  return Response.json({ error: { code, message, correlationId } }, { status });
}

export function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

export async function safeJson(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Request body must be a JSON object.");
  return value as Record<string, unknown>;
}

export function isCanonicalMinorUnits(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+$/.test(value);
}
