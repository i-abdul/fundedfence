import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { stableId } from "./crypto";
import { requireDatabase, requireSecret } from "./runtime";

export type AppUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const SESSION_COOKIE = "fundedfence_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const PASSWORD_ITERATIONS = 210_000;

export async function getAppUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;
  return {
    displayName: payload.displayName || payload.email,
    email: payload.email,
    fullName: payload.displayName || null,
  };
}

export async function requireAppUser(returnTo: string): Promise<AppUser> {
  const user = await getAppUser();
  if (user) return user;
  redirect(appSignInPath(returnTo));
}

export function appSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `/login?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export async function createOrUpdateUser(email: string, displayName: string, passwordHash?: string, googleSubject?: string): Promise<AppUser> {
  const database = await requireDatabase();
  const normalizedEmail = normalizeEmail(email);
  const nowIso = new Date().toISOString();
  const userId = await stableId("usr", normalizedEmail);
  const organizationId = await stableId("org", normalizedEmail);
  await database.batch([
    database.prepare("INSERT OR IGNORE INTO organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .bind(organizationId, `${displayName || normalizedEmail}'s workspace`, nowIso, nowIso),
    database.prepare("INSERT INTO users (id, organization_id, email, display_name, password_hash, google_subject, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET display_name = COALESCE(excluded.display_name, users.display_name), password_hash = COALESCE(excluded.password_hash, users.password_hash), google_subject = COALESCE(excluded.google_subject, users.google_subject), updated_at = excluded.updated_at")
      .bind(userId, organizationId, normalizedEmail, displayName || normalizedEmail, passwordHash ?? null, googleSubject ?? null, nowIso, nowIso),
  ]);
  return { email: normalizedEmail, displayName: displayName || normalizedEmail, fullName: displayName || null };
}

export async function findUserByEmail(email: string): Promise<{ email: string; display_name: string | null; password_hash: string | null } | null> {
  const database = await requireDatabase();
  return database.prepare("SELECT email, display_name, password_hash FROM users WHERE email = ? LIMIT 1")
    .bind(normalizeEmail(email)).first<{ email: string; display_name: string | null; password_hash: string | null }>();
}

export async function setSession(user: AppUser): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 10) throw new Error("Use at least 10 characters for your password.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [algorithm, iterationsText, saltText, hashText] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256") return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100_000) return false;
  const salt = fromBase64Url(saltText);
  const expected = fromBase64Url(hashText);
  const actual = new Uint8Array(await pbkdf2(password, salt, iterations));
  return timingSafeEqual(actual, expected);
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

async function signSession(user: AppUser): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({
    email: normalizeEmail(user.email),
    displayName: user.displayName,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  })));
  const signature = await hmac(payload, await requireSecret("APP_SESSION_SECRET"));
  return `${payload}.${signature}`;
}

async function verifySession(token: string): Promise<{ email: string; displayName: string; expiresAt: number } | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = await hmac(payload, await requireSecret("APP_SESSION_SECRET"));
  if (!timingSafeEqual(new TextEncoder().encode(signature), new TextEncoder().encode(expected))) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { email: string; displayName: string; expiresAt: number };
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(signature));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBuffer, iterations, hash: "SHA-256" }, key, 256);
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    return url.origin === "https://app.local" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a[i] ^ b[i];
  return result === 0;
}
