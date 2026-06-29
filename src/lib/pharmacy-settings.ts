import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { PharmacySettings } from "@/lib/types";

type PharmacySettingsRow = Database["public"]["Tables"]["pharmacy_settings"]["Row"];
type PharmacySettingsInsert = Database["public"]["Tables"]["pharmacy_settings"]["Insert"];
type PharmacySettingsUpdate = Database["public"]["Tables"]["pharmacy_settings"]["Update"];

function normalizeNumber(value: number | string | null) {
  return Number(value || 0);
}

export function normalizePharmacySettings(row: PharmacySettingsRow): PharmacySettings {
  return {
    id: row.id,
    pharmacy_id: row.pharmacy_id,
    registration_number: row.registration_number || "",
    license_number: row.license_number || "",
    address: row.address || "",
    region: row.region || "",
    district: row.district || "",
    email: row.email || "",
    logo_url: row.logo_url || "",
    receipt_header: row.receipt_header || "",
    receipt_footer: row.receipt_footer || "",
    receipt_prefix: row.receipt_prefix || "",
    low_stock_threshold: normalizeNumber(row.low_stock_threshold),
    expiry_warning_days: normalizeNumber(row.expiry_warning_days),
    allow_negative_stock: Boolean(row.allow_negative_stock),
    allow_duplicate_batches: Boolean(row.allow_duplicate_batches),
    allow_price_override: Boolean(row.allow_price_override),
    max_discount: normalizeNumber(row.max_discount),
    vat_percentage: normalizeNumber(row.vat_percentage),
    currency: row.currency || "TZS",
    timezone: row.timezone || "Africa/Dar_es_Salaam",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getPharmacySettings(pharmacyId: string, receiptHeader?: string): Promise<PharmacySettings> {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("pharmacy_settings").select("*").eq("pharmacy_id", pharmacyId).maybeSingle();

  if (result.error) throw result.error;
  if (result.data) return normalizePharmacySettings(result.data);

  const payload: PharmacySettingsInsert = {
    pharmacy_id: pharmacyId,
    receipt_header: receiptHeader || "PharmaStock",
  };
  const created = await supabase.from("pharmacy_settings").insert(payload).select("*").single();

  if (created.error) throw created.error;
  return normalizePharmacySettings(created.data);
}

export async function updatePharmacySettings(pharmacyId: string, update: PharmacySettingsUpdate): Promise<PharmacySettings> {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("pharmacy_settings")
    .update(update)
    .eq("pharmacy_id", pharmacyId)
    .select("*")
    .maybeSingle();

  if (result.error) throw result.error;
  if (result.data) return normalizePharmacySettings(result.data);

  const created = await supabase.from("pharmacy_settings").insert({ ...update, pharmacy_id: pharmacyId }).select("*").single();

  if (created.error) throw created.error;
  return normalizePharmacySettings(created.data);
}
