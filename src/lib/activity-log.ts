import { getSupabaseAdmin } from "@/lib/supabase";
import type { ActivityLog, ActivityLogAction, PharmacyUserRole } from "@/lib/types";
import type { Database, Json } from "@/lib/database.types";

type ActivityLogRow = Database["public"]["Tables"]["activity_logs"]["Row"];

export type ActivityActor = {
  pharmacyId: string;
  userId: string;
  name: string;
  role: PharmacyUserRole;
};

export type ActivityLogInput = {
  action: ActivityLogAction;
  entityType: string;
  entityId?: string | null;
  description: string;
  metadata?: Json;
};

function normalizeActivityLog(row: ActivityLogRow): ActivityLog {
  return {
    id: row.id,
    pharmacy_id: row.pharmacy_id,
    actor_user_id: row.actor_user_id,
    actor_name: row.actor_name,
    actor_role: row.actor_role,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    description: row.description,
    metadata: row.metadata,
    created_at: row.created_at,
  };
}

export async function recordActivity(actor: ActivityActor, input: ActivityLogInput) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("activity_logs").insert({
    pharmacy_id: actor.pharmacyId,
    actor_user_id: actor.userId,
    actor_name: actor.name,
    actor_role: actor.role,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId || null,
    description: input.description,
    metadata: input.metadata || {},
  });

  if (result.error) throw result.error;
}

export async function getActivityLogs(
  pharmacyId: string,
  filters: { action?: ActivityLogAction; from?: string; to?: string; limit?: number } = {},
): Promise<ActivityLog[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("activity_logs").select("*").eq("pharmacy_id", pharmacyId);

  if (filters.action) query = query.eq("action", filters.action);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    query = query.lt("created_at", end.toISOString());
  }

  const result = await query.order("created_at", { ascending: false }).limit(Math.min(filters.limit || 200, 500));
  if (result.error) throw result.error;
  return ((result.data || []) as ActivityLogRow[]).map(normalizeActivityLog);
}
