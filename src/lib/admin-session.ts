import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const adminSessionCookieName = "admin_session";
const adminSessionMaxAgeSeconds = 60 * 60 * 8;

function getAdminSecret() {
  return process.env.ADMIN_SESSION_SECRET || "pharmastock-admin-session-development-secret";
}

function sign(payload: string) {
  return createHmac("sha256", getAdminSecret()).update(payload).digest("hex");
}

function isSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAdminSessionValue({ username, fullName, role }: { username: string; fullName: string | null; role: string }) {
  const payload = Buffer.from(
    JSON.stringify({
      username,
      fullName,
      role,
      expiresAt: Date.now() + adminSessionMaxAgeSeconds * 1000,
    }),
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function getAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: adminSessionMaxAgeSeconds,
  };
}

export function getExpiredAdminSessionCookieOptions(path = "/") {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path,
    maxAge: 0,
    expires: new Date(0),
  };
}

export type AdminSession = {
  username: string;
  fullName: string | null;
  role: string;
};

export async function authenticateAdminFromCookie(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(adminSessionCookieName)?.value || "";
  const [payload, signature] = value.split(".");

  if (!payload || !signature) return null;
  if (!isSafeEqual(sign(payload), signature)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      username?: string;
      fullName?: string | null;
      role?: string;
      expiresAt?: number;
    };

    if (!session.username || !session.expiresAt || session.expiresAt < Date.now()) return null;

    return {
      username: session.username,
      fullName: session.fullName || null,
      role: session.role || "SUPER_ADMIN",
    };
  } catch {
    return null;
  }
}

export async function requireAdminSession(): Promise<AdminSession | NextResponse> {
  const admin = await authenticateAdminFromCookie();
  return admin || NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
}
