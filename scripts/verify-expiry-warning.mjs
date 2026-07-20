import assert from "node:assert/strict";

const today = new Date("2026-07-20T00:00:00Z");

function daysFromToday(days) {
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function expiryStatus(expiryDate, warningDays = 30) {
  const expiry = new Date(`${expiryDate}T00:00:00Z`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "EXPIRED";
  if (days <= warningDays) return "EXPIRING SOON";
  return "OK";
}

assert.equal(expiryStatus(daysFromToday(29), 30), "EXPIRING SOON", "30-day threshold includes day 29");
assert.equal(expiryStatus(daysFromToday(31), 30), "OK", "30-day threshold excludes day 31");
assert.equal(expiryStatus(daysFromToday(89), 90), "EXPIRING SOON", "90-day threshold includes day 89");
assert.equal(expiryStatus(daysFromToday(91), 90), "OK", "90-day threshold excludes day 91");

const batchDate = daysFromToday(60);
const pharmacyA = { id: "pharmacy-a", warningDays: 30 };
const pharmacyB = { id: "pharmacy-b", warningDays: 90 };

assert.equal(expiryStatus(batchDate, pharmacyA.warningDays), "OK", "Pharmacy A can use 30 days");
assert.equal(expiryStatus(batchDate, pharmacyB.warningDays), "EXPIRING SOON", "Pharmacy B can use 90 days for the same batch date");
assert.notEqual(
  expiryStatus(batchDate, pharmacyA.warningDays),
  expiryStatus(batchDate, pharmacyB.warningDays),
  "Different pharmacies can have different expiry thresholds",
);

assert.equal(expiryStatus(daysFromToday(30), undefined), "EXPIRING SOON", "Missing setting safely defaults to 30 days");

console.log("Expiry warning verification passed.");
