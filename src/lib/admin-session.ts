import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const adminSessionCookieName = "admin_session";
const adminSessionMaxAgeSeconds = 60 * 60 * 8;

function getAdminSecret() {
  if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET is required in production.");
  }
  return "pharmastock-admin-session-development-secret";
}

function sign(payload: string) {
  return createHmac("sha256", getAdminSecret()).update(payload).digest("hex");
}

function isSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAdminSessionValue({
  username,
  fullName,
  role,
  sessionVersion,
}: {
  username: string;
  fullName: string | null;
  role: string;
  sessionVersion: number;
}) {
  const payload = Buffer.from(
    JSON.stringify({
      username,
      fullName,
      role,
      sessionVersion,
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
  sessionVersion: number;
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

function failAdminAuth(_context: string, step: string, error: string): AdminAuthResult {
  return {
    admin: null,
    failure: { step, error },
  };
}

async function getAdminAuthResult(context = "admin"): Promise<AdminAuthResult> {
  const cookieStore = await cookies();
  const value = cookieStore.get(adminSessionCookieName)?.value || "";

  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return failAdminAuth(context, "cookie", "missing or malformed admin session cookie");
  }

  try {
    const expectedSignature = sign(payload);
    const verified = isSafeEqual(expectedSignature, signature);

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
    sessionVersion?: number;
    expiresAt?: number;
  };

  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      username?: string;
      fullName?: string | null;
      role?: string;
      sessionVersion?: number;
      expiresAt?: number;
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "payload decode failed";
    return failAdminAuth(context, "payload", message);
  }

  if (!session.username) return failAdminAuth(context, "payload", "username missing");
  if (!session.sessionVersion) return failAdminAuth(context, "payload", "sessionVersion missing");
  if (!session.expiresAt) return failAdminAuth(context, "payload", "expiresAt missing");
  if (session.expiresAt < Date.now()) return failAdminAuth(context, "payload", "session expired");

  try {
    const supabase = getSupabaseAdmin();
    const adminResult = await supabase
      .from("admin_users")
      .select("username, full_name, role, active, session_version")
      .eq("username", session.username)
      .maybeSingle();

    if (adminResult.error) return failAdminAuth(context, "admin_lookup", adminResult.error.message);
    if (!adminResult.data) return failAdminAuth(context, "admin_lookup", "admin not found");
    if (!adminResult.data.active) return failAdminAuth(context, "admin_lookup", "active=false");
    if (adminResult.data.session_version !== session.sessionVersion) {
      return failAdminAuth(context, "admin_lookup", "session_version mismatch");
    }

    const admin = {
      username: adminResult.data.username,
      fullName: adminResult.data.full_name || null,
      role: adminResult.data.role || "SUPER_ADMIN",
      sessionVersion: adminResult.data.session_version,
    };

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

  return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
}
