import { recordActivity, type ActivityActor } from "@/lib/activity-log";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { OnboardingProgress, OnboardingProgressSummary, OnboardingStepId, PharmacyOnboarding } from "@/lib/types";

type OnboardingRow = Database["public"]["Tables"]["pharmacy_onboarding"]["Row"];
type OnboardingUpdate = Database["public"]["Tables"]["pharmacy_onboarding"]["Update"];

const stepTimestampFields = {
  profile: "profile_reviewed_at",
  business_rules: "business_rules_reviewed_at",
  staff: "staff_reviewed_at",
  products: "products_reviewed_at",
  opening_stock: "opening_stock_reviewed_at",
  subscription: "subscription_reviewed_at",
} satisfies Record<OnboardingStepId, keyof OnboardingRow>;

const stepLabels = {
  profile: "Pharmacy profile",
  business_rules: "Business rules",
  staff: "Staff",
  products: "Products",
  opening_stock: "Opening stock",
  subscription: "Subscription readiness",
} satisfies Record<OnboardingStepId, string>;

function normalizeOnboarding(row: OnboardingRow): PharmacyOnboarding {
  return {
    id: row.id,
    pharmacy_id: row.pharmacy_id,
    started_at: row.started_at,
    profile_reviewed_at: row.profile_reviewed_at,
    business_rules_reviewed_at: row.business_rules_reviewed_at,
    staff_reviewed_at: row.staff_reviewed_at,
    products_reviewed_at: row.products_reviewed_at,
    opening_stock_reviewed_at: row.opening_stock_reviewed_at,
    subscription_reviewed_at: row.subscription_reviewed_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isUniqueViolation(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505";
}

async function getOrCreateOnboardingRow(pharmacyId: string, actor?: ActivityActor): Promise<PharmacyOnboarding> {
  const supabase = getSupabaseAdmin();
  const existing = await supabase.from("pharmacy_onboarding").select("*").eq("pharmacy_id", pharmacyId).maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) return normalizeOnboarding(existing.data);

  const created = await supabase.from("pharmacy_onboarding").insert({ pharmacy_id: pharmacyId }).select("*").single();
  if (created.error) {
    if (isUniqueViolation(created.error)) {
      const retry = await supabase.from("pharmacy_onboarding").select("*").eq("pharmacy_id", pharmacyId).single();
      if (retry.error) throw retry.error;
      return normalizeOnboarding(retry.data);
    }
    throw created.error;
  }

  if (actor) {
    await recordActivity(actor, {
      action: "ONBOARDING_STARTED",
      entityType: "pharmacy_onboarding",
      entityId: created.data.id,
      description: "Started pharmacy onboarding.",
    });
  }

  return normalizeOnboarding(created.data);
}

async function getTenantCounts(pharmacyId: string) {
  const supabase = getSupabaseAdmin();
  const [products, batches, staff] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId),
    supabase.from("inventory_batches").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId),
    supabase.from("pharmacy_users").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId),
  ]);

  if (products.error) throw products.error;
  if (batches.error) throw batches.error;
  if (staff.error) throw staff.error;

  return {
    productCount: products.count || 0,
    inventoryBatchCount: batches.count || 0,
    staffCount: staff.count || 0,
  };
}

export function summarizeOnboarding(
  onboarding: PharmacyOnboarding,
  counts: { productCount: number; inventoryBatchCount: number },
): OnboardingProgressSummary {
  const requiredChecks = [
    Boolean(onboarding.profile_reviewed_at),
    Boolean(onboarding.business_rules_reviewed_at),
    counts.productCount > 0,
    counts.inventoryBatchCount > 0,
  ];
  const reviewedRequiredSteps = requiredChecks.filter(Boolean).length;
  const completed = Boolean(onboarding.completed_at);

  return {
    percent: completed ? 100 : Math.round((reviewedRequiredSteps / requiredChecks.length) * 100),
    completed,
    completed_at: onboarding.completed_at,
    product_count: counts.productCount,
    inventory_batch_count: counts.inventoryBatchCount,
    reviewed_required_steps: reviewedRequiredSteps,
    required_steps: requiredChecks.length,
  };
}

export async function getOnboardingProgress(pharmacyId: string, actor?: ActivityActor): Promise<OnboardingProgress> {
  const onboarding = await getOrCreateOnboardingRow(pharmacyId, actor);
  const counts = await getTenantCounts(pharmacyId);
  const summary = summarizeOnboarding(onboarding, counts);
  const missingRequirements: string[] = [];

  if (!onboarding.profile_reviewed_at) missingRequirements.push("Review the pharmacy profile.");
  if (!onboarding.business_rules_reviewed_at) missingRequirements.push("Review business rules.");
  if (counts.productCount <= 0) missingRequirements.push("Add at least one product.");
  if (counts.inventoryBatchCount <= 0) missingRequirements.push("Add at least one opening stock batch.");

  return {
    ...summary,
    onboarding,
    staff_count: counts.staffCount,
    can_complete: missingRequirements.length === 0,
    missing_requirements: missingRequirements,
  };
}

function emptyOnboarding(pharmacyId: string): PharmacyOnboarding {
  const now = new Date(0).toISOString();
  return {
    id: "",
    pharmacy_id: pharmacyId,
    started_at: now,
    profile_reviewed_at: null,
    business_rules_reviewed_at: null,
    staff_reviewed_at: null,
    products_reviewed_at: null,
    opening_stock_reviewed_at: null,
    subscription_reviewed_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getOnboardingSummary(pharmacyId: string): Promise<OnboardingProgressSummary> {
  const supabase = getSupabaseAdmin();
  const [onboardingResult, counts] = await Promise.all([
    supabase.from("pharmacy_onboarding").select("*").eq("pharmacy_id", pharmacyId).maybeSingle(),
    getTenantCounts(pharmacyId),
  ]);

  if (onboardingResult.error) throw onboardingResult.error;
  return summarizeOnboarding(
    onboardingResult.data ? normalizeOnboarding(onboardingResult.data) : emptyOnboarding(pharmacyId),
    counts,
  );
}

export async function reviewOnboardingStep(pharmacyId: string, step: OnboardingStepId, actor: ActivityActor) {
  const onboarding = await getOrCreateOnboardingRow(pharmacyId, actor);
  const field = stepTimestampFields[step];
  const alreadyReviewed = Boolean(onboarding[field]);

  if (!alreadyReviewed) {
    const now = new Date().toISOString();
    const update: OnboardingUpdate = { [field]: now, updated_at: now };
    const result = await getSupabaseAdmin()
      .from("pharmacy_onboarding")
      .update(update)
      .eq("pharmacy_id", pharmacyId)
      .select("*")
      .single();

    if (result.error) throw result.error;

    await recordActivity(actor, {
      action: "ONBOARDING_STEP_REVIEWED",
      entityType: "pharmacy_onboarding",
      entityId: result.data.id,
      description: `Reviewed onboarding step: ${stepLabels[step]}.`,
      metadata: { step },
    });
  }

  return getOnboardingProgress(pharmacyId);
}

export async function completeOnboarding(pharmacyId: string, actor: ActivityActor) {
  const progress = await getOnboardingProgress(pharmacyId, actor);
  if (!progress.can_complete) {
    return { progress, completed: false };
  }
  if (progress.onboarding.completed_at) {
    return { progress, completed: true };
  }

  const now = new Date().toISOString();
  const result = await getSupabaseAdmin()
    .from("pharmacy_onboarding")
    .update({ completed_at: now, updated_at: now })
    .eq("pharmacy_id", pharmacyId)
    .select("*")
    .single();

  if (result.error) throw result.error;

  await recordActivity(actor, {
    action: "ONBOARDING_COMPLETED",
    entityType: "pharmacy_onboarding",
    entityId: result.data.id,
    description: "Completed pharmacy onboarding.",
    metadata: {
      product_count: progress.product_count,
      inventory_batch_count: progress.inventory_batch_count,
    },
  });

  return { progress: await getOnboardingProgress(pharmacyId), completed: true };
}

export const onboardingStepIds = Object.keys(stepTimestampFields) as OnboardingStepId[];
