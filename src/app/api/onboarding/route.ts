import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { completeOnboarding, getOnboardingProgress, onboardingStepIds, reviewOnboardingStep } from "@/lib/onboarding";
import { updatePharmacySettings } from "@/lib/pharmacy-settings";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordActivity } from "@/lib/activity-log";
import type { Database } from "@/lib/database.types";
import type { OnboardingStepId } from "@/lib/types";

type PharmacySettingsUpdate = Database["public"]["Tables"]["pharmacy_settings"]["Update"];

function text(value: unknown) {
  return String(value || "").trim();
}

function booleanValue(value: unknown) {
  return value === true;
}

function nonNegativeNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return number;
}

function percentage(value: unknown, label: string) {
  const number = nonNegativeNumber(value, label);
  if (number > 100) {
    throw new Error(`${label} cannot be greater than 100.`);
  }
  return number;
}

function getActor(session: NonNullable<Awaited<ReturnType<typeof authenticatePharmacyFromSessionCookie>>>) {
  return {
    pharmacyId: session.pharmacy.id,
    userId: session.user.id,
    name: session.user.full_name,
    role: session.role,
  };
}

async function requireOwner() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (session.role !== "OWNER") {
    return { response: NextResponse.json({ error: "Only pharmacy owners can update onboarding." }, { status: 403 }) };
  }
  return { session };
}

function isOnboardingStep(value: string): value is OnboardingStepId {
  return onboardingStepIds.includes(value as OnboardingStepId);
}

export async function GET() {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  try {
    const progress = await getOnboardingProgress(auth.session.pharmacy.id, getActor(auth.session));
    return NextResponse.json({ progress }, { status: 200 });
  } catch (error) {
    console.error("Unable to load onboarding:", error);
    return NextResponse.json({ error: "Unable to load onboarding." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireOwner();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const action = String(body.action || "").trim();
    const actor = getActor(auth.session);

    if (action === "profile") {
      const pharmacyName = text(body.pharmacy_name);
      const ownerName = text(body.owner_name);
      const phone = text(body.phone);

      if (!pharmacyName || !ownerName || !phone) {
        return NextResponse.json({ error: "Pharmacy name, owner name, and phone are required." }, { status: 400 });
      }

      const supabase = getSupabaseAdmin();
      const pharmacyResult = await supabase
        .from("pharmacies")
        .update({ pharmacy_name: pharmacyName, owner_name: ownerName, phone })
        .eq("id", auth.session.pharmacy.id)
        .select("*")
        .single();

      if (pharmacyResult.error) throw pharmacyResult.error;

      const settings = await updatePharmacySettings(auth.session.pharmacy.id, {
        address: text(body.address),
        region: text(body.region),
        district: text(body.district),
        email: text(body.email),
      });

      await recordActivity(actor, {
        action: "SETTINGS_UPDATED",
        entityType: "pharmacy_profile",
        entityId: auth.session.pharmacy.id,
        description: "Updated pharmacy profile during onboarding.",
      });

      const progress = await reviewOnboardingStep(auth.session.pharmacy.id, "profile", actor);
      revalidatePath("/");
      revalidatePath("/settings");
      revalidatePath("/onboarding");
      return NextResponse.json({ pharmacy: pharmacyResult.data, settings, progress }, { status: 200 });
    }

    if (action === "business_rules") {
      const update: PharmacySettingsUpdate = {
        low_stock_threshold: Math.floor(nonNegativeNumber(body.low_stock_threshold, "Low stock threshold")),
        expiry_warning_days: Math.floor(nonNegativeNumber(body.expiry_warning_days, "Expiry warning days")),
        allow_price_override: booleanValue(body.allow_price_override),
        vat_percentage: percentage(body.vat_percentage, "VAT percentage"),
        currency: text(body.currency) || "TZS",
        timezone: text(body.timezone) || "Africa/Dar_es_Salaam",
      };

      const settings = await updatePharmacySettings(auth.session.pharmacy.id, update);
      await recordActivity(actor, {
        action: "SETTINGS_UPDATED",
        entityType: "pharmacy_settings",
        entityId: settings.id,
        description: "Updated business rules during onboarding.",
      });

      const progress = await reviewOnboardingStep(auth.session.pharmacy.id, "business_rules", actor);
      revalidatePath("/");
      revalidatePath("/settings");
      revalidatePath("/onboarding");
      return NextResponse.json({ settings, progress }, { status: 200 });
    }

    if (action === "review") {
      const step = String(body.step || "").trim();
      if (!isOnboardingStep(step)) {
        return NextResponse.json({ error: "Choose a valid onboarding step." }, { status: 400 });
      }

      const progress = await reviewOnboardingStep(auth.session.pharmacy.id, step, actor);
      revalidatePath("/");
      revalidatePath("/onboarding");
      return NextResponse.json({ progress }, { status: 200 });
    }

    if (action === "complete") {
      const result = await completeOnboarding(auth.session.pharmacy.id, actor);
      if (!result.completed) {
        return NextResponse.json(
          { error: "Complete the required onboarding items first.", progress: result.progress },
          { status: 400 },
        );
      }

      revalidatePath("/");
      revalidatePath("/onboarding");
      revalidatePath("/admin");
      return NextResponse.json({ progress: result.progress, message: "Onboarding completed." }, { status: 200 });
    }

    return NextResponse.json({ error: "Unsupported onboarding action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update onboarding.";
    console.error("Unable to update onboarding:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
