import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

const requiredColumns = [
  "product_name",
  "generic_name",
  "brand_name",
  "dosage_form",
  "base_unit",
  "pack_type",
  "units_per_pack",
  "selling_mode",
  "default_unit_price",
  "default_pack_price",
  "reorder_level",
] as const;

function toNumber(value: unknown) {
  return Number(String(value ?? "").trim());
}

function toOptionalNumber(value: unknown) {
  const text = String(value ?? "").trim();
  return text === "" ? null : Number(text);
}

function validateRow(row: Record<string, unknown>, index: number) {
  const errors: string[] = [];
  const productName = String(row.product_name ?? "").trim();
  const sellingMode = String(row.selling_mode ?? "").trim();
  const unitsPerPack = toNumber(row.units_per_pack);
  const defaultUnitPrice = toOptionalNumber(row.default_unit_price);
  const defaultPackPrice = toOptionalNumber(row.default_pack_price);
  const reorderLevel = toNumber(row.reorder_level);

  if (!productName) errors.push("Missing product name.");
  if (!["UNIT", "PACK", "BOTH"].includes(sellingMode)) errors.push("Selling mode must be UNIT, PACK, or BOTH.");
  if (!Number.isInteger(unitsPerPack) || unitsPerPack <= 0) errors.push("Units per pack must be a whole number greater than zero.");
  if (defaultUnitPrice === null && defaultPackPrice === null) errors.push("At least one default price is required.");
  if (defaultUnitPrice !== null && (!Number.isFinite(defaultUnitPrice) || defaultUnitPrice < 0)) errors.push("Default unit price must be zero or greater.");
  if (defaultPackPrice !== null && (!Number.isFinite(defaultPackPrice) || defaultPackPrice < 0)) errors.push("Default pack price must be zero or greater.");
  if (!Number.isInteger(reorderLevel) || reorderLevel < 0) errors.push("Reorder level must be a whole number zero or greater.");

  for (const column of requiredColumns) {
    if (column === "default_unit_price" || column === "default_pack_price") continue;
    if (String(row[column] ?? "").trim() === "") errors.push(`Missing ${column}.`);
  }

  return {
    row: index,
    errors,
    product: {
      product_name: productName,
      generic_name: String(row.generic_name ?? "").trim(),
      brand_name: String(row.brand_name ?? "").trim(),
      dosage_form: String(row.dosage_form ?? "").trim(),
      base_unit: String(row.base_unit ?? "").trim(),
      pack_type: String(row.pack_type ?? "").trim(),
      units_per_pack: unitsPerPack,
      default_selling_price: defaultUnitPrice ?? (defaultPackPrice !== null && unitsPerPack > 0 ? defaultPackPrice / unitsPerPack : 0),
      selling_mode: sellingMode as ProductInsert["selling_mode"],
      default_unit_price: defaultUnitPrice,
      default_pack_price: defaultPackPrice,
      reorder_level: reorderLevel,
    } satisfies ProductInsert,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pharmacyId = String(body.pharmacy_id || "");
    const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];

    if (!pharmacyId) {
      return NextResponse.json({ error: "Select a pharmacy before importing products." }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No product rows found." }, { status: 400 });
    }

    const missingColumns = requiredColumns.filter((column) => !(column in rows[0]));
    if (missingColumns.length > 0) {
      return NextResponse.json({ error: `Missing required columns: ${missingColumns.join(", ")}` }, { status: 400 });
    }

    const validated = rows.map((row, index) => validateRow(row, index + 2));
    const rowErrors = validated.filter((item) => item.errors.length > 0);

    if (rowErrors.length > 0) {
      return NextResponse.json({ error: "Fix row errors before importing.", rowErrors }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("products")
      .insert(validated.map((item) => ({ ...item.product, pharmacy_id: pharmacyId })))
      .select("id");

    if (result.error) throw result.error;

    revalidatePath("/");
    return NextResponse.json({ imported: result.data?.length || 0 }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import products.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
