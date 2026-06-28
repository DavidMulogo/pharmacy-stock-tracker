export type OverrideFlag = "NORMAL" | "OVERRIDDEN";
export type StockStatus = "OUT OF STOCK" | "LOW STOCK" | "OK";
export type ExpiryStatus = "EXPIRED" | "EXPIRING SOON" | "OK";
export type SellingMode = "UNIT" | "PACK" | "BOTH";
export type SellType = "UNIT" | "PACK";

export type Pharmacy = {
  id: string;
  pharmacy_name: string;
  owner_name: string;
  phone: string;
  created_at: string;
};

export type PharmacyAccess = {
  id: string;
  pharmacy_id: string;
  pharmacy_code: string;
  password: string;
  created_at: string;
};

export type Product = {
  id: string;
  pharmacy_id: string | null;
  product_name: string;
  generic_name: string;
  brand_name: string;
  dosage_form: string;
  base_unit: string;
  pack_type: string;
  units_per_pack: number;
  default_selling_price: number;
  selling_mode: SellingMode;
  default_unit_price: number | null;
  default_pack_price: number | null;
  reorder_level: number;
  created_at: string;
};

export type InventoryBatch = {
  id: string;
  pharmacy_id: string | null;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  packs_received: number;
  units_per_pack: number;
  total_units_received: number;
  buying_price_per_pack: number;
  derived_unit_cost: number | null;
  created_at: string;
};

export type Sale = {
  id: string;
  pharmacy_id: string | null;
  product_id: string;
  sell_type: SellType;
  quantity_entered: number;
  units_sold: number;
  quantity_sold: number;
  default_price: number;
  override_price: number | null;
  effective_price: number;
  final_selling_price: number | null;
  effective_selling_price: number;
  total_sale: number;
  override_flag: OverrideFlag;
  created_at: string;
};

export type ProductWithStock = Product & {
  total_received: number;
  total_sold: number;
  available_stock: number;
  derived_unit_cost: number | null;
  stock_status: StockStatus;
};

export type BatchWithProduct = InventoryBatch & {
  product: Product;
  expiry_status: ExpiryStatus;
  days_to_expiry: number;
};

export type SaleWithProduct = Sale & {
  product: Product;
};

export type DashboardStats = {
  total_products: number;
  low_stock_items: number;
  out_of_stock_items: number;
  expiring_soon_batches: number;
  total_inventory_value: number;
  todays_sales: number;
};

export type DashboardData = {
  stats: DashboardStats;
  products: ProductWithStock[];
  batches: BatchWithProduct[];
  expiringBatches: BatchWithProduct[];
  sales: SaleWithProduct[];
};
