import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type BatchInsert = Database["public"]["Tables"]["inventory_batches"]["Insert"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type BatchKeyFields = {
  pharmacy_id?: string | null;
  product_id: string;
  batch_number: string;
  expiry_date: string;
};

const requiredColumns = ["product_name", "batch_number", "expiry_date", "packs_received", "buying_price_per_pack"] as const;
const duplicateBatchMessage = "This batch already exists for this product and expiry date.";

function toNumber(value: unknown) {
  return Number(String(value ?? "").trim());
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function getBatchKey(batch: BatchKeyFields) {
  return `${batch.pharmacy_id || ""}::${batch.product_id}::${batch.batch_number.trim().toLowerCase()}::${batch.expiry_date}`;
}

function validateRow(row: Record<string, unknown>, index: number, productsByName: Map<string, ProductRow>, pharmacyId: string) {
  const errors: string[] = [];
  const productName = String(row.product_name ?? "").trim();
  const batchNumber = String(row.batch_number ?? "").trim();
  const expiryDate = String(row.expiry_date ?? "").trim();
  const packsReceived = toNumber(row.packs_received);
  const buyingPricePerPack = toNumber(row.buying_price_per_pack ?? row.buying_price);
  const product = productsByName.get(normalizeName(productName));

  if (!productName) errors.push("Missing product name.");
  if (productName && !product) errors.push(`Product not found: ${productName}.`);
  if (!batchNumber) errors.push("Missing batch number.");
  if (!isValidIsoDate(expiryDate)) errors.push("Expiry date must be a valid YYYY-MM-DD date.");
  if (!Number.isInteger(packsReceived) || packsReceived <= 0) errors.push("Packs received must be a whole number greater than zero.");
  if (!Number.isFinite(buyingPricePerPack) || buyingPricePerPack < 0) errors.push("Buying price per pack must be zero or greater.");
  const batch: BatchInsert | null = product
    ? {
        pharmacy_id: pharmacyId,
        product_id: product.id,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        packs_received: packsReceived,
        units_per_pack: product.units_per_pack,
        buying_price_per_pack: buyingPricePerPack,
        buying_price: buyingPricePerPack,
      }
    : null;

  return {
    row: index,
    errors,
    batch,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pharmacyId = String(body.pharmacy_id || "");
    const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];

    if (!pharmacyId) {
      return NextResponse.json({ error: "Select a pharmacy before importing inventory batches." }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No inventory batch rows found." }, { status: 400 });
    }

    const missingColumns = requiredColumns.filter((column) => {
      if (column === "buying_price_per_pack") {
        return !("buying_price_per_pack" in rows[0]) && !("buying_price" in rows[0]);
      }
      return !(column in rows[0]);
    });
    if (missingColumns.length > 0) {
      return NextResponse.json({ error: `Missing required columns: ${missingColumns.join(", ")}` }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const productsResult = await supabase.from("products").select("*").eq("pharmacy_id", pharmacyId);
    if (productsResult.error) throw productsResult.error;

    const productsByName = new Map((productsResult.data || []).map((product) => [normalizeName(product.product_name), product]));
    const validated = rows.map((row, index) => validateRow(row, index + 2, productsByName, pharmacyId));
    const rowErrors = validated.filter((item) => item.errors.length > 0);

    if (rowErrors.length > 0) {
      return NextResponse.json({ error: "Fix row errors before importing.", rowErrors }, { status: 400 });
    }

    const batches = validated.map((item) => item.batch).filter((batch): batch is BatchInsert => Boolean(batch));
    const existingResult = await supabase
      .from("inventory_batches")
      .select("pharmacy_id, product_id, batch_number, expiry_date")
      .eq("pharmacy_id", pharmacyId);

    if (existingResult.error) throw existingResult.error;

    const existingKeys = new Set((existingResult.data || []).map((batch) => getBatchKey(batch)));
    const seenImportKeys = new Set<string>();
    const duplicateRows: { row: number; warnings: string[] }[] = [];

    batches.forEach((batch, index) => {
      const key = getBatchKey(batch);
      const warnings: string[] = [];

      if (existingKeys.has(key)) warnings.push(duplicateBatchMessage);
      if (seenImportKeys.has(key)) warnings.push(duplicateBatchMessage);
      seenImportKeys.add(key);

      if (warnings.length > 0) {
        duplicateRows.push({ row: index + 2, warnings });
      }
    });

    if (duplicateRows.length > 0) {
      return NextResponse.json({ error: "Duplicate inventory batches were found.", duplicateRows }, { status: 409 });
    }

    const result = await supabase.from("inventory_batches").insert(batches).select("id");

    if (result.error) {
      if (result.error.code === "23505") {
        return NextResponse.json(
          { error: "Duplicate inventory batches were found.", duplicateRows: [{ row: 0, warnings: [duplicateBatchMessage] }] },
          { status: 409 },
        );
      }
      throw result.error;
    }

    revalidatePath("/");
    return NextResponse.json({ imported: result.data?.length || 0 }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import inventory batches.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
