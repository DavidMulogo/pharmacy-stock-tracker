import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { recordActivity } from "@/lib/activity-log";

type BatchInsert = Database["public"]["Tables"]["inventory_batches"]["Insert"];

const duplicateBatchMessage = "This batch already exists for this product and expiry date.";

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function POST(request: Request) {
  try {
    const session = await authenticatePharmacyFromSessionCookie();

    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const pharmacyId = session.pharmacy.id;
    const productId = String(body.product_id || "");
    const batchNumber = String(body.batch_number || "").trim();
    const expiryDate = String(body.expiry_date || "");
    const packsReceived = Number(body.packs_received);
    const buyingPricePerPack = Number(body.buying_price_per_pack ?? body.buying_price);

    if (!productId) {
      return NextResponse.json({ error: "Select a product before adding stock." }, { status: 400 });
    }

    if (!batchNumber) {
      return NextResponse.json({ error: "Batch number is required." }, { status: 400 });
    }

    if (!isValidIsoDate(expiryDate)) {
      return NextResponse.json({ error: "Expiry date must be a valid date." }, { status: 400 });
    }

    if (!Number.isInteger(packsReceived) || packsReceived <= 0) {
      return NextResponse.json({ error: "Packs received must be a whole number greater than zero." }, { status: 400 });
    }

    if (!Number.isFinite(buyingPricePerPack) || buyingPricePerPack < 0) {
      return NextResponse.json({ error: "Buying price per pack must be zero or greater." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const productResult = await supabase
      .from("products")
      .select("units_per_pack")
      .eq("id", productId)
      .eq("pharmacy_id", pharmacyId)
      .single();

    if (productResult.error) throw productResult.error;

    const existingBatchResult = await supabase
      .from("inventory_batches")
      .select("id, batch_number")
      .eq("pharmacy_id", pharmacyId)
      .eq("product_id", productId)
      .eq("expiry_date", expiryDate);

    if (existingBatchResult.error) throw existingBatchResult.error;
    const duplicateBatch = (existingBatchResult.data || []).find(
      (batch) => batch.batch_number.trim().toLowerCase() === batchNumber.toLowerCase(),
    );
    if (duplicateBatch) {
      return NextResponse.json({ error: duplicateBatchMessage }, { status: 409 });
    }

    const batchPayload: BatchInsert = {
      pharmacy_id: pharmacyId,
      product_id: productId,
      batch_number: batchNumber,
      expiry_date: expiryDate,
      packs_received: packsReceived,
      units_per_pack: productResult.data.units_per_pack,
      buying_price_per_pack: buyingPricePerPack,
      buying_price: buyingPricePerPack,
    };

    const result = await supabase
      .from("inventory_batches")
      .insert(batchPayload)
      .select()
      .single();

    if (result.error) {
      if (result.error.code === "23505") {
        return NextResponse.json({ error: duplicateBatchMessage }, { status: 409 });
      }
      throw result.error;
    }
    await recordActivity(
      { pharmacyId, userId: session.user.id, name: session.user.full_name, role: session.role },
      {
        action: "STOCK_ADDED",
        entityType: "inventory_batch",
        entityId: result.data.id,
        description: `Added ${packsReceived} pack${packsReceived === 1 ? "" : "s"} of batch ${batchNumber}.`,
        metadata: { product_id: productId, batch_number: batchNumber, expiry_date: expiryDate, packs_received: packsReceived },
      },
    );
    revalidatePath("/");
    revalidatePath(`/products/${productId}`);
    return NextResponse.json({ batch: result.data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save batch.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
