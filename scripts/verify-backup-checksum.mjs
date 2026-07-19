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

function normalizeJsonSafe(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : JSON.parse(serialized);
}

function calculateBackupChecksum(payload) {
  return createHash("sha256").update(stableStringify(normalizeJsonSafe(payload))).digest("hex");
}

function validateBackup(input, expectedPharmacy) {
  const { checksum, ...payload } = input;
  return {
    valid:
      input.format === backupFormat &&
      input.schema_version === backupSchemaVersion &&
      input.pharmacy.id === expectedPharmacy.id &&
      checksum === calculateBackupChecksum(payload),
  };
}

const payload = {
  format: backupFormat,
  schema_version: backupSchemaVersion,
  generated_at: "2026-07-19T10:34:32.39386Z",
  app_version: "0.1.0",
  pharmacy: {
    id: "pharmacy-1",
    pharmacy_name: "Demo Pharmacy",
    owner_name: "Owner",
    phone: "255700000000",
    plan: "TRIAL",
    status: "TRIAL",
    trial_ends_at: null,
    subscription_ends_at: null,
    archived_at: undefined,
    created_at: "2026-07-19T00:00:00.000Z",
  },
  record_counts: {
    pharmacy_settings: 0,
    products: 1,
    inventory_batches: 0,
    sales: 0,
    expenses: 0,
    staff: 0,
    activity_logs: 0,
  },
  datasets: {
    pharmacy_settings: null,
    products: [{ id: "product-1", tags: ["a", undefined, "c"] }],
    inventory_batches: [],
    sales: [],
    expenses: [],
    staff: [],
    activity_logs: [],
  },
};
const backup = {
  ...payload,
  checksum: calculateBackupChecksum(payload),
};
const downloadedAndUploaded = JSON.parse(JSON.stringify(backup));
const whitespaceReformatted = JSON.parse(JSON.stringify(downloadedAndUploaded, null, 6));
const tampered = JSON.parse(JSON.stringify(downloadedAndUploaded));
tampered.datasets.products[0].id = "product-2";

assert.strictEqual(validateBackup(downloadedAndUploaded, { id: "pharmacy-1" }).valid, true);
assert.strictEqual(validateBackup(tampered, { id: "pharmacy-1" }).valid, false);
assert.strictEqual(validateBackup(whitespaceReformatted, { id: "pharmacy-1" }).valid, true);

console.log("Backup checksum verification passed.");
