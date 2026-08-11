import type { Pharmacy, PharmacyPlan } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export type EntitlementKey =
  | "checkout_price_overrides"
  | "in_charge_account"
  | "controlled_sale_voids"
  | "financial_reports"
  | "advanced_reports"
  | "backup_export"
  | "multi_branch";

export type EntitlementObservation = {
  mode: "OBSERVE" | "ENFORCE";
  plan: PharmacyPlan;
  limits: { staff_accounts: number | null; products: number | null; branches: number };
  usage: { staff_accounts: number; products: number; branches: number };
  enabled: Record<EntitlementKey, boolean>;
  would_block: string[];
  note: string;
};

type Usage = { staff_accounts?: number; products?: number; branches?: number };

const businessFeatures: EntitlementKey[] = [
  "checkout_price_overrides",
  "in_charge_account",
  "controlled_sale_voids",
  "financial_reports",
  "advanced_reports",
  "backup_export",
];

export function getPharmacyEntitlementObservation(pharmacy: Pharmacy, usage: Usage = {}): EntitlementObservation {
  const plan = pharmacy.plan;
  const effectivePlan = plan === "TRIAL" ? "BUSINESS" : plan;
  const isBusiness = effectivePlan === "BUSINESS" || effectivePlan === "MULTI_BRANCH" || effectivePlan === "ENTERPRISE";
  const isMultiBranch = effectivePlan === "MULTI_BRANCH" || effectivePlan === "ENTERPRISE";
  const limits = effectivePlan === "STARTER"
    ? { staff_accounts: 3, products: 1_000, branches: 1 }
    : effectivePlan === "BUSINESS"
      ? { staff_accounts: 10, products: null, branches: 1 }
      : effectivePlan === "MULTI_BRANCH"
        ? { staff_accounts: 25, products: null, branches: 3 }
        : { staff_accounts: null, products: null, branches: 1 };
  const currentUsage = {
    staff_accounts: Math.max(0, usage.staff_accounts || 0),
    products: Math.max(0, usage.products || 0),
    branches: Math.max(1, usage.branches || 1),
  };
  const enabled = Object.fromEntries(
    [...businessFeatures.map((feature) => [feature, isBusiness] as const), ["multi_branch", isMultiBranch] as const],
  ) as Record<EntitlementKey, boolean>;
  const wouldBlock: string[] = [];

  if (limits.staff_accounts !== null && currentUsage.staff_accounts > limits.staff_accounts) {
    wouldBlock.push(`Staff usage ${currentUsage.staff_accounts}/${limits.staff_accounts}`);
  }
  if (limits.products !== null && currentUsage.products > limits.products) {
    wouldBlock.push(`Product usage ${currentUsage.products}/${limits.products}`);
  }
  if (currentUsage.branches > limits.branches) wouldBlock.push(`Branch usage ${currentUsage.branches}/${limits.branches}`);

  return {
    mode: pharmacy.entitlement_mode || "OBSERVE",
    plan,
    limits,
    usage: currentUsage,
    enabled,
    would_block: wouldBlock,
    note: "Observation only: no feature or usage restriction is enforced by this result.",
  };
}

export async function getPharmacyEntitlementObservationFromDatabase(pharmacy: Pharmacy) {
  const supabase = getSupabaseAdmin();
  const [staff, products] = await Promise.all([
    supabase.from("pharmacy_users").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacy.id).eq("active", true),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacy.id),
  ]);

  if (staff.error) throw staff.error;
  if (products.error) throw products.error;

  return getPharmacyEntitlementObservation(pharmacy, {
    staff_accounts: staff.count || 0,
    products: products.count || 0,
    branches: 1,
  });
}
