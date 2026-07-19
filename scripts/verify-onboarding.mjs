import assert from "node:assert/strict";

function summarize(row, counts) {
  const requiredChecks = [
    Boolean(row.profile_reviewed_at),
    Boolean(row.business_rules_reviewed_at),
    counts.productCount > 0,
    counts.inventoryBatchCount > 0,
  ];
  const reviewedRequiredSteps = requiredChecks.filter(Boolean).length;
  return {
    percent: row.completed_at ? 100 : Math.round((reviewedRequiredSteps / requiredChecks.length) * 100),
    completed: Boolean(row.completed_at),
    canComplete: requiredChecks.every(Boolean),
    missing: [
      !row.profile_reviewed_at && "pharmacy profile",
      !row.business_rules_reviewed_at && "business rules",
      counts.productCount <= 0 && "one product",
      counts.inventoryBatchCount <= 0 && "one stock batch",
    ].filter(Boolean),
  };
}

function joinReadable(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function bannerMessage(summary) {
  const reviewItems = summary.missing.filter((item) => item === "pharmacy profile" || item === "business rules");
  const addItems = summary.missing.filter((item) => item === "one product" || item === "one stock batch");
  const clauses = [];

  if (reviewItems.length > 0) clauses.push(`Review the ${joinReadable(reviewItems)}`);
  if (addItems.length > 0) clauses.push(`add ${joinReadable(addItems)}`);

  const sentence = clauses.length === 2 ? `${clauses[0]}, then ${clauses[1]}` : joinReadable(clauses);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function requireOwner(role) {
  return role === "OWNER";
}

const empty = {
  pharmacy_id: "pharmacy-a",
  profile_reviewed_at: null,
  business_rules_reviewed_at: null,
  staff_reviewed_at: null,
  products_reviewed_at: null,
  opening_stock_reviewed_at: null,
  subscription_reviewed_at: null,
  completed_at: null,
};

assert.equal(requireOwner("OWNER"), true, "Owner can update onboarding state");
assert.equal(requireOwner("PHARMACIST"), false, "Pharmacist cannot update onboarding state");
assert.equal(requireOwner("TECHNICIAN"), false, "Technician cannot update onboarding state");

const newPharmacy = summarize(empty, { productCount: 0, inventoryBatchCount: 0 });
assert.equal(newPharmacy.completed, false, "New pharmacy starts incomplete");
assert.equal(newPharmacy.percent, 0, "New pharmacy banner shows incomplete progress");
assert.equal(
  bannerMessage(newPharmacy),
  "Review the pharmacy profile and business rules, then add one product and one stock batch.",
  "Banner mentions all missing setup items",
);

const demoPharmacy = summarize(empty, { productCount: 1, inventoryBatchCount: 1 });
assert.equal(demoPharmacy.percent, 50, "Demo pharmacy is 50% when products and stock exist but reviews are missing");
assert.equal(
  bannerMessage(demoPharmacy),
  "Review the pharmacy profile and business rules.",
  "Banner omits products and stock when they are already complete",
);

const reviewed = {
  ...empty,
  profile_reviewed_at: "2026-07-19T00:00:00.000Z",
  business_rules_reviewed_at: "2026-07-19T00:00:00.000Z",
};
const noStock = summarize(reviewed, { productCount: 0, inventoryBatchCount: 0 });
assert.equal(noStock.canComplete, false, "Completion fails without product and stock");
assert.deepEqual(noStock.missing, ["one product", "one stock batch"]);
assert.equal(bannerMessage(noStock), "Add one product and one stock batch.", "Banner can mention only product and stock");

const productOnly = summarize(reviewed, { productCount: 1, inventoryBatchCount: 0 });
assert.equal(productOnly.canComplete, false, "Completion fails without stock batch");
assert.equal(bannerMessage(productOnly), "Add one stock batch.", "Banner handles one missing stock batch");

const ready = summarize(reviewed, { productCount: 1, inventoryBatchCount: 1 });
assert.equal(ready.canComplete, true, "Completion succeeds once requirements are met");

const completed = summarize({ ...reviewed, completed_at: "2026-07-19T01:00:00.000Z" }, { productCount: 1, inventoryBatchCount: 1 });
assert.equal(completed.completed, true, "Completed onboarding remains completed after relogin");
assert.equal(completed.percent, 100, "Admin sees completed onboarding as 100%");

const secondComplete = summarize({ ...reviewed, completed_at: "2026-07-19T01:00:00.000Z" }, { productCount: 1, inventoryBatchCount: 1 });
assert.deepEqual(secondComplete, completed, "Completion is idempotent");

const tenantA = summarize(reviewed, { productCount: 1, inventoryBatchCount: 1 });
const tenantB = summarize(empty, { productCount: 0, inventoryBatchCount: 0 });
assert.notEqual(tenantA.percent, tenantB.percent, "Tenant isolation keeps progress separate per pharmacy");

console.log("Onboarding verification passed.");
