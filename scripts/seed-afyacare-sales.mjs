#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const REQUIRED_COLUMNS = [
  "sold_at",
  "product_name",
  "batch_number",
  "sell_type",
  "quantity",
  "expected_price",
  "final_price",
  "total_amount",
  "override_reason",
  "staff_username",
];

const SELL_TYPES = new Set(["UNIT", "PACK"]);
const MONEY_TOLERANCE = 0.005;

function parseArgs(argv) {
  const args = {
    file: "scripts/data/AfyaCare_safe_sales_seed.csv",
    pharmacy: "AfyaCare Pharmacy",
    staff: null,
    apply: false,
    dryRun: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") args.file = argv[++index];
    else if (arg === "--pharmacy") args.pharmacy = argv[++index];
    else if (arg === "--staff") args.staff = argv[++index];
    else if (arg === "--apply") {
      args.apply = true;
      args.dryRun = false;
    } else if (arg === "--dry-run") {
      args.apply = false;
      args.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.file) throw new Error("Missing --file path.");
  if (!args.pharmacy) throw new Error("Missing --pharmacy name.");
  return args;
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseCsv(content) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((header) => header.trim());
  const records = rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim() !== ""))
    .map((values, index) => {
      const record = { rowNumber: index + 2 };
      headers.forEach((header, columnIndex) => {
        record[header] = (values[columnIndex] || "").trim();
      });
      return record;
    });

  return { headers, records };
}

function parseInteger(value, label, rowNumber, errors) {
  if (!/^\d+$/.test(value)) {
    errors.push(`Row ${rowNumber}: ${label} must be a positive whole number.`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    errors.push(`Row ${rowNumber}: ${label} must be greater than zero.`);
    return null;
  }
  return parsed;
}

function parseMoney(value, label, rowNumber, errors) {
  if (value === "" || !/^\d+(\.\d+)?$/.test(value)) {
    errors.push(`Row ${rowNumber}: ${label} must be zero or greater.`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push(`Row ${rowNumber}: ${label} must be zero or greater.`);
    return null;
  }
  return parsed;
}

function parseSoldAt(value, rowNumber, errors) {
  const candidates = getTimestampCandidates(value);
  if (candidates.length === 0) {
    errors.push(`Row ${rowNumber}: sold_at must be a valid timestamp.`);
    return null;
  }
  return candidates[0].iso;
}

function getTimestampCandidates(value) {
  const trimmed = value.trim();
  const candidates = [];
  const addCandidate = (input, label) => {
    const date = new Date(input);
    if (!Number.isNaN(date.getTime())) {
      const epochMs = date.getTime();
      if (!candidates.some((candidate) => candidate.epochMs === epochMs)) {
        candidates.push({ label, epochMs, iso: date.toISOString() });
      }
    }
  };

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    addCandidate(`${trimmed.replace(" ", "T")}+03:00`, "africa_dar_es_salaam");
    addCandidate(`${trimmed.replace(" ", "T")}Z`, "utc_wall_clock");
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    addCandidate(`${trimmed}+03:00`, "africa_dar_es_salaam");
    addCandidate(`${trimmed}Z`, "utc_wall_clock");
  } else {
    addCandidate(trimmed, "explicit");
  }
  return candidates;
}

function pricesEqual(left, right) {
  return Math.abs(Number(left) - Number(right)) <= MONEY_TOLERANCE;
}

function resolveDefaultPrice(product, sellType) {
  const unitsPerPack = Number(product.units_per_pack);
  if (sellType === "PACK") {
    if (product.default_pack_price != null) return Number(product.default_pack_price);
    if (product.default_unit_price != null && unitsPerPack > 0) return Number(product.default_unit_price) * unitsPerPack;
    return null;
  }
  if (product.default_unit_price != null) return Number(product.default_unit_price);
  if (product.default_pack_price != null && unitsPerPack > 0) return Number(product.default_pack_price) / unitsPerPack;
  return null;
}

function normalizeMoney(value) {
  return Math.round(Number(value) * 100);
}

function normalizeInteger(value) {
  return Number.parseInt(String(value), 10);
}

function timestampMatches(existingCreatedAt, candidates) {
  const existingTime = new Date(existingCreatedAt).getTime();
  return candidates.some((candidate) => Math.abs(existingTime - candidate.epochMs) < 1000);
}

function findDuplicateSale(existingSales, usedSaleIds, candidate) {
  return existingSales.find((sale) => {
    if (usedSaleIds.has(sale.id)) return false;
    if (sale.pharmacy_id !== candidate.pharmacy_id) return false;
    if (sale.product_id !== candidate.product_id) return false;
    if (sale.sell_type !== candidate.sell_type) return false;
    if (normalizeInteger(sale.quantity_entered) !== candidate.quantity_entered) return false;
    if (normalizeInteger(sale.units_sold) !== candidate.units_sold) return false;
    if (normalizeMoney(sale.effective_price) !== normalizeMoney(candidate.effective_price)) return false;
    return timestampMatches(sale.created_at, candidate.timestampCandidates);
  });
}

function explainDuplicateMiss(existingSales, candidate) {
  const sameProduct = existingSales.filter((sale) => sale.product_id === candidate.product_id);
  if (sameProduct.length === 0) return "no existing sale for product in CSV date range";
  const sameType = sameProduct.filter((sale) => sale.sell_type === candidate.sell_type);
  if (sameType.length === 0) return "product exists in sales history, but sell_type differs";
  const sameQuantity = sameType.filter(
    (sale) =>
      normalizeInteger(sale.quantity_entered) === candidate.quantity_entered &&
      normalizeInteger(sale.units_sold) === candidate.units_sold,
  );
  if (sameQuantity.length === 0) return "product and sell_type match, but quantity or units_sold differs";
  const samePrice = sameQuantity.filter((sale) => normalizeMoney(sale.effective_price) === normalizeMoney(candidate.effective_price));
  if (samePrice.length === 0) return "product, sell_type and quantity match, but final/effective price differs";
  return "product, sell_type, quantity and price match, but timestamp differs";
}

function formatMoney(value) {
  return Number(value).toFixed(2);
}

function summarizeStockLedger(entries) {
  return entries
    .map(
      (entry) =>
        `  Row ${entry.rowNumber}: ${entry.productName} / ${entry.batchNumber} - available ${entry.availableStock}, requested ${entry.requestedUnits}, remaining ${entry.remainingStock}`,
    )
    .join("\n");
}

function findStaffByUsername(staffRows, username) {
  const normalized = username.trim().toLowerCase();
  return staffRows.filter((staff) => String(staff.username || "").trim().toLowerCase() === normalized);
}

async function fetchAll(query, label) {
  const result = await query;
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  return result.data || [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const filePath = path.resolve(process.cwd(), args.file);
  const { headers, records } = parseCsv(readFileSync(filePath, "utf8"));
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`CSV is missing required columns: ${missingColumns.join(", ")}`);
  }

  const timestampWindow = records.flatMap((record) => getTimestampCandidates(record.sold_at).map((candidate) => candidate.epochMs));
  const earliestCsvTime = timestampWindow.length > 0 ? Math.min(...timestampWindow) - 24 * 60 * 60 * 1000 : null;
  const latestCsvTime = timestampWindow.length > 0 ? Math.max(...timestampWindow) + 24 * 60 * 60 * 1000 : null;

  const pharmacies = await fetchAll(
    supabase.from("pharmacies").select("id, pharmacy_name").eq("pharmacy_name", args.pharmacy),
    "Pharmacy lookup",
  );
  if (pharmacies.length === 0) throw new Error(`No pharmacy found with exact name: ${args.pharmacy}`);
  if (pharmacies.length > 1) throw new Error(`More than one pharmacy found with exact name: ${args.pharmacy}`);
  const pharmacy = pharmacies[0];

  const staffRows = await fetchAll(
    supabase
      .from("pharmacy_users")
      .select("id, full_name, username, role, active")
      .eq("pharmacy_id", pharmacy.id),
    "Staff lookup",
  );
  const activeOwners = staffRows.filter((staff) => staff.role === "OWNER" && staff.active === true);
  if (activeOwners.length !== 1) {
    throw new Error(`Expected exactly one active OWNER staff account for ${args.pharmacy}; found ${activeOwners.length}.`);
  }
  const owner = activeOwners[0];
  let defaultStaff = owner;
  if (args.staff) {
    const matchingStaff = findStaffByUsername(staffRows, args.staff);
    if (matchingStaff.length !== 1) {
      throw new Error(`Expected exactly one staff account matching username "${args.staff}" within ${args.pharmacy}; found ${matchingStaff.length}.`);
    }
    if (!matchingStaff[0].active) {
      throw new Error(`Staff account "${matchingStaff[0].username}" is inactive.`);
    }
    defaultStaff = matchingStaff[0];
  }

  const products = await fetchAll(
    supabase
      .from("product_stock_summary")
      .select("id, product_name, selling_mode, units_per_pack, default_unit_price, default_pack_price, available_stock")
      .eq("pharmacy_id", pharmacy.id),
    "Product lookup",
  );
  const productsByName = new Map(products.map((product) => [product.product_name, product]));

  const batches = await fetchAll(
    supabase
      .from("inventory_batches")
      .select("id, product_id, batch_number, total_units_received, units_per_pack, expiry_date")
      .eq("pharmacy_id", pharmacy.id),
    "Batch lookup",
  );
  const batchesByNumber = new Map();
  for (const batch of batches) {
    const key = batch.batch_number;
    const existing = batchesByNumber.get(key) || [];
    existing.push(batch);
    batchesByNumber.set(key, existing);
  }

  let existingSalesQuery = supabase
      .from("sales")
    .select("id, pharmacy_id, product_id, created_at, sell_type, quantity_entered, units_sold, effective_price")
    .eq("pharmacy_id", pharmacy.id);
  if (earliestCsvTime != null) {
    existingSalesQuery = existingSalesQuery.gte("created_at", new Date(earliestCsvTime).toISOString());
  }
  if (latestCsvTime != null) {
    existingSalesQuery = existingSalesQuery.lte("created_at", new Date(latestCsvTime).toISOString());
  }
  const existingSales = await fetchAll(
    existingSalesQuery,
    "Existing sales lookup",
  );
  const usedExistingSaleIds = new Set();

  const errors = [];
  const missingProducts = [];
  const missingBatches = [];
  const duplicateRows = [];
  const duplicateMisses = [];
  const validRows = [];
  const resolvedProductIds = new Set();
  const resolvedBatchIds = new Set();
  const batchAvailable = new Map(batches.map((batch) => [batch.id, Number(batch.total_units_received)]));
  const productAvailable = new Map(products.map((product) => [product.id, Number(product.available_stock)]));

  const sortedRecords = [...records].sort((left, right) => {
    const leftDate = new Date((left.sold_at || "").replace(" ", "T")).getTime();
    const rightDate = new Date((right.sold_at || "").replace(" ", "T")).getTime();
    return leftDate - rightDate || left.rowNumber - right.rowNumber;
  });

  for (const record of sortedRecords) {
    const rowErrors = [];
    const product = productsByName.get(record.product_name);
    if (!product) {
      missingProducts.push({ rowNumber: record.rowNumber, productName: record.product_name });
      rowErrors.push(`Row ${record.rowNumber}: missing product "${record.product_name}".`);
    }

    const matchingBatches = batchesByNumber.get(record.batch_number) || [];
    let batch = null;
    if (matchingBatches.length !== 1) {
      missingBatches.push({ rowNumber: record.rowNumber, batchNumber: record.batch_number, matches: matchingBatches.length });
      rowErrors.push(
        `Row ${record.rowNumber}: batch "${record.batch_number}" resolved to ${matchingBatches.length} records; expected exactly one.`,
      );
    } else {
      batch = matchingBatches[0];
    }

    if (product && batch && batch.product_id !== product.id) {
      rowErrors.push(`Row ${record.rowNumber}: batch "${record.batch_number}" does not belong to "${record.product_name}".`);
    }
    if (product) resolvedProductIds.add(product.id);
    if (batch) resolvedBatchIds.add(batch.id);

    const staffUsername = record.staff_username.trim();
    let rowStaff = null;
    if (staffUsername.toLowerCase() === "owner") {
      rowStaff = owner;
    } else {
      const matchingStaff = findStaffByUsername(staffRows, staffUsername);
      if (matchingStaff.length !== 1) {
        rowErrors.push(`Row ${record.rowNumber}: staff_username "${record.staff_username}" did not resolve to exactly one staff account.`);
      } else if (!matchingStaff[0].active) {
        rowErrors.push(`Row ${record.rowNumber}: staff account "${matchingStaff[0].username}" is inactive.`);
      } else {
        rowStaff = matchingStaff[0];
      }
    }
    if (rowStaff && args.staff && rowStaff.id !== defaultStaff.id) {
      rowErrors.push(`Row ${record.rowNumber}: staff_username resolves to "${rowStaff.username}", but --staff resolved to "${defaultStaff.username}".`);
    }

    const sellType = record.sell_type.toUpperCase();
    if (!SELL_TYPES.has(sellType)) {
      rowErrors.push(`Row ${record.rowNumber}: sell_type must be UNIT or PACK.`);
    }

    if (product && SELL_TYPES.has(sellType)) {
      if (product.selling_mode === "UNIT" && sellType !== "UNIT") {
        rowErrors.push(`Row ${record.rowNumber}: product "${record.product_name}" can only be sold by UNIT.`);
      }
      if (product.selling_mode === "PACK" && sellType !== "PACK") {
        rowErrors.push(`Row ${record.rowNumber}: product "${record.product_name}" can only be sold by PACK.`);
      }
    }

    const quantity = parseInteger(record.quantity, "quantity", record.rowNumber, rowErrors);
    const expectedPrice = parseMoney(record.expected_price, "expected_price", record.rowNumber, rowErrors);
    const finalPrice = parseMoney(record.final_price, "final_price", record.rowNumber, rowErrors);
    const totalAmount = parseMoney(record.total_amount, "total_amount", record.rowNumber, rowErrors);
    const createdAt = parseSoldAt(record.sold_at, record.rowNumber, rowErrors);

    if (quantity != null && finalPrice != null && totalAmount != null && !pricesEqual(totalAmount, quantity * finalPrice)) {
      rowErrors.push(
        `Row ${record.rowNumber}: total_amount ${record.total_amount} does not equal quantity ${quantity} x final_price ${record.final_price}.`,
      );
    }

    if (product && SELL_TYPES.has(sellType) && expectedPrice != null) {
      const appDefaultPrice = resolveDefaultPrice(product, sellType);
      if (appDefaultPrice == null) {
        rowErrors.push(`Row ${record.rowNumber}: product "${record.product_name}" does not have a resolvable ${sellType} price.`);
      } else if (!pricesEqual(expectedPrice, appDefaultPrice)) {
        rowErrors.push(
          `Row ${record.rowNumber}: expected_price ${record.expected_price} does not match app default ${formatMoney(appDefaultPrice)}.`,
        );
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    const unitsPerPack = Number(product.units_per_pack);
    const unitsSold = sellType === "PACK" ? quantity * unitsPerPack : quantity;
    const overridePrice = pricesEqual(finalPrice, expectedPrice) ? null : finalPrice;
    const salePayload = {
      pharmacy_id: pharmacy.id,
      product_id: product.id,
      sell_type: sellType,
      quantity_entered: quantity,
      units_sold: unitsSold,
      quantity_sold: unitsSold,
      default_price: expectedPrice,
      override_price: overridePrice,
      effective_price: finalPrice,
      final_selling_price: overridePrice,
      created_at: createdAt,
    };

    const duplicateCandidate = {
      ...salePayload,
      timestampCandidates: getTimestampCandidates(record.sold_at),
    };
    const duplicateSale = findDuplicateSale(existingSales, usedExistingSaleIds, duplicateCandidate);
    if (duplicateSale) {
      usedExistingSaleIds.add(duplicateSale.id);
      duplicateRows.push({
        rowNumber: record.rowNumber,
        productName: product.product_name,
        batchNumber: batch.batch_number,
        unitsSold,
        batchId: batch.id,
      });
      continue;
    }
    duplicateMisses.push({
      rowNumber: record.rowNumber,
      productName: product.product_name,
      reason: explainDuplicateMiss(existingSales, duplicateCandidate),
    });

    validRows.push({
      record,
      product,
      batch,
      staff: rowStaff || defaultStaff,
      salePayload,
      unitsSold,
      isOverride: overridePrice !== null,
      overrideReason: record.override_reason || null,
      notes: record.notes || null,
    });
  }

  const stockErrors = [];
  const stockLedger = [];
  for (const duplicate of duplicateRows) {
    batchAvailable.set(duplicate.batchId, (batchAvailable.get(duplicate.batchId) ?? 0) - duplicate.unitsSold);
  }
  for (const row of validRows) {
    const currentBatchStock = batchAvailable.get(row.batch.id) ?? 0;
    const currentProductStock = productAvailable.get(row.product.id) ?? 0;
    const batchRemaining = currentBatchStock - row.unitsSold;
    const productRemaining = currentProductStock - row.unitsSold;

    stockLedger.push({
      rowNumber: row.record.rowNumber,
      productName: row.product.product_name,
      batchNumber: row.batch.batch_number,
      availableStock: currentBatchStock,
      requestedUnits: row.unitsSold,
      remainingStock: batchRemaining,
    });

    if (batchRemaining < 0) {
      stockErrors.push(
        `Row ${row.record.rowNumber}: batch "${row.batch.batch_number}" would go negative (${currentBatchStock} available, ${row.unitsSold} requested).`,
      );
    }
    if (productRemaining < 0) {
      stockErrors.push(
        `Row ${row.record.rowNumber}: product "${row.product.product_name}" would go negative (${currentProductStock} available, ${row.unitsSold} requested).`,
      );
    }

    batchAvailable.set(row.batch.id, batchRemaining);
    productAvailable.set(row.product.id, productRemaining);
  }

  const normalSales = validRows.filter((row) => !row.isOverride).length;
  const priceOverrides = validRows.filter((row) => row.isOverride).length;
  const projectedRevenue = validRows.reduce((sum, row) => sum + row.salePayload.quantity_entered * row.salePayload.effective_price, 0);
  const projectedUnits = validRows.reduce((sum, row) => sum + row.unitsSold, 0);

  console.log(`Mode: ${args.apply ? "APPLY" : "DRY RUN"}`);
  console.log(`CSV rows read: ${records.length}`);
  console.log(`Resolved pharmacy: ${pharmacy.pharmacy_name} (${pharmacy.id})`);
  console.log(`Products resolved: ${resolvedProductIds.size}`);
  console.log(`Batches resolved: ${resolvedBatchIds.size}`);
  console.log(`Staff account resolved: ${defaultStaff.username} / ${defaultStaff.role} (${defaultStaff.id})`);
  console.log(`Valid rows: ${validRows.length}`);
  console.log(`New rows to insert: ${validRows.length}`);
  console.log(`Missing products: ${missingProducts.length}`);
  console.log(`Missing batches: ${missingBatches.length}`);
  console.log(`Stock errors: ${stockErrors.length}`);
  console.log(`Duplicates: ${duplicateRows.length}`);
  console.log(`Normal sales: ${normalSales}`);
  console.log(`Price overrides: ${priceOverrides}`);
  console.log(`Projected new revenue: ${formatMoney(projectedRevenue)}`);
  console.log(`Projected new units deducted: ${projectedUnits}`);
  if (duplicateMisses.length > 0) {
    console.log("Duplicate miss explanations:");
    for (const miss of duplicateMisses) {
      console.log(`  Row ${miss.rowNumber}: ${miss.productName} - ${miss.reason}.`);
    }
  }
  console.log("Stock simulation:");
  console.log(stockLedger.length > 0 ? summarizeStockLedger(stockLedger) : "  No new rows to simulate.");

  if (errors.length > 0 || stockErrors.length > 0) {
    console.error("Validation failed:");
    for (const error of [...errors, ...stockErrors]) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  if (!args.apply) {
    console.log("Dry run passed. No rows inserted.");
    return;
  }

  if (validRows.length === 0) {
    console.log(`Inserted sales: 0`);
    console.log(`Skipped duplicates: ${duplicateRows.length}`);
    return;
  }

  const insertResult = await supabase.from("sales").insert(validRows.map((row) => row.salePayload)).select("id, product_id, total_sale");
  if (insertResult.error) {
    throw new Error(`Sales insert failed: ${insertResult.error.message}`);
  }

  const activityRows = insertResult.data.map((sale, index) => {
    const row = validRows[index];
    return {
      pharmacy_id: pharmacy.id,
      actor_user_id: row.staff.id,
      actor_name: row.staff.full_name,
      actor_role: row.staff.role,
      action: "SALE_CREATED",
      entity_type: "sale",
      entity_id: sale.id,
      description: `Recorded a ${row.salePayload.sell_type.toLowerCase()} sale of ${row.salePayload.quantity_entered}.`,
      metadata: {
        product_id: row.product.id,
        units_sold: row.unitsSold,
        total_sale: sale.total_sale,
        price_overridden: row.isOverride,
        historical_seed: true,
        batch_number: row.batch.batch_number,
        override_reason: row.overrideReason,
        notes: row.notes,
      },
      created_at: row.salePayload.created_at,
    };
  });

  const activityResult = await supabase.from("activity_logs").insert(activityRows);
  if (activityResult.error) {
    throw new Error(`Activity log insert failed after sales insert: ${activityResult.error.message}`);
  }

  console.log(`Inserted sales: ${insertResult.data.length}`);
  console.log(`Skipped duplicates: ${duplicateRows.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unexpected seed failure.");
  process.exitCode = 1;
});
