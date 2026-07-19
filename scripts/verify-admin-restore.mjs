import assert from "node:assert";
import { createHash } from "node:crypto";

const backupFormat = "pharmastock-backup";
const backupSchemaVersion = 1;

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checksum(payload) {
  return createHash("sha256").update(stableStringify(JSON.parse(JSON.stringify(payload)))).digest("hex");
}

function makeBackup(pharmacyId = "pharmacy-1") {
  const payload = {
    format: backupFormat,
    schema_version: backupSchemaVersion,
    generated_at: "2026-07-19T12:00:00.000Z",
    app_version: "0.1.0",
    pharmacy: { id: pharmacyId, pharmacy_name: "Demo Pharmacy" },
    record_counts: {
      pharmacy_settings: 1,
      products: 2,
      inventory_batches: 1,
      sales: 1,
      expenses: 1,
      staff: 1,
      activity_logs: 1,
    },
    datasets: {
      pharmacy_settings: { id: "settings-1", pharmacy_id: pharmacyId, receipt_header: "Demo Pharmacy" },
      products: [
        { id: "product-1", pharmacy_id: pharmacyId, product_name: "Existing Name" },
        { id: "product-2", pharmacy_id: pharmacyId, product_name: "New Product" },
      ],
      inventory_batches: [{ id: "batch-1", pharmacy_id: pharmacyId, product_id: "product-2" }],
      sales: [{ id: "sale-1", pharmacy_id: pharmacyId, product_id: "product-2" }],
      expenses: [{ id: "expense-1", pharmacy_id: pharmacyId, created_by: "missing-staff" }],
      staff: [{ id: "staff-1", pharmacy_id: pharmacyId, username: "owner" }],
      activity_logs: [{ id: "activity-1", pharmacy_id: pharmacyId }],
    },
  };

  return { ...payload, checksum: checksum(payload) };
}

function validate(backup, targetPharmacyId) {
  const { checksum: expected, ...payload } = backup;
  const counts = backup.record_counts || {};
  const datasets = backup.datasets || {};
  const required = ["pharmacy_settings", "products", "inventory_batches", "sales", "expenses", "staff", "activity_logs"];
  const errors = [];

  if (backup.format !== backupFormat) errors.push("format");
  if (backup.schema_version !== backupSchemaVersion) errors.push("schema");
  if (backup.pharmacy?.id !== targetPharmacyId) errors.push("pharmacy");
  if (expected !== checksum(payload)) errors.push("checksum");
  for (const name of required) {
    if (!(name in datasets)) errors.push(`missing:${name}`);
    const actual = Array.isArray(datasets[name]) ? datasets[name].length : datasets[name] ? 1 : 0;
    if (counts[name] !== actual) errors.push(`count:${name}`);
  }

  return { valid: errors.length === 0, errors };
}

function restoreMergeOnly(database, backup, options = {}) {
  const next = structuredClone(database);
  const restored = { pharmacy_settings: 0, products: 0, inventory_batches: 0, sales: 0, expenses: 0 };
  const skipped = { pharmacy_settings: 0, products: 0, inventory_batches: 0, sales: 0, expenses: 0, staff: backup.datasets.staff.length, activity_logs: backup.datasets.activity_logs.length };

  const insertMissing = (name, rows) => {
    for (const row of rows) {
      if (next[name].some((existing) => existing.id === row.id)) {
        skipped[name] += 1;
      } else {
        next[name].push({ ...row, created_by: name === "expenses" ? null : row.created_by });
        restored[name] += 1;
      }
    }
    if (options.failAfter === name) throw new Error(`forced failure after ${name}`);
  };

  if (next.pharmacy_settings) skipped.pharmacy_settings = 1;
  else {
    next.pharmacy_settings = backup.datasets.pharmacy_settings;
    restored.pharmacy_settings = 1;
  }
  if (options.failAfter === "pharmacy_settings") throw new Error("forced failure after pharmacy_settings");

  insertMissing("products", backup.datasets.products);
  insertMissing("inventory_batches", backup.datasets.inventory_batches);
  insertMissing("sales", backup.datasets.sales);
  insertMissing("expenses", backup.datasets.expenses);

  return { database: next, restored, skipped };
}

function restoreTransaction(database, backup, options) {
  const snapshot = structuredClone(database);
  try {
    return restoreMergeOnly(snapshot, backup, options);
  } catch (error) {
    return { database, error };
  }
}

const backup = makeBackup();
const initialDatabase = {
  pharmacy_settings: { id: "settings-current", receipt_header: "Current Header" },
  products: [{ id: "product-1", pharmacy_id: "pharmacy-1", product_name: "Current Name" }],
  inventory_batches: [],
  sales: [],
  expenses: [],
};

assert.strictEqual(validate(backup, "pharmacy-1").valid, true);

const modified = structuredClone(backup);
modified.datasets.products[0].product_name = "Tampered";
assert.strictEqual(validate(modified, "pharmacy-1").valid, false);

const wrongPharmacy = makeBackup("pharmacy-2");
assert.strictEqual(validate(wrongPharmacy, "pharmacy-1").valid, false);

const first = restoreTransaction(initialDatabase, backup);
assert.deepStrictEqual(first.restored, { pharmacy_settings: 0, products: 1, inventory_batches: 1, sales: 1, expenses: 1 });
assert.strictEqual(first.database.products.find((product) => product.id === "product-1").product_name, "Current Name");
assert.strictEqual(first.database.expenses[0].created_by, null);

const second = restoreTransaction(first.database, backup);
assert.deepStrictEqual(second.restored, { pharmacy_settings: 0, products: 0, inventory_batches: 0, sales: 0, expenses: 0 });

const failed = restoreTransaction(initialDatabase, backup, { failAfter: "products" });
assert.ok(failed.error);
assert.deepStrictEqual(failed.database, initialDatabase);

console.log("Admin restore verification passed.");
