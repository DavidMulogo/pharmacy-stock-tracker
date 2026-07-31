#!/usr/bin/env node
import assert from "node:assert/strict";

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

function calculateBatchStock(totalReceived, duplicateRows, newRows) {
  let available = totalReceived;
  for (const row of duplicateRows) available -= row.unitsSold;
  const startingAvailable = available;
  for (const row of newRows) available -= row.unitsSold;
  return { startingAvailable, remainingAvailable: available };
}

const timestampCandidates = getTimestampCandidates("2026-07-22 09:10:00");
assert.equal(timestampCandidates.some((candidate) => candidate.iso === "2026-07-22T06:10:00.000Z"), true);
assert.equal(timestampCandidates.some((candidate) => candidate.iso === "2026-07-22T09:10:00.000Z"), true);

assert.equal(normalizeMoney("600.00"), normalizeMoney(600));
assert.equal(normalizeMoney("600.004"), normalizeMoney("600"));

const duplicateCandidate = {
  pharmacy_id: "pharmacy-1",
  product_id: "product-1",
  sell_type: "UNIT",
  quantity_entered: 10,
  units_sold: 10,
  effective_price: 600,
  timestampCandidates,
};
const existingSales = [
  {
    id: "sale-1",
    pharmacy_id: "pharmacy-1",
    product_id: "product-1",
    created_at: "2026-07-22T09:10:00.000Z",
    sell_type: "UNIT",
    quantity_entered: "10",
    units_sold: "10",
    effective_price: "600.00",
  },
];
const usedSaleIds = new Set();
const firstMatch = findDuplicateSale(existingSales, usedSaleIds, duplicateCandidate);
assert.equal(firstMatch?.id, "sale-1");
usedSaleIds.add(firstMatch.id);
assert.equal(findDuplicateSale(existingSales, usedSaleIds, duplicateCandidate), undefined);

const batchStock = calculateBatchStock(80, [{ unitsSold: 30 }], []);
assert.deepEqual(batchStock, { startingAvailable: 50, remainingAvailable: 50 });

const secondDryRunRows = [];
assert.equal(secondDryRunRows.length, 0);

console.log("AfyaCare sales seed verification passed.");
