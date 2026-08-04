import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordActivity } from "@/lib/activity-log";

export async function POST(request: Request) {
  const session = await authenticatePharmacyFromSessionCookie();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.role !== "OWNER" && session.role !== "PHARMACIST") {
    return NextResponse.json({ error: "Only Owners and Pharmacists can void sales." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const transactionId = body.transaction_id ? String(body.transaction_id) : "";
    const saleId = body.sale_id ? String(body.sale_id) : "";
    const reason = String(body.reason || "").trim();
    if ((!transactionId && !saleId) || (transactionId && saleId)) {
      return NextResponse.json({ error: "Select exactly one transaction or legacy sale." }, { status: 400 });
    }
    if (reason.length < 3 || reason.length > 500) {
      return NextResponse.json({ error: "Enter a correction reason between 3 and 500 characters." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const result = transactionId
      ? await supabase.rpc("void_sale_transaction_v1", { p_pharmacy_id: session.pharmacy.id, p_voided_by: session.user.id, p_transaction_id: transactionId, p_reason: reason })
      : await supabase.rpc("void_legacy_sale_v1", { p_pharmacy_id: session.pharmacy.id, p_voided_by: session.user.id, p_sale_id: saleId, p_reason: reason });
    if (result.error) {
      const status = result.error.code === "P0001" ? 409 : result.error.code === "42501" ? 403 : result.error.code === "22023" ? 400 : 500;
      return NextResponse.json({ error: result.error.message || "Unable to void the sale." }, { status });
    }

    const correction = result.data as { id: string; line_count: number; total_amount: number };
    await recordActivity(
      { pharmacyId: session.pharmacy.id, userId: session.user.id, name: session.user.full_name, role: session.role },
      {
        action: "SALE_VOIDED",
        entityType: transactionId ? "sale_transaction" : "sale",
        entityId: correction.id,
        description: `Voided a sale containing ${correction.line_count} line${correction.line_count === 1 ? "" : "s"}.`,
        metadata: { transaction_id: transactionId || null, sale_id: saleId || null, line_count: correction.line_count, total_amount: correction.total_amount, reason },
      },
    );
    revalidatePath("/");
    revalidatePath("/reports");
    return NextResponse.json({ correction: result.data }, { status: 200 });
  } catch (error) {
    console.error("Unable to void sale:", error);
    return NextResponse.json({ error: "Unable to void the sale." }, { status: 500 });
  }
}
