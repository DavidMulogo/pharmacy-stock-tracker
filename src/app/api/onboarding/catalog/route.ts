import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordActivity } from "@/lib/activity-log";
import { getOnboardingProgress } from "@/lib/onboarding";
import type { Database } from "@/lib/database.types";

type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

async function requireOwner() {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (session.role !== "OWNER") return { response: NextResponse.json({ error: "Only pharmacy owners can use catalogue onboarding." }, { status: 403 }) };
  return { session };
}

function optionalPrice(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
}

export async function GET() {
  const auth = await requireOwner();
  if (auth.response) return auth.response;
  const supabase = getSupabaseAdmin();
  const [catalog, existing] = await Promise.all([
    supabase.from("master_medicines").select("*").eq("active", true).order("product_name"),
    supabase.from("products").select("master_medicine_id").eq("pharmacy_id", auth.session.pharmacy.id).not("master_medicine_id", "is", null),
  ]);
  if (catalog.error) return NextResponse.json({ error: "Unable to load the medicine catalogue." }, { status: 500 });
  if (existing.error) return NextResponse.json({ error: "Unable to check existing pharmacy products." }, { status: 500 });
  return NextResponse.json({ medicines: catalog.data || [], imported_ids: (existing.data || []).map((row) => row.master_medicine_id) });
}

export async function POST(request: Request) {
  // Catalogue import creates product definitions only. Buying price, quantity, batch number, and expiry remain batch-specific.
  const auth = await requireOwner();
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const selections = Array.isArray(body.selections) ? body.selections as Array<Record<string, unknown>> : [];
    if (!selections.length || selections.length > 250) return NextResponse.json({ error: "Select between 1 and 250 medicines." }, { status: 400 });
    const ids = [...new Set(selections.map((item) => String(item.master_medicine_id || "")).filter(Boolean))];
    if (ids.length !== selections.length) return NextResponse.json({ error: "Each selected medicine must be unique." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const catalog = await supabase.from("master_medicines").select("*").in("id", ids).eq("active", true);
    if (catalog.error) throw catalog.error;
    if ((catalog.data || []).length !== ids.length) return NextResponse.json({ error: "One or more catalogue medicines are unavailable." }, { status: 400 });
    const byId = new Map((catalog.data || []).map((medicine) => [medicine.id, medicine]));

    const products: ProductInsert[] = selections.map((selection) => {
      const medicine = byId.get(String(selection.master_medicine_id));
      if (!medicine) throw new Error("Catalogue medicine was not found.");
      const unitPrice = optionalPrice(selection.default_unit_price);
      const packPrice = optionalPrice(selection.default_pack_price);
      if (Number.isNaN(unitPrice) || Number.isNaN(packPrice)) throw new Error(`${medicine.product_name}: prices must be zero or greater.`);
      if (unitPrice === null && packPrice === null) throw new Error(`${medicine.product_name}: enter at least one selling price.`);
      if (medicine.default_selling_mode === "UNIT" && unitPrice === null) throw new Error(`${medicine.product_name}: enter a unit price.`);
      if (medicine.default_selling_mode === "PACK" && packPrice === null) throw new Error(`${medicine.product_name}: enter a pack price.`);
      const reorder = Number(selection.reorder_level ?? 0);
      if (!Number.isInteger(reorder) || reorder < 0) throw new Error(`${medicine.product_name}: reorder level must be a whole number.`);
      return {
        pharmacy_id: auth.session.pharmacy.id,
        master_medicine_id: medicine.id,
        product_name: medicine.product_name,
        generic_name: medicine.generic_name,
        brand_name: medicine.brand_name,
        dosage_form: medicine.dosage_form,
        base_unit: medicine.base_unit,
        pack_type: medicine.pack_type,
        units_per_pack: medicine.units_per_pack,
        selling_mode: medicine.default_selling_mode,
        default_unit_price: unitPrice,
        default_pack_price: packPrice,
        default_selling_price: unitPrice ?? (packPrice === null ? 0 : packPrice / medicine.units_per_pack),
        reorder_level: reorder,
      };
    });

    const result = await supabase.from("products").insert(products).select("id");
    if (result.error?.code === "23505") return NextResponse.json({ error: "One or more selected medicines already exist in this pharmacy catalogue." }, { status: 409 });
    if (result.error) throw result.error;
    const imported = result.data?.length || 0;
    const actor = { pharmacyId: auth.session.pharmacy.id, userId: auth.session.user.id, name: auth.session.user.full_name, role: auth.session.role };
    await recordActivity(actor, { action: "PRODUCTS_IMPORTED", entityType: "master_catalog", description: `Added ${imported} product${imported === 1 ? "" : "s"} from the PharmaStock catalogue.`, metadata: { imported } });
    const progress = await getOnboardingProgress(auth.session.pharmacy.id, actor);
    revalidatePath("/"); revalidatePath("/onboarding");
    return NextResponse.json({ imported, progress }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add catalogue medicines." }, { status: 400 });
  }
}
