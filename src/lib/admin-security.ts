import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AdminSession } from "@/lib/admin-session";
import type { Database, Json } from "@/lib/database.types";

export const adminLockoutThreshold = 5;
export const adminLockoutMinutes = 15;

type AdminActivityInsert = Database["public"]["Tables"]["admin_activity_logs"]["Insert"];

export function validateAdminPasswordStrength(password: string) {
  const errors: string[] = [];

  if (password.length < 12) errors.push("Password must be at least 12 characters.");
  if (!/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter.");
  if (!/[a-z]/.test(password)) errors.push("Password must include a lowercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Password must include a number.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must include a symbol.");

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function hashAdminPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function compareAdminPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function recordAdminActivity(input: {
  admin?: AdminSession | null;
  username?: string | null;
  role?: string | null;
  action: string;
  targetPharmacyId?: string | null;
  targetPharmacyName?: string | null;
  backupChecksum?: string | null;
  restoredCounts?: Json;
  skippedCounts?: Json;
  success: boolean;
  errorMessage?: string | null;
}) {
  const payload: AdminActivityInsert = {
    admin_username: input.admin?.username || input.username || "unknown",
    admin_role: input.admin?.role || input.role || "UNKNOWN",
    action: input.action,
    target_pharmacy_id: input.targetPharmacyId || null,
    target_pharmacy_name: input.targetPharmacyName || null,
    backup_checksum: input.backupChecksum || null,
    restored_counts: input.restoredCounts || {},
    skipped_counts: input.skippedCounts || {},
    success: input.success,
    error_message: input.errorMessage || null,
  };
  const result = await getSupabaseAdmin().from("admin_activity_logs").insert(payload);

  if (result.error) {
    console.error("Admin activity log failed:", result.error);
  }
}

export function getLockoutUntil() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + adminLockoutMinutes);
  return date.toISOString();
}

export function isLocked(lockedUntil: string | null) {
  return Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now());
}
