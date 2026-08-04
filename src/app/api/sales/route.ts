import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { authenticatePharmacyFromSessionCookie } from "@/lib/pharmacy-session";
import { recordActivity } from "@/lib/activity-log";

const sellTypes = ["UNIT", "PACK"] as const;
type SellType = (typeof sellTypes)[number];
type CartItemInput = {
  product_id: string;
  sell_type: SellType;
  quantity_entered: number;
  override_price: number | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSellType(value: string): value is SellType {
  return sellTypes.includes(value as SellType);
}
function parseCartItem(value: unknown, index: number): CartItemInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Cart item ${index + 1} is invalid.`);
  }

  const item = value as Record<string, unknown>;
  const productId = String(item.product_id || "");
  const sellType = String(item.sell_type || "");
  const quantityEntered = Number(item.quantity_entered);
  const overridePrice = item.override_price === "" || item.override_price == null ? null : Number(item.override_price);

  if (!UUID_PATTERN.test(productId)) {
    throw new Error(`Select a valid product for cart item ${index + 1}.`);
  }
  if (!isSellType(sellType)) {
    throw new Error(`Choose unit or pack for cart item ${index + 1}.`);
  }
  if (!Number.isInteger(quantityEntered) || quantityEntered <= 0) {
    throw new Error(`Cart item ${index + 1} quantity must be a whole number greater than zero.`);
  }
  if (overridePrice !== null && (!Number.isFinite(overridePrice) || overridePrice < 0)) {
    throw new Error(`Cart item ${index + 1} override price must be zero or greater.`);
  }

  return {
    product_id: productId,
    sell_type: sellType,
    quantity_entered: quantityEntered,
    override_price: overridePrice,
  };
}

export async function POST(request: Request) {
  try {
    const session = await authenticatePharmacyFromSessionCookie();

    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const rawItems = Array.isArray(body.items)
      ? body.items
      : [{
          product_id: body.product_id,
          sell_type: body.sell_type,
          quantity_entered: body.quantity_entered,
          override_price: body.override_price,
        }];

    if (rawItems.length === 0) {
      return NextResponse.json({ error: "Add at least one item to the sale." }, { status: 400 });
    }
    if (rawItems.length > 50) {
      return NextResponse.json({ error: "A sale cannot contain more than 50 items." }, { status: 400 });
    }

    let items: CartItemInput[];
    try {
      items = rawItems.map(parseCartItem);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "The cart contains an invalid item." },
        { status: 400 },
      );
    }

    const pharmacyId = session.pharmacy.id;
    const supabase = getSupabaseAdmin();
    const transactionResult = await supabase.rpc("create_sale_transaction_v2", {
      p_pharmacy_id: pharmacyId,
      p_created_by: session.user.id,
      p_items: items,
    });

    if (transactionResult.error) {
      const code = transactionResult.error.code;
      const status = code === "P0001" ? 409 : code === "42501" ? 403 : code === "22023" ? 400 : 500;
      return NextResponse.json(
        { error: transactionResult.error.message || "Unable to complete the sale." },
        { status },
      );
    }

    const transaction = transactionResult.data as {
      id: string;
      item_count: number;
      total_amount: number;
      sale_ids: string[];
      created_at: string;
    };

    try {
      await recordActivity(
        { pharmacyId, userId: session.user.id, name: session.user.full_name, role: session.role },
        {
          action: "SALE_CREATED",
          entityType: "sale_transaction",
          entityId: transaction.id,
          description: `Completed a sale with ${transaction.item_count} item${transaction.item_count === 1 ? "" : "s"}.`,
          metadata: {
            item_count: transaction.item_count,
            total_sale: transaction.total_amount,
            product_ids: [...new Set(items.map((item) => item.product_id))],
            sale_ids: transaction.sale_ids,
            price_override_count: items.filter((item) => item.override_price !== null).length,
          },
        },
      );
    } catch (activityError) {
      // The atomic sale has already committed. Never report it as failed and
      // invite a duplicate retry only because the secondary audit write failed.
      console.error("Sale completed but activity logging failed.", activityError);
    }

    revalidatePath("/");
    for (const productId of new Set(items.map((item) => item.product_id))) {
      revalidatePath(`/products/${productId}`);
    }

    return NextResponse.json({ transaction, sale: null }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save sale.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
