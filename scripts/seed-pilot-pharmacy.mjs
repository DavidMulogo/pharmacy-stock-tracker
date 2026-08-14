#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const PRODUCT_CONFIG = [
  ["Paracetamol 500 mg Tablets", 200, 2000, 50],
  ["Paracetamol 120 mg/5 mL Oral Suspension", null, 3500, 5],
  ["Amoxicillin 500 mg Capsules", 500, 5000, 30],
  ["Amoxicillin 250 mg/5 mL Oral Suspension", null, 6000, 5],
  ["Metronidazole 400 mg Tablets", 300, 3000, 30],
  ["Ciprofloxacin 500 mg Tablets", 500, 5000, 20],
  ["Azithromycin 500 mg Tablets", 3500, 10500, 9],
  ["Cetirizine 10 mg Tablets", 300, 3000, 30],
  ["Loratadine 10 mg Tablets", 500, 5000, 20],
  ["Omeprazole 20 mg Capsules", 500, 7000, 28],
  ["Diclofenac 50 mg Tablets", 300, 3000, 30],
  ["Ibuprofen 400 mg Tablets", 300, 3000, 30],
  ["ORS Sachets", 1000, 20000, 20],
  ["Zinc Sulfate 20 mg Dispersible Tablets", 500, 5000, 20],
  ["Salbutamol 100 mcg Inhaler", null, 12000, 4],
  ["Amlodipine 5 mg Tablets", 300, 9000, 30],
  ["Metformin 500 mg Tablets", 300, 3000, 30],
  ["Co-trimoxazole 480 mg Tablets", 300, 3000, 30],
  ["Hydrocortisone 1% Cream", null, 5000, 5],
  ["Clotrimazole 1% Cream", null, 5000, 5],
];

function parseArgs(argv) {
  const values = {
    apply: false,
    name: "Zanzibar Pilot Pharmacy",
    code: "ZNZ-PILOT-01",
    owner: "Pilot Pharmacy Owner",
    phone: "255700000001",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") values.apply = true;
    else if (argument === "--name") values.name = argv[++index];
    else if (argument === "--code") values.code = argv[++index];
    else if (argument === "--owner") values.owner = argv[++index];
    else if (argument === "--phone") values.phone = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }

  for (const [key, value] of Object.entries(values)) {
    if (key !== "apply" && !String(value || "").trim()) throw new Error(`${key} cannot be blank.`);
  }
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

function temporaryPassword() {
  return `Pilot-${randomBytes(6).toString("base64url")}!7`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

async function expectData(promise, label) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function rollbackNewPilot(supabase, pharmacyId) {
  const tables = [
    "inventory_batches",
    "products",
    "pharmacy_onboarding",
    "pharmacy_settings",
    "pharmacy_users",
    "pharmacy_access",
  ];
  for (const table of tables) await supabase.from(table).delete().eq("pharmacy_id", pharmacyId);
  await supabase.from("pharmacies").delete().eq("id", pharmacyId);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const staffPlan = [
    { full_name: args.owner, username: "owner", role: "OWNER" },
    { full_name: "Pilot In-Charge", username: "incharge", role: "IN_CHARGE" },
    { full_name: "Pilot Pharmacist", username: "pharmacist", role: "PHARMACIST" },
    { full_name: "Pilot Technician One", username: "technician1", role: "TECHNICIAN" },
    { full_name: "Pilot Technician Two", username: "technician2", role: "TECHNICIAN" },
  ].map((staff) => ({ ...staff, password: temporaryPassword() }));

  console.log(`Pilot pharmacy: ${args.name}`);
  console.log(`Pharmacy code: ${args.code}`);
  console.log(`Products: ${PRODUCT_CONFIG.length}; opening batches: ${PRODUCT_CONFIG.length * 2}; staff: ${staffPlan.length}`);
  if (!args.apply) {
    console.log("Dry run only. No database records were created. Add --apply to proceed.");
    return;
  }

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const existingPharmacy = await expectData(supabase.from("pharmacies").select("id").ilike("pharmacy_name", args.name).limit(1), "Check pharmacy name");
  const existingCode = await expectData(supabase.from("pharmacy_access").select("id").ilike("pharmacy_code", args.code).limit(1), "Check pharmacy code");
  if (existingPharmacy.length || existingCode.length) throw new Error("A pharmacy with this name or code already exists. Nothing was created.");

  const now = new Date();
  const pilotEnd = addDays(now, 30);
  let pharmacyId = null;

  try {
    const pharmacy = await expectData(
      supabase.from("pharmacies").insert({
        pharmacy_name: args.name,
        owner_name: args.owner,
        phone: args.phone,
        plan: "TRIAL",
        status: "TRIAL",
        trial_ends_at: pilotEnd.toISOString(),
        pilot_started_at: now.toISOString(),
        pilot_ends_at: pilotEnd.toISOString(),
        entitlement_mode: "OBSERVE",
      }).select("*").single(),
      "Create pharmacy",
    );
    pharmacyId = pharmacy.id;

    const accessPassword = temporaryPassword();
    await expectData(supabase.from("pharmacy_access").insert({
      pharmacy_id: pharmacyId,
      pharmacy_code: args.code,
      password: accessPassword,
      password_hash: await bcrypt.hash(accessPassword, 12),
    }), "Create pharmacy access");

    const users = [];
    for (const staff of staffPlan) {
      const user = await expectData(supabase.from("pharmacy_users").insert({
        pharmacy_id: pharmacyId,
        full_name: staff.full_name,
        username: staff.username,
        password_hash: await bcrypt.hash(staff.password, 12),
        role: staff.role,
        active: true,
      }).select("id, full_name, username, role").single(), `Create ${staff.role}`);
      users.push(user);
    }

    await expectData(supabase.from("pharmacy_settings").update({
      address: "Pilot location, Zanzibar",
      region: "Zanzibar",
      district: "Urban/West",
      receipt_header: args.name,
      receipt_footer: "Thank you for choosing us.",
      receipt_prefix: "PILOT",
      receipt_paper_size: "THERMAL_80MM",
      expiry_warning_days: 90,
      allow_price_override: true,
      currency: "TZS",
      timezone: "Africa/Dar_es_Salaam",
    }).eq("pharmacy_id", pharmacyId), "Configure pharmacy settings");

    const names = PRODUCT_CONFIG.map(([name]) => name);
    const masters = await expectData(supabase.from("master_medicines").select("*").in("product_name", names).eq("active", true), "Load master medicines");
    if (masters.length !== PRODUCT_CONFIG.length) {
      const found = new Set(masters.map((medicine) => medicine.product_name));
      throw new Error(`Master catalogue is missing: ${names.filter((name) => !found.has(name)).join(", ")}`);
    }
    const masterByName = new Map(masters.map((medicine) => [medicine.product_name, medicine]));
    const productsPayload = PRODUCT_CONFIG.map(([name, unitPrice, packPrice, reorderLevel]) => {
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
        default_selling_price: unitPrice ?? packPrice / master.units_per_pack,
        selling_mode: master.default_selling_mode,
        default_unit_price: unitPrice,
        default_pack_price: packPrice,
        reorder_level: reorderLevel,
      };
    });
    const products = await expectData(supabase.from("products").insert(productsPayload).select("*"), "Create products");

    const configByName = new Map(PRODUCT_CONFIG.map((config) => [config[0], config]));
    const batches = products.flatMap((product, index) => {
      const [, , packPrice] = configByName.get(product.product_name);
      const packCost = Math.round(packPrice * 0.62);
      return [
        {
          pharmacy_id: pharmacyId,
          product_id: product.id,
          batch_number: `PILOT-${String(index + 1).padStart(3, "0")}-A`,
          expiry_date: dateOnly(addDays(now, 180 + index * 3)),
          packs_received: 12 + (index % 5) * 3,
          units_per_pack: product.units_per_pack,
          buying_price: packCost,
          buying_price_per_pack: packCost,
        },
        {
          pharmacy_id: pharmacyId,
          product_id: product.id,
          batch_number: `PILOT-${String(index + 1).padStart(3, "0")}-B`,
          expiry_date: dateOnly(addDays(now, 420 + index * 5)),
          packs_received: 8 + (index % 4) * 2,
          units_per_pack: product.units_per_pack,
          buying_price: Math.round(packPrice * 0.68),
          buying_price_per_pack: Math.round(packPrice * 0.68),
        },
      ];
    });
    await expectData(supabase.from("inventory_batches").insert(batches), "Create opening stock");

    await expectData(supabase.from("pharmacy_onboarding").upsert({
      pharmacy_id: pharmacyId,
      profile_reviewed_at: now.toISOString(),
      business_rules_reviewed_at: now.toISOString(),
      staff_reviewed_at: now.toISOString(),
      products_reviewed_at: now.toISOString(),
      opening_stock_reviewed_at: now.toISOString(),
      subscription_reviewed_at: now.toISOString(),
      completed_at: now.toISOString(),
    }, { onConflict: "pharmacy_id" }), "Complete onboarding state");

    console.log("\nPilot pharmacy created successfully. Save these temporary credentials now:\n");
    console.log(`Pharmacy code: ${args.code}`);
    for (const staff of staffPlan) console.log(`${staff.role.padEnd(11)} username=${staff.username.padEnd(12)} password=${staff.password}`);
    console.log(`\nPilot ends: ${pilotEnd.toISOString()}`);
    console.log("Fake sales, expenses, corrections, and feedback were intentionally not created.");
  } catch (error) {
    if (pharmacyId) await rollbackNewPilot(supabase, pharmacyId);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
