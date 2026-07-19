import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getPharmacySettings, updatePharmacySettings } from "@/lib/pharmacy-settings";
import type { Database } from "@/lib/database.types";
import { recordActivity } from "@/lib/activity-log";

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

export async function GET() {
  try {
    const session = await authenticatePharmacyFromSessionCookie();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const settings = await getPharmacySettings(session.pharmacy.id, session.pharmacy.pharmacy_name);
    return NextResponse.json({ settings }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load pharmacy settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await authenticatePharmacyFromSessionCookie();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const body = await request.json();
    const update: PharmacySettingsUpdate = {
      registration_number: text(body.registration_number),
      license_number: text(body.license_number),
      address: text(body.address),
      region: text(body.region),
      district: text(body.district),
      email: text(body.email),
      logo_url: text(body.logo_url),
      receipt_header: text(body.receipt_header),
      receipt_footer: text(body.receipt_footer),
      receipt_prefix: text(body.receipt_prefix) || "RCP",
      low_stock_threshold: Math.floor(nonNegativeNumber(body.low_stock_threshold, "Low stock threshold")),
      expiry_warning_days: Math.floor(nonNegativeNumber(body.expiry_warning_days, "Expiry warning days")),
      allow_negative_stock: booleanValue(body.allow_negative_stock),
      allow_duplicate_batches: booleanValue(body.allow_duplicate_batches),
      allow_price_override: booleanValue(body.allow_price_override),
      max_discount: percentage(body.max_discount, "Max discount"),
      vat_percentage: percentage(body.vat_percentage, "VAT percentage"),
      currency: text(body.currency) || "TZS",
      timezone: text(body.timezone) || "Africa/Dar_es_Salaam",
    };

    const settings = await updatePharmacySettings(session.pharmacy.id, update);
    await recordActivity(
      { pharmacyId: session.pharmacy.id, userId: session.user.id, name: session.user.full_name, role: session.role },
      {
        action: "SETTINGS_UPDATED",
        entityType: "pharmacy_settings",
        entityId: settings.id,
        description: "Updated pharmacy settings.",
      },
    );
    revalidatePath("/settings");
    return NextResponse.json({ settings }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update pharmacy settings.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
