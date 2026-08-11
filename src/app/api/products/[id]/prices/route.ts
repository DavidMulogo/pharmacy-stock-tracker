import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-log";
import type { Json } from "@/lib/database.types";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";

function optionalPrice(value: unknown, label: string) {
  if (value === null || value === "") return null;
  const raw = String(value).trim();
  const price = Number(raw);
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(price)) {
    throw new Error(`${label} must be a non-negative amount with no more than two decimal places.`);
  }
  return price;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authenticatePharmacyFromSessionCookie();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (session.role !== "OWNER") return NextResponse.json({ error: "Only the pharmacy owner can change normal selling prices." }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdmin();
    const result = await supabase.rpc("update_product_selling_prices_v1", {
      p_pharmacy_id: session.pharmacy.id,
      p_changed_by: session.user.id,
      p_product_id: id,
      p_unit_price: optionalPrice(body.unit_price, "Unit price"),
      p_pack_price: optionalPrice(body.pack_price, "Pack price"),
    });
    if (result.error) throw result.error;

    const change = result.data as Json;
    const detail = change && typeof change === "object" && !Array.isArray(change) ? change : {};
    await recordActivity(
      { pharmacyId: session.pharmacy.id, userId: session.user.id, name: session.user.full_name, role: session.role },
      {
        action: "PRODUCT_PRICE_UPDATED", entityType: "product", entityId: id,
        description: `Updated the normal selling price for ${String(detail.product_name || "a product")}.`, metadata: detail,
      },
    );
    revalidatePath("/");
    revalidatePath(`/products/${id}`);
    revalidatePath("/reports");
    return NextResponse.json({ change: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update selling prices.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
