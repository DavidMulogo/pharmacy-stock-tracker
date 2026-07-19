import { getPharmacySettings } from "@/lib/pharmacy-settings";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type {
  AdminNotificationSummary,
  Notification,
  NotificationCounts,
  NotificationFilter,
  NotificationType,
  Pharmacy,
  PharmacyUserRole,
} from "@/lib/types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"];
type ProductStockRow = Database["public"]["Views"]["product_stock_summary"]["Row"];
type BatchRow = Database["public"]["Tables"]["inventory_batches"]["Row"] & {
  product: { product_name: string } | { product_name: string }[] | null;
};

const dayMs = 24 * 60 * 60 * 1000;

const notificationRoleTypes: Record<PharmacyUserRole, NotificationType[]> = {
  OWNER: ["LOW_STOCK", "OUT_OF_STOCK", "EXPIRING_SOON", "EXPIRED_BATCH", "TRIAL_EXPIRING", "SUBSCRIPTION_EXPIRING", "SUBSCRIPTION_EXPIRED"],
  PHARMACIST: ["LOW_STOCK", "OUT_OF_STOCK", "EXPIRING_SOON", "EXPIRED_BATCH", "TRIAL_EXPIRING", "SUBSCRIPTION_EXPIRING", "SUBSCRIPTION_EXPIRED"],
  TECHNICIAN: ["LOW_STOCK", "OUT_OF_STOCK", "EXPIRING_SOON", "EXPIRED_BATCH"],
};

function numberValue(value: number | string | null) {
  return Number(value || 0);
}

function daysUntil(dateValue: string | null) {
  if (!dateValue) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.ceil((date.getTime() - today.getTime()) / dayMs);
}

function normalizeNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    pharmacy_id: row.pharmacy_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    dedupe_key: row.dedupe_key,
    status: row.status,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    read_at: row.read_at,
    resolved_at: row.resolved_at,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function productNotification(product: ProductStockRow, type: "LOW_STOCK" | "OUT_OF_STOCK", threshold: number): NotificationInsert {
  const stock = numberValue(product.available_stock);
  return {
    pharmacy_id: String(product.pharmacy_id),
    type,
    severity: type === "OUT_OF_STOCK" ? "CRITICAL" : "WARNING",
    title: type === "OUT_OF_STOCK" ? `${product.product_name} is out of stock` : `${product.product_name} is low in stock`,
    message:
      type === "OUT_OF_STOCK"
        ? `${product.product_name} has ${stock} units available. Add stock before selling.`
        : `${product.product_name} has ${stock} units available, at or below reorder level ${threshold}.`,
    entity_type: "product",
    entity_id: product.id,
    dedupe_key: `${type}:${product.id}`,
    metadata: { product_name: product.product_name, available_stock: stock, reorder_level: threshold },
  };
}

function batchNotification(batch: BatchRow, type: "EXPIRING_SOON" | "EXPIRED_BATCH", days: number): NotificationInsert {
  const product = Array.isArray(batch.product) ? batch.product[0] : batch.product;
  const productName = product?.product_name || "A product";
  return {
    pharmacy_id: String(batch.pharmacy_id),
    type,
    severity: type === "EXPIRED_BATCH" ? "CRITICAL" : "WARNING",
    title: type === "EXPIRED_BATCH" ? `${productName} batch expired` : `${productName} batch expiring soon`,
    message:
      type === "EXPIRED_BATCH"
        ? `Batch ${batch.batch_number} expired on ${batch.expiry_date}.`
        : `Batch ${batch.batch_number} expires in ${days} day${days === 1 ? "" : "s"} on ${batch.expiry_date}.`,
    entity_type: "inventory_batch",
    entity_id: batch.id,
    dedupe_key: `${type}:${batch.id}`,
    metadata: { product_name: productName, batch_number: batch.batch_number, expiry_date: batch.expiry_date, days_to_expiry: days },
  };
}

function subscriptionNotifications(pharmacy: Pharmacy): NotificationInsert[] {
  const result: NotificationInsert[] = [];
  const trialDays = daysUntil(pharmacy.trial_ends_at);
  const subscriptionDays = daysUntil(pharmacy.subscription_ends_at);
  const warningDays = new Set([7, 3, 1]);

  if (pharmacy.plan === "TRIAL" && trialDays !== null && trialDays >= 0 && trialDays <= 7 && warningDays.has(trialDays)) {
    result.push({
      pharmacy_id: pharmacy.id,
      type: "TRIAL_EXPIRING",
      severity: trialDays <= 1 ? "CRITICAL" : "WARNING",
      title: "Trial ending soon",
      message: `Your trial ends in ${trialDays} day${trialDays === 1 ? "" : "s"}. Contact PharmaStock Admin to activate your subscription.`,
      entity_type: "subscription",
      entity_id: pharmacy.id,
      dedupe_key: `TRIAL_EXPIRING:${pharmacy.id}`,
      metadata: { days_remaining: trialDays, trial_ends_at: pharmacy.trial_ends_at },
    });
  }

  if (pharmacy.plan !== "TRIAL" && subscriptionDays !== null && subscriptionDays < 0) {
    result.push({
      pharmacy_id: pharmacy.id,
      type: "SUBSCRIPTION_EXPIRED",
      severity: "CRITICAL",
      title: "Subscription expired",
      message: "Your subscription has expired. Renew to continue using PharmaStock.",
      entity_type: "subscription",
      entity_id: pharmacy.id,
      dedupe_key: `SUBSCRIPTION_EXPIRED:${pharmacy.id}`,
      metadata: { subscription_ends_at: pharmacy.subscription_ends_at },
    });
  } else if (pharmacy.plan !== "TRIAL" && subscriptionDays !== null && subscriptionDays >= 0 && subscriptionDays <= 7 && warningDays.has(subscriptionDays)) {
    result.push({
      pharmacy_id: pharmacy.id,
      type: "SUBSCRIPTION_EXPIRING",
      severity: subscriptionDays <= 1 ? "CRITICAL" : "WARNING",
      title: "Subscription ending soon",
      message: `Your subscription ends in ${subscriptionDays} day${subscriptionDays === 1 ? "" : "s"}. Renew to avoid interruption.`,
      entity_type: "subscription",
      entity_id: pharmacy.id,
      dedupe_key: `SUBSCRIPTION_EXPIRING:${pharmacy.id}`,
      metadata: { days_remaining: subscriptionDays, subscription_ends_at: pharmacy.subscription_ends_at },
    });
  }

  return result;
}

export function canRoleSeeNotification(role: PharmacyUserRole, type: NotificationType) {
  return notificationRoleTypes[role].includes(type);
}

export async function syncNotificationsForPharmacy(pharmacy: Pharmacy) {
  const supabase = getSupabaseAdmin();
  const settings = await getPharmacySettings(pharmacy.id, pharmacy.pharmacy_name);
  const warningDays = Math.max(0, Math.floor(settings.expiry_warning_days || 30));
  const [productsResult, batchesResult] = await Promise.all([
    supabase.from("product_stock_summary").select("*").eq("pharmacy_id", pharmacy.id),
    supabase.from("inventory_batches").select("*, product:products(product_name)").eq("pharmacy_id", pharmacy.id),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (batchesResult.error) throw batchesResult.error;

  const activeInputs: NotificationInsert[] = [];
  for (const product of (productsResult.data || []) as ProductStockRow[]) {
    const stock = numberValue(product.available_stock);
    const reorderLevel = numberValue(product.reorder_level) || numberValue(settings.low_stock_threshold);
    if (stock <= 0) activeInputs.push(productNotification(product, "OUT_OF_STOCK", reorderLevel));
    else if (stock <= reorderLevel) activeInputs.push(productNotification(product, "LOW_STOCK", reorderLevel));
  }

  for (const batch of (batchesResult.data || []) as BatchRow[]) {
    const days = daysUntil(batch.expiry_date);
    if (days === null) continue;
    if (days < 0) activeInputs.push(batchNotification(batch, "EXPIRED_BATCH", days));
    else if (days <= warningDays) activeInputs.push(batchNotification(batch, "EXPIRING_SOON", days));
  }

  activeInputs.push(...subscriptionNotifications(pharmacy));

  const now = new Date().toISOString();
  const activeKeys = new Set(activeInputs.map((item) => item.dedupe_key));

  for (const input of activeInputs) {
    const result = await supabase.from("notifications").upsert(
      {
        ...input,
        status: "ACTIVE",
        last_seen_at: now,
        resolved_at: null,
        updated_at: now,
      },
      { onConflict: "pharmacy_id,dedupe_key" },
    );
    if (result.error) throw result.error;
  }

  const existing = await supabase.from("notifications").select("id, dedupe_key").eq("pharmacy_id", pharmacy.id).eq("status", "ACTIVE");
  if (existing.error) throw existing.error;

  const staleIds = (existing.data || []).filter((item) => !activeKeys.has(item.dedupe_key)).map((item) => item.id);
  if (staleIds.length > 0) {
    const resolved = await supabase.from("notifications").update({ status: "RESOLVED", resolved_at: now, updated_at: now }).in("id", staleIds);
    if (resolved.error) throw resolved.error;
  }
}

export async function getNotificationsForPharmacy(pharmacyId: string, role: PharmacyUserRole, filter: NotificationFilter = "all") {
  const supabase = getSupabaseAdmin();
  const permitted = notificationRoleTypes[role];
  let query = supabase.from("notifications").select("*").eq("pharmacy_id", pharmacyId).in("type", permitted);

  if (filter === "unread") query = query.eq("status", "ACTIVE").is("read_at", null);
  else if (filter === "inventory") query = query.in("type", ["LOW_STOCK", "OUT_OF_STOCK"]).eq("status", "ACTIVE");
  else if (filter === "expiry") query = query.in("type", ["EXPIRING_SOON", "EXPIRED_BATCH"]).eq("status", "ACTIVE");
  else if (filter === "subscription") query = query.in("type", ["TRIAL_EXPIRING", "SUBSCRIPTION_EXPIRING", "SUBSCRIPTION_EXPIRED"]).eq("status", "ACTIVE");
  else if (filter === "resolved") query = query.eq("status", "RESOLVED");
  else query = query.eq("status", "ACTIVE");

  const result = await query.order("last_seen_at", { ascending: false }).limit(300);
  if (result.error) throw result.error;
  return ((result.data || []) as NotificationRow[]).map(normalizeNotification);
}

export async function getNotificationCounts(pharmacyId: string, role: PharmacyUserRole): Promise<NotificationCounts> {
  const permitted = notificationRoleTypes[role];
  const supabase = getSupabaseAdmin();
  const [unread, active] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId).in("type", permitted).eq("status", "ACTIVE").is("read_at", null),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId).in("type", permitted).eq("status", "ACTIVE"),
  ]);
  if (unread.error) throw unread.error;
  if (active.error) throw active.error;
  return { unread_active: unread.count || 0, active: active.count || 0 };
}

export async function markNotificationRead(pharmacyId: string, role: PharmacyUserRole, id: string) {
  const existing = await getSupabaseAdmin()
    .from("notifications")
    .select("id, type")
    .eq("id", id)
    .eq("pharmacy_id", pharmacyId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data || !canRoleSeeNotification(role, existing.data.type)) return false;

  const now = new Date().toISOString();
  const result = await getSupabaseAdmin().from("notifications").update({ read_at: now, updated_at: now }).eq("id", id).eq("pharmacy_id", pharmacyId);
  if (result.error) throw result.error;
  return true;
}

export async function markAllNotificationsRead(pharmacyId: string, role: PharmacyUserRole) {
  const now = new Date().toISOString();
  const result = await getSupabaseAdmin()
    .from("notifications")
    .update({ read_at: now, updated_at: now })
    .eq("pharmacy_id", pharmacyId)
    .eq("status", "ACTIVE")
    .is("read_at", null)
    .in("type", notificationRoleTypes[role]);
  if (result.error) throw result.error;
}

export function getAdminNotificationSummary(pharmacy: Pharmacy): AdminNotificationSummary {
  const trialDays = daysUntil(pharmacy.trial_ends_at);
  const subscriptionDays = daysUntil(pharmacy.subscription_ends_at);

  return {
    expired_subscription: pharmacy.status === "EXPIRED" || (pharmacy.plan !== "TRIAL" && subscriptionDays !== null && subscriptionDays < 0),
    trial_ending_soon: pharmacy.plan === "TRIAL" && trialDays !== null && trialDays >= 0 && trialDays <= 7,
    subscription_ending_soon: pharmacy.plan !== "TRIAL" && subscriptionDays !== null && subscriptionDays >= 0 && subscriptionDays <= 7,
    suspended: pharmacy.status === "SUSPENDED",
    onboarding_incomplete: !pharmacy.onboarding?.completed,
  };
}
