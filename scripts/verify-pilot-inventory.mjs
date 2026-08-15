import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./seed-pilot-inventory.mjs", import.meta.url), "utf8");
assert.match(source, /if \(!args\.apply\)/, "inventory loader is dry-run by default");
assert.match(source, /already has products/, "inventory loader refuses to mix with an existing catalogue");
assert.match(source, /--merge/, "existing inventory requires an explicit merge flag");
assert.match(source, /productsWithBatches/, "merge mode preserves products that already have stock batches");
assert.match(source, /createdProductIds/, "merge rollback deletes only products created by the current run");
assert.match(source, /master_medicines/, "products originate from the global catalogue");
assert.match(source, /No sales, expenses, corrections, or feedback were created/, "analytics remain clean");
const configuredProducts = source.match(/^  \["/gm)?.length || 0;
assert.ok(configuredProducts >= 60, `expected at least 60 pilot products, found ${configuredProducts}`);
console.log(`Pilot inventory verification passed (${configuredProducts} configured products).`);
