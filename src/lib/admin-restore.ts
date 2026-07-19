import { validatePharmaStockBackup } from "@/lib/backup";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AdminSession } from "@/lib/admin-session";
import type { Database, Json } from "@/lib/database.types";
import type { Pharmacy } from "@/lib/types";

export type RestoreDatasetName = "pharmacy_settings" | "products" | "inventory_batches" | "sales" | "expenses";

export type RestoreCounts = Record<RestoreDatasetName, number> & {
  staff: number;
  activity_logs: number;
};

export type RestorePreview = {
  validation: ReturnType<typeof validatePharmaStockBackup>;
  target_pharmacy: Pharmacy;
  confirmation_label: string;
  checksum: string | null;
  can_restore: boolean;
  missing_counts: RestoreCounts;
  skipped_counts: RestoreCounts;
  unsupported_counts: {
    staff: number;
    activity_logs: number;
  };
};

const restoreDatasetNames: RestoreDatasetName[] = ["pharmacy_settings", "products", "inventory_batches", "sales", "expenses"];
const forbiddenBackupKeys = new Set(["password", "password_hash", "session_token", "cookie", "cookies", "admin_users", "pharmacy_access"]);
const maxRestoreUploadBytes = 10 * 1024 * 1024;

type PharmacyRow = Database["public"]["Tables"]["pharmacies"]["Row"];

function normalizePharmacy(pharmacy: PharmacyRow): Pharmacy {
  return {
    id: pharmacy.id,
    pharmacy_name: pharmacy.pharmacy_name,
    owner_name: pharmacy.owner_name,
    phone: pharmacy.phone,
    plan: pharmacy.plan || "TRIAL",
    status: pharmacy.status || "TRIAL",
    trial_ends_at: pharmacy.trial_ends_at,
    subscription_ends_at: pharmacy.subscription_ends_at,
    archived_at: pharmacy.archived_at ?? null,
    created_at: pharmacy.created_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function arrayDataset(backup: unknown, name: string): Array<Record<string, unknown>> {
  if (!isRecord(backup) || !isRecord(backup.datasets)) return [];
  const value = backup.datasets[name];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function settingsDatasetPresent(backup: unknown) {
  return isRecord(backup) && isRecord(backup.datasets) && isRecord(backup.datasets.pharmacy_settings);
}

function collectIds(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => row.id).filter((id): id is string => typeof id === "string" && id.length > 0);
}

function countUnsupported(backup: unknown, name: string) {
  return arrayDataset(backup, name).length;
}

function findForbiddenKeys(value: unknown, path = "$", found = new Set<string>()) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${path}[${index}]`, found));
    return found;
  }
  if (!isRecord(value)) return found;

  Object.entries(value).forEach(([key, nested]) => {
    if (forbiddenBackupKeys.has(key)) found.add(`${path}.${key}`);
    findForbiddenKeys(nested, `${path}.${key}`, found);
  });

  return found;
}

function zeroCounts(): RestoreCounts {
  return {
    pharmacy_settings: 0,
    products: 0,
    inventory_batches: 0,
    sales: 0,
    expenses: 0,
    staff: 0,
    activity_logs: 0,
  };
}

async function countExistingIds(table: RestoreDatasetName, ids: string[]) {
  if (ids.length === 0) return 0;

  const supabase = getSupabaseAdmin();
  const result = await supabase.from(table).select("id").in("id", ids);
  if (result.error) throw result.error;
  return (result.data || []).length;
}

export function requestTooLarge(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(length) && length > maxRestoreUploadBytes;
}

export async function getAdminRestoreTarget(pharmacyId: string) {
  const supabase = getSupabaseAdmin();
  const [pharmacyResult, accessResult] = await Promise.all([
    supabase.from("pharmacies").select("*").eq("id", pharmacyId).maybeSingle(),
    supabase.from("pharmacy_access").select("pharmacy_code").eq("pharmacy_id", pharmacyId).maybeSingle(),
  ]);

  if (pharmacyResult.error) throw pharmacyResult.error;
  if (accessResult.error) throw accessResult.error;
  if (!pharmacyResult.data) return null;

  return {
    pharmacy: normalizePharmacy(pharmacyResult.data),
    confirmationLabel: accessResult.data?.pharmacy_code || pharmacyResult.data.pharmacy_name,
  };
}

export async function buildAdminRestorePreview(targetPharmacy: Pharmacy, confirmationLabel: string, backup: unknown): Promise<RestorePreview> {
  const validation = validatePharmaStockBackup(backup, targetPharmacy);
  const forbiddenPaths = Array.from(findForbiddenKeys(backup));
  forbiddenPaths.forEach((path) => validation.errors.push(`Backup contains forbidden key ${path}.`));

  const missing_counts = zeroCounts();
  const skipped_counts = zeroCounts();
  const unsupported_counts = {
    staff: countUnsupported(backup, "staff"),
    activity_logs: countUnsupported(backup, "activity_logs"),
  };

  skipped_counts.staff = unsupported_counts.staff;
  skipped_counts.activity_logs = unsupported_counts.activity_logs;

  if (validation.errors.length === 0) {
    const settingsExistsResult = await getSupabaseAdmin()
      .from("pharmacy_settings")
      .select("id", { count: "exact", head: true })
      .eq("pharmacy_id", targetPharmacy.id);

    if (settingsExistsResult.error) throw settingsExistsResult.error;
    const settingsPresent = settingsDatasetPresent(backup);
    const settingsExists = Boolean(settingsExistsResult.count);
    missing_counts.pharmacy_settings = settingsPresent && !settingsExists ? 1 : 0;
    skipped_counts.pharmacy_settings = settingsPresent && settingsExists ? 1 : 0;

    for (const name of restoreDatasetNames.filter((item) => item !== "pharmacy_settings")) {
      const rows = arrayDataset(backup, name);
      const existing = await countExistingIds(name, collectIds(rows));
      missing_counts[name] = Math.max(rows.length - existing, 0);
      skipped_counts[name] = existing;
    }
  }

  validation.valid = validation.errors.length === 0;

  return {
    validation,
    target_pharmacy: targetPharmacy,
    confirmation_label: confirmationLabel,
    checksum: isRecord(backup) && typeof backup.checksum === "string" ? backup.checksum : null,
    can_restore: validation.valid,
    missing_counts,
    skipped_counts,
    unsupported_counts,
  };
}

export async function logAdminRestoreActivity({
  admin,
  targetPharmacy,
  backupChecksum,
  restoredCounts,
  skippedCounts,
  success,
  errorMessage,
}: {
  admin: AdminSession;
  targetPharmacy: Pharmacy | null;
  backupChecksum: string | null;
  restoredCounts?: Json;
  skippedCounts?: Json;
  success: boolean;
  errorMessage?: string | null;
}) {
  const result = await getSupabaseAdmin().from("admin_activity_logs").insert({
    admin_username: admin.username,
    admin_role: admin.role,
    action: "BACKUP_RESTORED",
    target_pharmacy_id: targetPharmacy?.id || null,
    target_pharmacy_name: targetPharmacy?.pharmacy_name || null,
    backup_checksum: backupChecksum,
    restored_counts: restoredCounts || {},
    skipped_counts: skippedCounts || {},
    success,
    error_message: errorMessage || null,
  });

  if (result.error) throw result.error;
}

export function backupForRpc(backup: unknown): Json {
  return JSON.parse(JSON.stringify(backup)) as Json;
}

export type RestoreRpcResult = {
  restored_counts: Json;
  skipped_counts: Json;
};

export function parseRestoreRpcResult(value: Json): RestoreRpcResult {
  return value as RestoreRpcResult;
}
