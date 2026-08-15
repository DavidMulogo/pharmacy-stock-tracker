#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// name, unit selling price, pack selling price, reorder units, opening packs, buying cost/pack, second batch
const INVENTORY = [
  ["Paracetamol 500 mg Tablets", 200, 2000, 50, 28, 1200, true],
  ["Paracetamol 120 mg/5 mL Oral Suspension", null, 3500, 5, 12, 2200, true],
  ["Ibuprofen 400 mg Tablets", 300, 3000, 40, 18, 1900, true],
  ["Diclofenac 50 mg Tablets", 300, 3000, 40, 16, 1850, true],
  ["Diclofenac 1% Gel", null, 6000, 4, 8, 3800, false],
  ["Aspirin 75 mg Tablets", 200, 5000, 30, 8, 3100, false],
  ["Amoxicillin 500 mg Capsules", 600, 6000, 40, 22, 3900, true],
  ["Amoxicillin 250 mg/5 mL Oral Suspension", null, 6500, 5, 10, 4200, true],
  ["Amoxicillin Clavulanate 625 mg Tablets", 1200, 16800, 28, 9, 11000, true],
  ["Flucloxacillin 500 mg Capsules", 600, 6000, 30, 12, 3900, false],
  ["Cefalexin 500 mg Capsules", 700, 7000, 30, 10, 4600, false],
  ["Cefuroxime 500 mg Tablets", 1500, 15000, 20, 7, 10000, false],
  ["Cefixime 200 mg Tablets", 1400, 14000, 20, 6, 9200, false],
  ["Ceftriaxone 1 g Injection", 2500, 25000, 10, 5, 16500, false],
  ["Azithromycin 500 mg Tablets", 3500, 10500, 9, 12, 7000, true],
  ["Ciprofloxacin 500 mg Tablets", 500, 5000, 30, 14, 3200, true],
  ["Metronidazole 400 mg Tablets", 300, 3000, 40, 18, 1800, true],
  ["Doxycycline 100 mg Capsules", 400, 4000, 30, 11, 2500, false],
  ["Co-trimoxazole 480 mg Tablets", 300, 3000, 30, 10, 1800, false],
  ["Nitrofurantoin 100 mg Tablets", 700, 9800, 28, 7, 6400, false],
  ["Artemether Lumefantrine 20/120 mg Tablets 6s", null, 2500, 6, 12, 1500, false],
  ["Artemether Lumefantrine 20/120 mg Tablets 12s", null, 3500, 12, 10, 2200, false],
  ["Artemether Lumefantrine 20/120 mg Tablets 18s", null, 4500, 18, 10, 2900, false],
  ["Artemether Lumefantrine 20/120 mg Tablets 24s", null, 5500, 24, 14, 3500, true],
  ["Albendazole 400 mg Tablets", null, 1500, 5, 20, 850, true],
  ["Mebendazole 100 mg Tablets", null, 2500, 6, 10, 1500, false],
  ["Cetirizine 10 mg Tablets", 300, 3000, 30, 14, 1800, true],
  ["Loratadine 10 mg Tablets", 500, 5000, 20, 8, 3200, false],
  ["Chlorpheniramine 4 mg Tablets", 200, 2000, 30, 12, 1150, false],
  ["Cetirizine 5 mg/5 mL Syrup", null, 5000, 5, 8, 3100, false],
  ["Salbutamol 100 mcg Inhaler", null, 12000, 4, 8, 7800, true],
  ["Salbutamol 2.5 mg/2.5 mL Nebules", 1000, 20000, 20, 5, 13000, false],
  ["Dextromethorphan Cough Syrup", null, 5000, 5, 10, 3000, false],
  ["Saline Nasal Drops 10 mL", null, 3000, 4, 8, 1700, false],
  ["Omeprazole 20 mg Capsules", 500, 7000, 28, 14, 4500, true],
  ["Pantoprazole 40 mg Tablets", 700, 9800, 28, 8, 6200, false],
  ["Magnesium Trisilicate Mixture", null, 4500, 5, 8, 2700, false],
  ["Hyoscine Butylbromide 10 mg Tablets", 500, 5000, 20, 8, 3100, false],
  ["Loperamide 2 mg Capsules", 300, 3000, 20, 8, 1700, false],
  ["ORS Sachets", 1000, 20000, 20, 8, 12500, true],
  ["Zinc Sulfate 20 mg Dispersible Tablets", 500, 5000, 20, 8, 3000, false],
  ["Metoclopramide 10 mg Tablets", 300, 3000, 20, 7, 1800, false],
  ["Amlodipine 5 mg Tablets", 300, 9000, 60, 7, 5700, true],
  ["Amlodipine 10 mg Tablets", 500, 15000, 60, 6, 9500, false],
  ["Losartan 50 mg Tablets", 500, 15000, 60, 6, 9800, true],
  ["Hydrochlorothiazide 25 mg Tablets", 300, 9000, 60, 5, 5500, false],
  ["Furosemide 40 mg Tablets", 300, 9000, 30, 4, 5600, false],
  ["Atorvastatin 20 mg Tablets", 600, 18000, 60, 5, 11500, false],
  ["Metformin 500 mg Tablets", 300, 3000, 60, 16, 1800, true],
  ["Glibenclamide 5 mg Tablets", 300, 9000, 60, 5, 5500, false],
  ["Hydrocortisone 1% Cream", null, 5000, 5, 10, 3000, true],
  ["Clotrimazole 1% Cream", null, 5000, 5, 12, 2900, true],
  ["Ketoconazole 2% Cream", null, 7000, 5, 7, 4500, false],
  ["Calamine Lotion", null, 4000, 4, 7, 2400, false],
  ["Povidone Iodine 10% Solution", null, 5000, 4, 8, 3000, false],
  ["Chloramphenicol 0.5% Eye Drops", null, 4000, 4, 8, 2400, false],
  ["Ciprofloxacin 0.3% Eye Drops", null, 6000, 4, 7, 3700, false],
  ["Artificial Tears Eye Drops", null, 7000, 4, 7, 4300, false],
  ["Ferrous Sulfate Folic Acid Tablets", 300, 9000, 30, 6, 5500, false],
  ["Vitamin B Complex Tablets", 300, 3000, 20, 8, 1800, false],
  ["Vitamin C 500 mg Tablets", 400, 4000, 20, 8, 2400, false],
  ["Levonorgestrel 1.5 mg Emergency Contraceptive", null, 5000, 3, 8, 3000, false],
  ["Clotrimazole 500 mg Vaginal Tablet", null, 5000, 3, 7, 3000, false],
  ["Pregnancy Test Strip", 1500, 75000, 10, 2, 45000, false],
  ["Disposable Syringe 5 mL", 500, 50000, 30, 2, 30000, false],
  ["Examination Gloves Medium", 500, 25000, 30, 3, 15500, false],
  ["Cotton Wool 100 g", null, 3000, 4, 8, 1700, false],
  ["Digital Thermometer", null, 10000, 3, 5, 6500, false],
];

function parseArgs(argv) {
  const values = { apply: false, code: "ZNZ-PILOT-01" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--apply") values.apply = true;
    else if (argv[index] === "--code") values.code = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!String(values.code || "").trim()) throw new Error("Pharmacy code cannot be blank.");
  return values;
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

async function expectData(promise, label) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const batchCount = INVENTORY.reduce((count, item) => count + (item[6] ? 2 : 1), 0);
  console.log(`Target pharmacy code: ${args.code}`);
  console.log(`Planned products: ${INVENTORY.length}; planned opening batches: ${batchCount}`);
  console.log("Includes common retail medicines, varied quantities, buying costs, selling prices, and expiry dates.");
  if (!args.apply) {
    console.log("Dry run only. No database records were created. Add --apply to proceed.");
    return;
  }

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const access = await expectData(
    supabase.from("pharmacy_access").select("pharmacy_id").ilike("pharmacy_code", args.code).limit(1).maybeSingle(),
    "Find pilot pharmacy",
  );
  if (!access?.pharmacy_id) throw new Error("No pharmacy matches that code.");
  const pharmacyId = access.pharmacy_id;
  const countResult = await supabase.from("products").select("id", { count: "exact", head: true }).eq("pharmacy_id", pharmacyId);
  if (countResult.error) throw new Error(`Check existing products: ${countResult.error.message}`);
  if ((countResult.count || 0) > 0) throw new Error("This pharmacy already has products. Nothing was added; the pilot inventory loader only runs on an empty catalogue.");

  const names = INVENTORY.map((item) => item[0]);
  const masters = await expectData(supabase.from("master_medicines").select("*").in("product_name", names).eq("active", true), "Load master catalogue");
  if (masters.length !== names.length) {
    const found = new Set(masters.map((medicine) => medicine.product_name));
    throw new Error(`Master catalogue is missing: ${names.filter((name) => !found.has(name)).join(", ")}`);
  }
  const masterByName = new Map(masters.map((medicine) => [medicine.product_name, medicine]));

  let createdProductIds = [];
  try {
    const productsPayload = INVENTORY.map(([name, unitPrice, packPrice, reorder]) => {
      const master = masterByName.get(name);
      return {
        pharmacy_id: pharmacyId,
        master_medicine_id: master.id,
        product_name: master.product_name,
        generic_name: master.generic_name,
        brand_name: master.brand_name,
        dosage_form: master.dosage_form,
        base_unit: master.base_unit,
        pack_type: master.pack_type,
        units_per_pack: master.units_per_pack,
        selling_mode: master.default_selling_mode,
        default_unit_price: unitPrice,
        default_pack_price: packPrice,
        default_selling_price: unitPrice ?? packPrice / master.units_per_pack,
        reorder_level: reorder,
      };
    });
    const products = await expectData(supabase.from("products").insert(productsPayload).select("*"), "Create pilot products");
    createdProductIds = products.map((product) => product.id);
    const configByName = new Map(INVENTORY.map((item) => [item[0], item]));
    const today = new Date();
    const batches = products.flatMap((product, index) => {
      const [, , , , packs, packCost, secondBatch] = configByName.get(product.product_name);
      const nearExpiry = index === 26;
      const first = {
        pharmacy_id: pharmacyId,
        product_id: product.id,
        batch_number: `ZNZ-${String(index + 1).padStart(3, "0")}-A`,
        expiry_date: addDays(today, nearExpiry ? 45 : 210 + (index % 9) * 25),
        packs_received: packs,
        units_per_pack: product.units_per_pack,
        buying_price: packCost,
        buying_price_per_pack: packCost,
      };
      if (!secondBatch) return [first];
      return [first, {
        ...first,
        batch_number: `ZNZ-${String(index + 1).padStart(3, "0")}-B`,
        expiry_date: addDays(today, 480 + (index % 7) * 30),
        packs_received: Math.max(3, Math.round(packs * 0.6)),
        buying_price: Math.round(packCost * 1.06),
        buying_price_per_pack: Math.round(packCost * 1.06),
      }];
    });
    await expectData(supabase.from("inventory_batches").insert(batches), "Create pilot opening batches");
    console.log(`Pilot inventory created successfully: ${products.length} products and ${batches.length} batches.`);
    console.log("No sales, expenses, corrections, or feedback were created.");
  } catch (error) {
    if (createdProductIds.length) await supabase.from("products").delete().in("id", createdProductIds);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
