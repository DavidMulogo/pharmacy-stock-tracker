import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordActivity } from "@/lib/activity-log";
import type { InventoryAdjustmentReason } from "@/lib/types";

const reasons: InventoryAdjustmentReason[] = ["DAMAGED", "EXPIRED", "CUSTOMER_RETURN", "SUPPLIER_RETURN", "MISSING", "INTERNAL_USE", "OTHER"];

function parseReason(value: unknown): InventoryAdjustmentReason | null {
  const reason = String(value || "").toUpperCase() as InventoryAdjustmentReason;
  return reasons.includes(reason) ? reason : null;
}

const reasonDescriptions: Record<InventoryAdjustmentReason, string> = {
  DAMAGED: "damaged or broken",
  EXPIRED: "expired",
  CUSTOMER_RETURN: "returned by a customer and quarantined",
  SUPPLIER_RETURN: "returned to the supplier",
  MISSING: "missing after a stock check",
  INTERNAL_USE: "used internally",
  OTHER: "removed for another reason",
};

export async function POST(request: Request) {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const body = await request.json();
    const productId = String(body.product_id || "");
    const batchId = body.inventory_batch_id ? String(body.inventory_batch_id) : null;
    const reason = parseReason(body.reason);
    const quantity = Number(body.quantity);
    const note = String(body.note || "").trim();

    if (!productId) return NextResponse.json({ error: "Select a medicine." }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Select a valid reason." }, { status: 400 });
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be a whole number greater than zero." }, { status: 400 });
    }
    if (reason !== "CUSTOMER_RETURN" && !batchId) {
      return NextResponse.json({ error: "Select the batch that will be reduced." }, { status: 400 });
    }
    if (note.length > 500) return NextResponse.json({ error: "Note cannot exceed 500 characters." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const result = await supabase.rpc("create_inventory_adjustment_v1", {
      p_pharmacy_id: session.pharmacy.id,
      p_created_by: session.user.id,
      p_product_id: productId,
      p_inventory_batch_id: batchId,
      p_reason: reason,
      p_quantity: quantity,
      p_note: note,
    });

    if (result.error) {
      const status = result.error.code === "P0001" ? 409 : result.error.code === "42501" ? 403 : result.error.code === "22023" ? 400 : 500;
      return NextResponse.json({ error: result.error.message || "Unable to record the adjustment." }, { status });
    }

    const adjustment = result.data as { id: string };
    const productResult = await supabase.from("products").select("product_name").eq("id", productId).eq("pharmacy_id", session.pharmacy.id).single();
    const productName = productResult.data?.product_name || "medicine";
    await recordActivity(
      { pharmacyId: session.pharmacy.id, userId: session.user.id, name: session.user.full_name, role: session.role },
      {
        action: "INVENTORY_ADJUSTED",
        entityType: "inventory_adjustment",
        entityId: adjustment.id,
        description: `Recorded ${quantity} unit${quantity === 1 ? "" : "s"} of ${productName} as ${reasonDescriptions[reason]}.`,
        metadata: { product_id: productId, inventory_batch_id: batchId, reason, quantity, stock_effect: reason === "CUSTOMER_RETURN" ? 0 : -1 },
      },
    );

    revalidatePath("/");
    revalidatePath(`/products/${productId}`);
    revalidatePath("/reports");
    return NextResponse.json({ adjustment: result.data }, { status: 201 });
  } catch (error) {
    console.error("Unable to record inventory adjustment:", error);
    return NextResponse.json({ error: "Unable to record the inventory adjustment." }, { status: 500 });
  }
}
