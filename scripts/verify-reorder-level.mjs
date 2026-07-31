import assert from "node:assert/strict";

function stockSummary({ packsReceived = 0, unitsPerPack = 1, unitsSold = 0, reorderLevel = null }) {
  const availableStock = packsReceived * unitsPerPack - unitsSold;
  const reorderLevelConfigured = reorderLevel !== null;
  let stockStatus = null;

  if (availableStock <= 0) stockStatus = "OUT OF STOCK";
  else if (reorderLevelConfigured && availableStock <= reorderLevel) stockStatus = "LOW STOCK";
  else if (reorderLevelConfigured && availableStock > reorderLevel) stockStatus = "OK";

  return { availableStock, reorderLevelConfigured, stockStatus };
}

function parseImportReorderLevel(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number < 0) throw new Error("invalid reorder level");
  return number;
}

function canUpdateReorderLevel({ sessionPharmacyId, productPharmacyId, value }) {
  parseImportReorderLevel(value);
  return sessionPharmacyId === productPharmacyId;
}

assert.equal(stockSummary({ packsReceived: 6, unitsPerPack: 10, unitsSold: 20, reorderLevel: 30 }).stockStatus, "OK", "Stock above reorder level is OK");
assert.equal(stockSummary({ packsReceived: 5, unitsPerPack: 10, unitsSold: 20, reorderLevel: 30 }).stockStatus, "LOW STOCK", "Stock equal to reorder level is low stock");
assert.equal(stockSummary({ packsReceived: 4, unitsPerPack: 10, unitsSold: 15, reorderLevel: 30 }).stockStatus, "LOW STOCK", "Stock below reorder level is low stock");
assert.equal(stockSummary({ packsReceived: 1, unitsPerPack: 10, unitsSold: 10, reorderLevel: null }).stockStatus, "OUT OF STOCK", "Zero stock is out of stock even without reorder level");

const nullPositive = stockSummary({ packsReceived: 1, unitsPerPack: 12, unitsSold: 5, reorderLevel: null });
assert.equal(nullPositive.stockStatus, null, "Positive stock with null reorder level has no stock status");
assert.equal(nullPositive.reorderLevelConfigured, false, "Null reorder level is exposed as unconfigured");

assert.equal(stockSummary({ packsReceived: 2, unitsPerPack: 10, unitsSold: 0, reorderLevel: 5 }).stockStatus, "OK", "Products keep separate reorder levels");
assert.equal(stockSummary({ packsReceived: 2, unitsPerPack: 10, unitsSold: 0, reorderLevel: 25 }).stockStatus, "LOW STOCK", "Different reorder levels can classify the same stock differently");
assert.equal(stockSummary({ packsReceived: 2, unitsPerPack: 10, unitsSold: 0, reorderLevel: 20 }).stockStatus, "LOW STOCK", "Pack stock is converted to base units before comparison");
assert.equal(stockSummary({ packsReceived: 1, unitsPerPack: 10, unitsSold: 6, reorderLevel: 0 }).stockStatus, "OK", "Zero reorder level is configured and not replaced by a pharmacy-wide threshold");

assert.equal(parseImportReorderLevel(""), null, "Empty import reorder level becomes null");
assert.equal(parseImportReorderLevel("15"), 15, "Configured import reorder level is preserved");
assert.throws(() => parseImportReorderLevel("-1"), /invalid/, "Negative reorder level is rejected");
assert.equal(canUpdateReorderLevel({ sessionPharmacyId: "a", productPharmacyId: "a", value: 10 }), true, "Focused API allows same-tenant updates");
assert.equal(canUpdateReorderLevel({ sessionPharmacyId: "a", productPharmacyId: "b", value: 10 }), false, "Focused API blocks cross-tenant updates");

console.log("Reorder-level verification passed.");
