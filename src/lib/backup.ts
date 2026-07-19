import { createHash } from "crypto";
import packageJson from "../../package.json";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database, Json } from "@/lib/database.types";
import type { Pharmacy } from "@/lib/types";

export const backupFormat = "pharmastock-backup";
export const backupSchemaVersion = 1;

type PharmacySettingsRow = Database["public"]["Tables"]["pharmacy_settings"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type InventoryBatchRow = Database["public"]["Tables"]["inventory_batches"]["Row"];
type SaleRow = Database["public"]["Tables"]["sales"]["Row"];
type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
type ActivityLogRow = Database["public"]["Tables"]["activity_logs"]["Row"];
type PharmacyUserRow = Database["public"]["Tables"]["pharmacy_users"]["Row"];

export type StaffMetadataBackup = Pick<PharmacyUserRow, "id" | "pharmacy_id" | "full_name" | "username" | "role" | "active" | "last_login_at" | "created_at" | "updated_at">;

export type BackupDatasets = {
  pharmacy_settings: PharmacySettingsRow | null;
  products: ProductRow[];
  inventory_batches: InventoryBatchRow[];
  sales: SaleRow[];
  expenses: ExpenseRow[];
  staff: StaffMetadataBackup[];
  activity_logs: ActivityLogRow[];
};

export type BackupPayload = {
  format: typeof backupFormat;
  schema_version: typeof backupSchemaVersion;
  generated_at: string;
  app_version: string;
  pharmacy: Pharmacy;
  record_counts: Record<keyof BackupDatasets, number>;
  datasets: BackupDatasets;
};

export type BackupFile = BackupPayload & {
  checksum: string;
};

export type BackupValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checksum: {
    expected: string | null;
    actual: string | null;
    matches: boolean;
  };
  pharmacy: {
    id: string | null;
    pharmacy_name: string | null;
  };
  record_counts: Partial<Record<keyof BackupDatasets, number>>;
};

const datasetNames: Array<keyof BackupDatasets> = ["pharmacy_settings", "products", "inventory_batches", "sales", "expenses", "staff", "activity_logs"];

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function normalizeJsonSafe(value: unknown) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : JSON.parse(serialized);
}

export function calculateBackupChecksum(payload: BackupPayload) {
  return createHash("sha256").update(stableStringify(normalizeJsonSafe(payload))).digest("hex");
}

function recordCount(value: unknown) {
  if (Array.isArray(value)) return value.length;
  return value ? 1 : 0;
}

function buildRecordCounts(datasets: BackupDatasets): Record<keyof BackupDatasets, number> {
  return {
    pharmacy_settings: recordCount(datasets.pharmacy_settings),
    products: datasets.products.length,
    inventory_batches: datasets.inventory_batches.length,
    sales: datasets.sales.length,
    expenses: datasets.expenses.length,
    staff: datasets.staff.length,
    activity_logs: datasets.activity_logs.length,
  };
}

export function sanitizeBackupFilenamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "pharmacy";
}

export async function getPharmacyBackupFilename(pharmacyId: string, pharmacyName: string) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("pharmacy_access").select("pharmacy_code").eq("pharmacy_id", pharmacyId).maybeSingle();
  const identity = result.data?.pharmacy_code || pharmacyName;

  return `pharmastock-${sanitizeBackupFilenamePart(identity)}-${new Date().toISOString().slice(0, 10)}.json`;
}

export async function buildPharmacyBackup(pharmacy: Pharmacy): Promise<BackupFile> {
  const supabase = getSupabaseAdmin();
  const [
    settingsResult,
    productsResult,
    batchesResult,
    salesResult,
    expensesResult,
    staffResult,
    activityResult,
  ] = await Promise.all([
    supabase.from("pharmacy_settings").select("*").eq("pharmacy_id", pharmacy.id).maybeSingle(),
    supabase.from("products").select("*").eq("pharmacy_id", pharmacy.id).order("product_name"),
    supabase.from("inventory_batches").select("*").eq("pharmacy_id", pharmacy.id).order("created_at", { ascending: true }),
    supabase.from("sales").select("*").eq("pharmacy_id", pharmacy.id).order("created_at", { ascending: true }),
    supabase.from("expenses").select("*").eq("pharmacy_id", pharmacy.id).order("expense_date", { ascending: true }),
    supabase
      .from("pharmacy_users")
      .select("id, pharmacy_id, full_name, username, role, active, last_login_at, created_at, updated_at")
      .eq("pharmacy_id", pharmacy.id)
      .order("created_at", { ascending: true }),
    supabase.from("activity_logs").select("*").eq("pharmacy_id", pharmacy.id).order("created_at", { ascending: true }),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (productsResult.error) throw productsResult.error;
  if (batchesResult.error) throw batchesResult.error;
  if (salesResult.error) throw salesResult.error;
  if (expensesResult.error) throw expensesResult.error;
  if (staffResult.error) throw staffResult.error;
  if (activityResult.error) throw activityResult.error;

  const datasets: BackupDatasets = {
    pharmacy_settings: settingsResult.data,
    products: productsResult.data || [],
    inventory_batches: batchesResult.data || [],
    sales: salesResult.data || [],
    expenses: expensesResult.data || [],
    staff: staffResult.data || [],
    activity_logs: activityResult.data || [],
  };
  const payload: BackupPayload = {
    format: backupFormat,
    schema_version: backupSchemaVersion,
    generated_at: new Date().toISOString(),
    app_version: packageJson.version,
    pharmacy,
    record_counts: buildRecordCounts(datasets),
    datasets,
  };

  return {
    ...payload,
    checksum: calculateBackupChecksum(payload),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function countDataset(name: keyof BackupDatasets, datasets: Record<string, unknown>) {
  const value = datasets[name];
  return name === "pharmacy_settings" ? recordCount(value) : Array.isArray(value) ? value.length : 0;
}

export function validatePharmaStockBackup(input: unknown, expectedPharmacy: Pick<Pharmacy, "id" | "pharmacy_name">): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const record_counts: Partial<Record<keyof BackupDatasets, number>> = {};
  const result: BackupValidationResult = {
    valid: false,
    errors,
    warnings,
    checksum: { expected: null, actual: null, matches: false },
    pharmacy: { id: null, pharmacy_name: null },
    record_counts,
  };

  if (!isRecord(input)) {
    errors.push("Backup file must contain a JSON object.");
    return result;
  }

  const backup = input as Record<string, unknown>;
  if (backup.format !== backupFormat) errors.push("Backup format is not pharmastock-backup.");
  if (backup.schema_version !== backupSchemaVersion) errors.push("Backup schema version is not supported.");
  if (typeof backup.checksum !== "string" || !backup.checksum) errors.push("Backup checksum is missing.");

  const pharmacy = isRecord(backup.pharmacy) ? backup.pharmacy : null;
  result.pharmacy = {
    id: typeof pharmacy?.id === "string" ? pharmacy.id : null,
    pharmacy_name: typeof pharmacy?.pharmacy_name === "string" ? pharmacy.pharmacy_name : null,
  };

  if (!pharmacy) {
    errors.push("Backup pharmacy identity is missing.");
  } else if (pharmacy.id !== expectedPharmacy.id) {
    errors.push("Backup belongs to a different pharmacy.");
  }

  const datasets = isRecord(backup.datasets) ? backup.datasets : null;
  if (!datasets) {
    errors.push("Backup datasets are missing.");
  } else {
    datasetNames.forEach((name) => {
      if (!(name in datasets)) {
        errors.push(`Dataset ${name} is missing.`);
        return;
      }

      const value = datasets[name];
      if (name !== "pharmacy_settings" && !Array.isArray(value)) errors.push(`Dataset ${name} must be an array.`);
      record_counts[name] = countDataset(name, datasets);
    });
  }

  const counts = isRecord(backup.record_counts) ? backup.record_counts : null;
  if (!counts) {
    errors.push("Backup record counts are missing.");
  } else if (datasets) {
    datasetNames.forEach((name) => {
      if (typeof counts[name] !== "number") {
        errors.push(`Record count for ${name} is missing.`);
      } else if (record_counts[name] !== counts[name]) {
        errors.push(`Record count for ${name} does not match the dataset.`);
      }
    });
  }

  if (typeof backup.checksum === "string") {
    const payload = { ...backup };
    delete payload.checksum;
    const actual = calculateBackupChecksum(payload as BackupPayload);
    result.checksum = {
      expected: backup.checksum,
      actual,
      matches: backup.checksum === actual,
    };
    if (backup.checksum !== actual) errors.push("Backup checksum does not match the payload.");
  }

  if (result.pharmacy.pharmacy_name && result.pharmacy.pharmacy_name !== expectedPharmacy.pharmacy_name) {
    warnings.push("Backup pharmacy name differs from the current pharmacy name.");
  }

  result.valid = errors.length === 0;
  return result;
}

export function backupValidationMetadata(validation: BackupValidationResult): Json {
  return {
    valid: validation.valid,
    pharmacy_id: validation.pharmacy.id,
    record_counts: validation.record_counts,
    checksum_matches: validation.checksum.matches,
  };
}
