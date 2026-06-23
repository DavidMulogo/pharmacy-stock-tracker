create unique index if not exists inventory_batches_product_batch_expiry_unique_idx
on public.inventory_batches (product_id, lower(btrim(batch_number)), expiry_date);
