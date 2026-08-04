import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordActivity } from "@/lib/activity-log";

export async function POST(request: Request) {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.role !== "OWNER") return NextResponse.json({ error: "Only the Owner can reverse inventory adjustments." }, { status: 403 });

  try {
    const body = await request.json();
    const adjustmentId = String(body.adjustment_id || "");
    const reason = String(body.reason || "").trim();
    if (!adjustmentId) return NextResponse.json({ error: "Select an inventory adjustment." }, { status: 400 });
    if (reason.length < 3 || reason.length > 500) return NextResponse.json({ error: "Enter a reversal reason between 3 and 500 characters." }, { status: 400 });

    const result = await getSupabaseAdmin().rpc("reverse_inventory_adjustment_v1", {
      p_pharmacy_id: session.pharmacy.id,
      p_reversed_by: session.user.id,
      p_adjustment_id: adjustmentId,
      p_reason: reason,
    });
    if (result.error) {
      const status = result.error.code === "P0001" ? 409 : result.error.code === "42501" ? 403 : result.error.code === "22023" ? 400 : 500;
      return NextResponse.json({ error: result.error.message || "Unable to reverse the adjustment." }, { status });
    }
    const reversal = result.data as { id: string; quantity: number; reason: string; stock_effect: number };
    await recordActivity(
      { pharmacyId: session.pharmacy.id, userId: session.user.id, name: session.user.full_name, role: session.role },
      {
        action: "INVENTORY_ADJUSTMENT_REVERSED",
        entityType: "inventory_adjustment",
        entityId: reversal.id,
        description: `Reversed a ${reversal.quantity}-unit ${reversal.reason.toLowerCase()} inventory adjustment.`,
        metadata: { quantity: reversal.quantity, original_reason: reversal.reason, stock_effect: reversal.stock_effect, reversal_reason: reason },
      },
    );
    revalidatePath("/");
    revalidatePath("/reports");
    return NextResponse.json({ reversal: result.data }, { status: 200 });
  } catch (error) {
    console.error("Unable to reverse inventory adjustment:", error);
    return NextResponse.json({ error: "Unable to reverse the inventory adjustment." }, { status: 500 });
  }
}
