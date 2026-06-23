import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { resolveDefaultPrice } from "@/lib/pricing";

type SaleInsert = Database["public"]["Tables"]["sales"]["Insert"];
const sellTypes = ["UNIT", "PACK"] as const;
type SellType = (typeof sellTypes)[number];

function isSellType(value: string): value is SellType {
  return sellTypes.includes(value as SellType);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const productId = String(body.product_id || "");
    const sellType = String(body.sell_type || "");
    const quantityEntered = Number(body.quantity_entered);
    const overridePrice = body.override_price === "" || body.override_price == null ? null : Number(body.override_price);

    if (!productId) {
      return NextResponse.json({ error: "Select a product before saving a sale." }, { status: 400 });
    }

    if (!isSellType(sellType)) {
      return NextResponse.json({ error: "Choose whether to sell by unit or pack." }, { status: 400 });
    }

    if (!Number.isInteger(quantityEntered) || quantityEntered <= 0) {
      return NextResponse.json({ error: "Quantity must be a whole number greater than zero." }, { status: 400 });
    }

    if (overridePrice !== null && (!Number.isFinite(overridePrice) || overridePrice < 0)) {
      return NextResponse.json({ error: "Override price must be zero or greater." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const stockResult = await supabase
      .from("product_stock_summary")
      .select("id, selling_mode, units_per_pack, default_unit_price, default_pack_price, available_stock, derived_unit_cost")
      .eq("id", productId)
      .single();

    if (stockResult.error) throw stockResult.error;

    const sellingMode = stockResult.data.selling_mode;
    if (sellingMode === "UNIT" && sellType !== "UNIT") {
      return NextResponse.json({ error: "This product can only be sold by unit." }, { status: 400 });
    }
    if (sellingMode === "PACK" && sellType !== "PACK") {
      return NextResponse.json({ error: "This product can only be sold by pack." }, { status: 400 });
    }

    const unitsPerPack = Number(stockResult.data.units_per_pack);
    const unitsSold = sellType === "PACK" ? quantityEntered * unitsPerPack : quantityEntered;
    const defaultPrice = resolveDefaultPrice(
      {
        default_unit_price: stockResult.data.default_unit_price,
        default_pack_price: stockResult.data.default_pack_price,
        units_per_pack: unitsPerPack,
      },
      sellType,
    );
    if (defaultPrice == null) {
      return NextResponse.json({ error: "Price not set for this sell type." }, { status: 400 });
    }
    const effectivePrice = overridePrice ?? defaultPrice;
    const availableStock = Number(stockResult.data.available_stock);

    if (unitsSold > availableStock) {
      return NextResponse.json({ error: `Only ${availableStock} units are available.` }, { status: 409 });
    }

    const salePayload: SaleInsert = {
      product_id: productId,
      sell_type: sellType,
      quantity_entered: quantityEntered,
      units_sold: unitsSold,
      quantity_sold: unitsSold,
      default_price: defaultPrice,
      override_price: overridePrice,
      effective_price: effectivePrice,
      final_selling_price: overridePrice,
    };

    const saleResult = await supabase
      .from("sales")
      .insert(salePayload)
      .select()
      .single();

    if (saleResult.error) throw saleResult.error;
    revalidatePath("/");
    revalidatePath(`/products/${productId}`);
    return NextResponse.json({ sale: saleResult.data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save sale.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
