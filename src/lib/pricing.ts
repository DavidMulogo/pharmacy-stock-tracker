import type { Product, SellType } from "@/lib/types";

type PriceFields = Pick<Product, "default_unit_price" | "default_pack_price" | "units_per_pack">;

export function resolveUnitPrice(product: PriceFields) {
  if (product.default_unit_price != null) return product.default_unit_price;
  if (product.default_pack_price != null && product.units_per_pack > 0) {
    return product.default_pack_price / product.units_per_pack;
  }
  return null;
}

export function resolvePackPrice(product: PriceFields) {
  if (product.default_pack_price != null) return product.default_pack_price;
  if (product.default_unit_price != null && product.units_per_pack > 0) {
    return product.default_unit_price * product.units_per_pack;
  }
  return null;
}

export function resolveDefaultPrice(product: PriceFields, sellType: SellType) {
  return sellType === "PACK" ? resolvePackPrice(product) : resolveUnitPrice(product);
}
