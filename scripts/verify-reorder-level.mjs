import assert from "node:assert/strict";

function stockStatus({ packsReceived = 0, unitsPerPack = 1, unitsSold = 0, reorderLevel = null }) {
  const availableStock = packsReceived * unitsPerPack - unitsSold;
  const threshold = reorderLevel ?? 0;

  if (availableStock <= 0) return "OUT OF STOCK";
  if (availableStock <= threshold) return "LOW STOCK";
  return "OK";
}

assert.equal(
  stockStatus({ packsReceived: 6, unitsPerPack: 10, unitsSold: 20, reorderLevel: 30 }),
  "OK",
  "Stock above reorder level is OK",
);

assert.equal(
  stockStatus({ packsReceived: 5, unitsPerPack: 10, unitsSold: 20, reorderLevel: 30 }),
  "LOW STOCK",
  "Stock equal to reorder level is low stock",
);

assert.equal(
  stockStatus({ packsReceived: 4, unitsPerPack: 10, unitsSold: 15, reorderLevel: 30 }),
  "LOW STOCK",
  "Stock below reorder level is low stock",
);

assert.equal(
  stockStatus({ packsReceived: 1, unitsPerPack: 10, unitsSold: 10, reorderLevel: 30 }),
  "OUT OF STOCK",
  "Zero stock is out of stock",
);

assert.equal(
  stockStatus({ packsReceived: 2, unitsPerPack: 10, unitsSold: 0, reorderLevel: 5 }),
  "OK",
  "Products keep separate reorder levels",
);

assert.equal(
  stockStatus({ packsReceived: 2, unitsPerPack: 10, unitsSold: 0, reorderLevel: 25 }),
  "LOW STOCK",
  "Different reorder levels can classify the same stock differently",
);

assert.equal(
  stockStatus({ packsReceived: 2, unitsPerPack: 10, unitsSold: 0, reorderLevel: 20 }),
  "LOW STOCK",
  "Pack stock is converted to base units before comparison",
);

assert.equal(
  stockStatus({ packsReceived: 1, unitsPerPack: 12, unitsSold: 5, reorderLevel: null }),
  "OK",
  "Missing reorder level defaults to zero",
);

console.log("Reorder-level verification passed.");
