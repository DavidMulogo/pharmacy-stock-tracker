export type OverrideFlag = "NORMAL" | "OVERRIDDEN";
export type StockStatus = "OUT OF STOCK" | "LOW STOCK" | "OK";
export type ExpiryStatus = "EXPIRED" | "EXPIRING SOON" | "OK";
export type SellingMode = "UNIT" | "PACK" | "BOTH";
export type SellType = "UNIT" | "PACK";
export type PharmacyPlan = "TRIAL" | "BASIC" | "PRO" | "ENTERPRISE";
export type PharmacyStatus = "ACTIVE" | "TRIAL" | "EXPIRED" | "SUSPENDED";
export type PharmacyUserRole = "OWNER" | "PHARMACIST" | "TECHNICIAN";
export type ExpenseCategory = "Rent" | "Salary" | "Electricity" | "Water" | "Internet" | "Transport" | "Repairs" | "Supplies" | "Other";
export type NotificationType = "LOW_STOCK" | "OUT_OF_STOCK" | "EXPIRING_SOON" | "EXPIRED_BATCH" | "TRIAL_EXPIRING" | "SUBSCRIPTION_EXPIRING" | "SUBSCRIPTION_EXPIRED";
export type NotificationSeverity = "INFO" | "WARNING" | "CRITICAL";
export type NotificationStatus = "ACTIVE" | "RESOLVED";
export type ActivityLogAction = "LOGIN" | "LOGOUT" | "SALE_CREATED" | "SALE_VOIDED" | "STOCK_ADDED" | "INVENTORY_ADJUSTED" | "INVENTORY_ADJUSTMENT_REVERSED" | "PRODUCTS_IMPORTED" | "STOCK_IMPORTED" | "EXPENSE_CREATED" | "SETTINGS_UPDATED" | "STAFF_CREATED" | "STAFF_UPDATED" | "STAFF_DEACTIVATED" | "STAFF_REACTIVATED" | "STAFF_PASSWORD_RESET" | "REPORT_EXPORTED" | "BACKUP_EXPORTED" | "BACKUP_VALIDATED" | "ONBOARDING_STARTED" | "ONBOARDING_STEP_REVIEWED" | "ONBOARDING_COMPLETED";
export type InventoryAdjustmentReason = "DAMAGED" | "EXPIRED" | "CUSTOMER_RETURN" | "SUPPLIER_RETURN" | "MISSING" | "INTERNAL_USE" | "OTHER";

export type OnboardingStepId = "profile" | "business_rules" | "staff" | "products" | "opening_stock" | "subscription";

export type Pharmacy = {
  id: string;
  pharmacy_name: string;
  owner_name: string;
  phone: string;
  plan: PharmacyPlan;
  status: PharmacyStatus;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  archived_at: string | null;
  created_at: string;
  onboarding?: OnboardingProgressSummary | null;
  notification_summary?: AdminNotificationSummary | null;
};

export type Notification = {
  id: string;
  pharmacy_id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  dedupe_key: string;
  status: NotificationStatus;
  first_seen_at: string;
  last_seen_at: string;
  read_at: string | null;
  resolved_at: string | null;
  metadata: import("@/lib/database.types").Json;
  created_at: string;
  updated_at: string;
};

export type NotificationFilter = "all" | "unread" | "inventory" | "expiry" | "subscription" | "resolved";

export type NotificationCounts = {
  unread_active: number;
  active: number;
};

export type AdminNotificationSummary = {
  expired_subscription: boolean;
  trial_ending_soon: boolean;
  subscription_ending_soon: boolean;
  suspended: boolean;
  onboarding_incomplete: boolean;
};

export type PharmacyOnboarding = {
  id: string;
  pharmacy_id: string;
  started_at: string;
  profile_reviewed_at: string | null;
  business_rules_reviewed_at: string | null;
  staff_reviewed_at: string | null;
  products_reviewed_at: string | null;
  opening_stock_reviewed_at: string | null;
  subscription_reviewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OnboardingProgressSummary = {
  percent: number;
  completed: boolean;
  completed_at: string | null;
  product_count: number;
  inventory_batch_count: number;
  reviewed_required_steps: number;
  required_steps: number;
  missing_requirements: string[];
};

export type OnboardingProgress = OnboardingProgressSummary & {
  onboarding: PharmacyOnboarding;
  can_complete: boolean;
  staff_count: number;
};

export type PharmacyAccess = {
  id: string;
  pharmacy_id: string;
  pharmacy_code: string;
  password: string;
  password_hash: string | null;
  created_at: string;
};

export type PharmacySession = {
  id: string;
  pharmacy_id: string;
  pharmacy_user_id: string | null;
  session_token: string;
  role: PharmacyUserRole | null;
  created_at: string;
  expires_at: string;
  last_seen: string;
};

export type PharmacyUser = {
  id: string;
  pharmacy_id: string;
  full_name: string;
  username: string;
  role: PharmacyUserRole;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PharmacySettings = {
  id: string;
  pharmacy_id: string;
  registration_number: string;
  license_number: string;
  address: string;
  region: string;
  district: string;
  email: string;
  logo_url: string;
  receipt_header: string;
  receipt_footer: string;
  receipt_prefix: string;
  expiry_warning_days: number;
  allow_negative_stock: boolean;
  allow_duplicate_batches: boolean;
  allow_price_override: boolean;
  max_discount: number;
  vat_percentage: number;
  currency: string;
  timezone: string;
  created_at: string;
  updated_at: string;
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
  reorder_level: number | null;
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
  transaction_id: string | null;
  line_number: number | null;
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
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string;
};

export type ProductWithStock = Product & {
  total_received: number;
  total_sold: number;
  total_adjusted: number;
  available_stock: number;
  derived_unit_cost: number | null;
  reorder_level_configured: boolean;
  stock_status: StockStatus | null;
};

export type BatchWithProduct = InventoryBatch & {
  product: Product;
  available_stock: number;
  expiry_status: ExpiryStatus;
  days_to_expiry: number;
};

export type SaleWithProduct = Sale & {
  product: Product;
};

export type InventoryAdjustment = {
  id: string;
  pharmacy_id: string;
  product_id: string;
  inventory_batch_id: string | null;
  created_by: string | null;
  reason: InventoryAdjustmentReason;
  quantity: number;
  stock_effect: -1 | 0;
  note: string;
  created_at: string;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string;
};

export type InventoryAdjustmentWithDetails = InventoryAdjustment & {
  product: Product;
  batch: Pick<InventoryBatch, "id" | "batch_number" | "expiry_date"> | null;
  staff_name: string;
};

export type Expense = {
  id: string;
  pharmacy_id: string;
  expense_date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityLog = {
  id: string;
  pharmacy_id: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_role: PharmacyUserRole;
  action: ActivityLogAction;
  entity_type: string;
  entity_id: string | null;
  description: string;
  metadata: import("@/lib/database.types").Json;
  created_at: string;
};

export type BestSellingProduct = {
  product_id: string;
  product_name: string;
  units_sold: number;
  total_sale: number;
};

export type DashboardStats = {
  total_products: number;
  low_stock_items: number;
  out_of_stock_items: number;
  reorder_level_unconfigured_items: number;
  expiring_soon_batches: number;
  expiry_warning_days: number;
  total_inventory_value: number;
  todays_sales: number;
  month_sales: number;
  todays_gross_profit: number;
  month_gross_profit: number;
  month_expenses: number;
  month_net_profit: number;
  todays_profit_incomplete_sales: number;
  month_profit_incomplete_sales: number;
  best_selling_products: BestSellingProduct[];
};

export type DashboardData = {
  stats: DashboardStats;
  products: ProductWithStock[];
  batches: BatchWithProduct[];
  expiringBatches: BatchWithProduct[];
  sales: SaleWithProduct[];
  adjustments: InventoryAdjustmentWithDetails[];
};
