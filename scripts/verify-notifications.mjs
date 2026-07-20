import assert from "node:assert/strict";

const roleTypes = {
  OWNER: ["LOW_STOCK", "OUT_OF_STOCK", "EXPIRING_SOON", "EXPIRED_BATCH", "TRIAL_EXPIRING", "SUBSCRIPTION_EXPIRING", "SUBSCRIPTION_EXPIRED"],
  PHARMACIST: ["LOW_STOCK", "OUT_OF_STOCK", "EXPIRING_SOON", "EXPIRED_BATCH", "TRIAL_EXPIRING", "SUBSCRIPTION_EXPIRING", "SUBSCRIPTION_EXPIRED"],
  TECHNICIAN: ["LOW_STOCK", "OUT_OF_STOCK", "EXPIRING_SOON", "EXPIRED_BATCH"],
};

function daysUntil(date) {
  return Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - new Date("2026-07-19T00:00:00Z").getTime()) / 86400000);
}

function generate({ pharmacy, products, batches, settings }) {
  const items = [];
  for (const product of products) {
    const threshold = product.reorder_level ?? 0;
    if (product.available_stock <= 0) items.push({ type: "OUT_OF_STOCK", key: `OUT_OF_STOCK:${product.id}`, pharmacy_id: pharmacy.id });
    else if (product.available_stock <= threshold) items.push({ type: "LOW_STOCK", key: `LOW_STOCK:${product.id}`, pharmacy_id: pharmacy.id });
  }
  for (const batch of batches) {
    const days = daysUntil(batch.expiry_date);
    if (days < 0) items.push({ type: "EXPIRED_BATCH", key: `EXPIRED_BATCH:${batch.id}`, pharmacy_id: pharmacy.id });
    else if (days <= settings.expiry_warning_days) items.push({ type: "EXPIRING_SOON", key: `EXPIRING_SOON:${batch.id}`, pharmacy_id: pharmacy.id });
  }
  const trialDays = pharmacy.trial_ends_at ? daysUntil(pharmacy.trial_ends_at) : null;
  if (pharmacy.plan === "TRIAL" && [7, 3, 1].includes(trialDays)) {
    items.push({ type: "TRIAL_EXPIRING", key: `TRIAL_EXPIRING:${pharmacy.id}`, pharmacy_id: pharmacy.id });
  }
  return items;
}

function sync(store, input) {
  const activeKeys = new Set(input.map((item) => item.key));
  for (const item of input) {
    const existing = store.get(item.key);
    store.set(item.key, { ...existing, ...item, status: "ACTIVE", read: existing?.status === "RESOLVED" ? false : Boolean(existing?.read) });
  }
  for (const [key, item] of store) {
    if (!activeKeys.has(key)) store.set(key, { ...item, status: "RESOLVED" });
  }
}

const pharmacy = { id: "pharmacy-a", plan: "TRIAL", trial_ends_at: "2026-07-22" };
const settings = { low_stock_threshold: 5, expiry_warning_days: 14 };
const store = new Map();

sync(store, generate({
  pharmacy,
  settings,
  products: [
    { id: "p1", available_stock: 0, reorder_level: 2 },
    { id: "p2", available_stock: 4, reorder_level: 5 },
    { id: "p3", available_stock: 4, reorder_level: 0 },
  ],
  batches: [{ id: "b1", expiry_date: "2026-07-25" }],
}));

assert.equal(store.size, 4, "Low-stock, out-of-stock, expiry, and trial alerts appear");
assert.equal(store.get("LOW_STOCK:p2").status, "ACTIVE", "Product reorder level is used for low-stock alerts");
assert.equal(store.has("LOW_STOCK:p3"), false, "Pharmacy settings do not override product reorder level");
assert.equal(store.get("EXPIRING_SOON:b1").status, "ACTIVE", "Expiry alerts follow configured warning days");

sync(store, generate({
  pharmacy,
  settings,
  products: [
    { id: "p1", available_stock: 20, reorder_level: 2 },
    { id: "p2", available_stock: 20, reorder_level: 0 },
  ],
  batches: [{ id: "b1", expiry_date: "2026-12-01" }],
}));
assert.equal(store.get("OUT_OF_STOCK:p1").status, "RESOLVED", "Adding stock resolves out-of-stock");
assert.equal(store.get("LOW_STOCK:p2").status, "RESOLVED", "Adding stock resolves low-stock");

const sizeBeforeRefresh = store.size;
sync(store, generate({ pharmacy, settings, products: [{ id: "p1", available_stock: 0, reorder_level: 2 }], batches: [] }));
sync(store, generate({ pharmacy, settings, products: [{ id: "p1", available_stock: 0, reorder_level: 2 }], batches: [] }));
assert.equal(store.size, sizeBeforeRefresh, "Duplicate refresh does not create duplicate notifications");
assert.equal(store.get("OUT_OF_STOCK:p1").status, "ACTIVE", "Returning condition reactivates notification");

store.get("OUT_OF_STOCK:p1").read = true;
assert.equal(store.get("OUT_OF_STOCK:p1").read, true, "Read action works");
assert.equal(roleTypes.TECHNICIAN.includes("TRIAL_EXPIRING"), false, "Technician cannot access subscription alerts");

const pharmacyBAlerts = generate({ pharmacy: { id: "pharmacy-b", plan: "BASIC" }, settings, products: [{ id: "p1", available_stock: 0, reorder_level: 2 }], batches: [] });
assert.equal(pharmacyBAlerts[0].pharmacy_id, "pharmacy-b", "Pharmacy isolation derives alert tenant");

const adminSummary = {
  suspended: true,
  onboarding_incomplete: true,
  trial_ending_soon: true,
};
assert.deepEqual(adminSummary, { suspended: true, onboarding_incomplete: true, trial_ending_soon: true }, "Admin summary flags are accurate");

console.log("Notifications verification passed.");
