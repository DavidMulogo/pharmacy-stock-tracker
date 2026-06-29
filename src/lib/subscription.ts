import type { Pharmacy, PharmacyPlan, PharmacyStatus } from "@/lib/types";

export type PharmacyAccessStatus = "ALLOWED" | "TRIAL_EXPIRED" | "SUBSCRIPTION_EXPIRED" | "SUSPENDED";

type PharmacySubscriptionFields = Pick<Pharmacy, "plan" | "status" | "trial_ends_at" | "subscription_ends_at">;

const EXPIRY_WARNING_DAYS = 7;

function isPast(dateValue: string | null) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return false;
  return date.getTime() < Date.now();
}

function isWithinWarningWindow(dateValue: string | null) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return false;

  const now = Date.now();
  const warningEndsAt = now + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;
  return date.getTime() >= now && date.getTime() <= warningEndsAt;
}

function normalizePlan(plan: PharmacyPlan | null | undefined): PharmacyPlan {
  return plan || "TRIAL";
}

function normalizeStatus(status: PharmacyStatus | null | undefined): PharmacyStatus {
  return status || "TRIAL";
}

export function getPharmacyAccessStatus(pharmacy: PharmacySubscriptionFields): PharmacyAccessStatus {
  const plan = normalizePlan(pharmacy.plan);
  const status = normalizeStatus(pharmacy.status);

  if (status === "SUSPENDED") return "SUSPENDED";
  if (status === "EXPIRED") return plan === "TRIAL" ? "TRIAL_EXPIRED" : "SUBSCRIPTION_EXPIRED";
  if (plan === "TRIAL" && isPast(pharmacy.trial_ends_at)) return "TRIAL_EXPIRED";
  if (plan !== "TRIAL" && isPast(pharmacy.subscription_ends_at)) return "SUBSCRIPTION_EXPIRED";

  return "ALLOWED";
}

export function getPharmacyAccessMessage(status: PharmacyAccessStatus) {
  if (status === "TRIAL_EXPIRED") return "Trial expired. Please contact PharmaStock to activate your subscription.";
  if (status === "SUBSCRIPTION_EXPIRED") return "Subscription expired. Please renew to continue.";
  if (status === "SUSPENDED") return "Account suspended. Please contact support.";
  return "";
}

export function getPharmacyExpiryWarning(pharmacy: PharmacySubscriptionFields) {
  if (getPharmacyAccessStatus(pharmacy) !== "ALLOWED") return null;

  const plan = normalizePlan(pharmacy.plan);
  if (plan === "TRIAL" && isWithinWarningWindow(pharmacy.trial_ends_at)) return "Trial ending soon";
  if (plan !== "TRIAL" && isWithinWarningWindow(pharmacy.subscription_ends_at)) return "Subscription ending soon";

  return null;
}
