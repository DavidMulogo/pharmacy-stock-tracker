import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

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

type AdminAuthFailure = {
  step: string;
  error: string;
};

type AdminAuthResult =
  | {
      admin: AdminSession;
      failure: null;
    }
  | {
      admin: null;
      failure: AdminAuthFailure;
    };

function logAdminAuth(context: string, message: string, details?: Record<string, unknown>) {
  console.info(`[admin-auth:${context}] ${message}`, details || {});
}

function failAdminAuth(context: string, step: string, error: string, details?: Record<string, unknown>): AdminAuthResult {
  console.warn(`[admin-auth:${context}] return failure`, { step, error, ...(details || {}) });
  return {
    admin: null,
    failure: { step, error },
  };
}

async function getAdminAuthResult(context = "admin"): Promise<AdminAuthResult> {
  const cookieStore = await cookies();
  const value = cookieStore.get(adminSessionCookieName)?.value || "";
  logAdminAuth(context, "cookie check", { cookieName: adminSessionCookieName, exists: Boolean(value) });

  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return failAdminAuth(context, "cookie", "missing or malformed admin_session cookie", {
      hasPayload: Boolean(payload),
      hasSignature: Boolean(signature),
    });
  }

  try {
    const expectedSignature = sign(payload);
    const verified = isSafeEqual(expectedSignature, signature);
    logAdminAuth(context, "jwt_verify", { succeeds: verified });

    if (!verified) {
      return failAdminAuth(context, "jwt_verify", "invalid signature");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "signature verification failed";
    return failAdminAuth(context, "jwt_verify", message);
  }

  let session: {
    username?: string;
    fullName?: string | null;
    role?: string;
    expiresAt?: number;
  };

  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      username?: string;
      fullName?: string | null;
      role?: string;
      expiresAt?: number;
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "payload decode failed";
    return failAdminAuth(context, "payload", message);
  }

  logAdminAuth(context, "payload decode", {
    username: session.username || null,
    hasExpiresAt: Boolean(session.expiresAt),
    expired: session.expiresAt ? session.expiresAt < Date.now() : null,
  });

  if (!session.username) return failAdminAuth(context, "payload", "username missing");
  if (!session.expiresAt) return failAdminAuth(context, "payload", "expiresAt missing");
  if (session.expiresAt < Date.now()) return failAdminAuth(context, "payload", "session expired");

  try {
    const supabase = getSupabaseAdmin();
    const adminResult = await supabase
      .from("admin_users")
      .select("username, full_name, role, active")
      .eq("username", session.username)
      .maybeSingle();

    logAdminAuth(context, "admin_users lookup", {
      succeeds: !adminResult.error,
      found: Boolean(adminResult.data),
      active: adminResult.data?.active ?? null,
      error: adminResult.error?.message || null,
    });

    if (adminResult.error) return failAdminAuth(context, "admin_lookup", adminResult.error.message);
    if (!adminResult.data) return failAdminAuth(context, "admin_lookup", "admin not found");
    if (!adminResult.data.active) return failAdminAuth(context, "admin_lookup", "active=false");

    const admin = {
      username: adminResult.data.username,
      fullName: adminResult.data.full_name || null,
      role: adminResult.data.role || "SUPER_ADMIN",
    };
    logAdminAuth(context, "return success", { username: admin.username, role: admin.role });

    return {
      admin,
      failure: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "admin lookup failed";
    return failAdminAuth(context, "admin_lookup", message);
  }
}

export async function authenticateAdminFromCookie(): Promise<AdminSession | null> {
  const result = await getAdminAuthResult("authenticateAdminFromCookie");
  return result.admin;
}

export async function requireAdminSession(context = "requireAdminSession"): Promise<AdminSession | NextResponse> {
  const result = await getAdminAuthResult(context);
  if (result.admin) return result.admin;

  console.warn(`[admin-auth:${context}] return 401 response`, result.failure);
  return NextResponse.json(result.failure, { status: 401 });
}
