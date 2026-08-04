"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatOptionalTZS, formatTZS } from "@/lib/format";
import { ReorderLevelForm } from "@/app/products/reorder-level-form";
import { resolveDefaultPrice } from "@/lib/pricing";
import { getPharmacyExpiryWarning } from "@/lib/subscription";
import type { DashboardData, ExpiryStatus, InventoryAdjustmentReason, NotificationCounts, OnboardingProgressSummary, OverrideFlag, Pharmacy, PharmacyUser, ProductWithStock, SaleWithProduct, SellType, StockStatus } from "@/lib/types";

type Tab = "dashboard" | "sell" | "products" | "stock" | "adjust" | "expiry" | "sales" | "csv";
type Toast = {
  message: string;
  type: "success" | "error";
};
type ImportKind = "products" | "batches";
type ProductStockFilter = StockStatus | "ALL" | "REORDER_UNCONFIGURED";
type CsvRow = Record<string, string>;
type ImportPreview = {
  rows: CsvRow[];
  errors: { row: number; errors: string[] }[];
  warnings: { row: number; warnings: string[] }[];
  missingColumns: string[];
};
type CartItem = {
  id: string;
  product_id: string;
  product_name: string;
  sell_type: SellType;
  quantity_entered: number;
  units_sold: number;
  unit_label: string;
  default_price: number;
  override_price: number | null;
  effective_price: number;
  total_sale: number;
};
type SaleGroup = {
  key: string;
  transactionId: string | null;
  createdAt: string;
  lines: SaleWithProduct[];
  totalSale: number;
  unitsSold: number;
  hasOverride: boolean;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sell", label: "Sell" },
  { id: "products", label: "Products" },
  { id: "stock", label: "Add Stock" },
  { id: "adjust", label: "Adjust Stock" },
  { id: "expiry", label: "Expiry" },
  { id: "sales", label: "Sales" },
  { id: "csv", label: "CSV" },
];

const PRODUCT_IMPORT_COLUMNS = [
  "product_name",
  "generic_name",
  "brand_name",
  "dosage_form",
  "base_unit",
  "pack_type",
  "units_per_pack",
  "selling_mode",
  "default_unit_price",
  "default_pack_price",
  "reorder_level",
] as const;

const BATCH_IMPORT_COLUMNS = ["product_name", "batch_number", "expiry_date", "packs_received", "buying_price_per_pack"] as const;
const DUPLICATE_BATCH_MESSAGE = "This batch already exists for this product and expiry date.";
const adjustmentReasons: Array<{ value: InventoryAdjustmentReason; label: string }> = [
  { value: "DAMAGED", label: "Broken or damaged" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CUSTOMER_RETURN", label: "Returned by customer (quarantine)" },
  { value: "SUPPLIER_RETURN", label: "Returned to supplier" },
  { value: "MISSING", label: "Missing / stock discrepancy" },
  { value: "INTERNAL_USE", label: "Internal use" },
  { value: "OTHER", label: "Other" },
];

type StatusBadgeValue = StockStatus | ExpiryStatus | OverrideFlag;

const STATUS_BADGE_CLASSES = {
  OK: "w-fit rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800",
  "LOW STOCK": "w-fit rounded-full border border-yellow-200 bg-yellow-100 px-2.5 py-1 text-xs font-bold text-yellow-800",
  "OUT OF STOCK": "w-fit rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800",
  EXPIRED: "w-fit rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800",
  "EXPIRING SOON": "w-fit rounded-full border border-orange-200 bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-800",
  OVERRIDDEN: "w-fit rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800",
  NORMAL: "w-fit rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700",
} satisfies Record<StatusBadgeValue, string>;

const expiryCardClass = {
  EXPIRED: "border-rose-200 bg-rose-50",
  "EXPIRING SOON": "border-orange-200 bg-orange-50",
  OK: "border-slate-200 bg-white",
};

const TOAST_CLASSES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
} satisfies Record<Toast["type"], string>;

const KPI_CARD_CLASSES = {
  slate: "border-slate-200 bg-white text-slate-900",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-950",
  rose: "border-rose-200 bg-rose-50 text-rose-950",
  orange: "border-orange-200 bg-orange-50 text-orange-950",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
  blue: "border-blue-200 bg-blue-50 text-blue-950",
} as const;

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && next === '"' && inQuotes) {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);

  const [headers = [], ...dataRows] = rows;
  const normalizedHeaders = headers.map((header) => header.trim());
  return dataRows.map((dataRow) => {
    const item: CsvRow = {};
    normalizedHeaders.forEach((header, index) => {
      item[header] = dataRow[index]?.trim() || "";
    });
    return item;
  });
}

function csvEscape(value: string | number | null) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildCsv(headers: string[], rows: Array<Array<string | number | null>>) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getRequiredColumns(kind: ImportKind) {
  return kind === "products" ? PRODUCT_IMPORT_COLUMNS : BATCH_IMPORT_COLUMNS;
}

function getProductSellType(product: ProductWithStock, preferredSellType: SellType): SellType {
  if (product.selling_mode === "PACK") return "PACK";
  if (product.selling_mode === "UNIT") return "UNIT";
  return preferredSellType;
}

function matchesProductSearch(product: ProductWithStock, query: string) {
  const searchTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (searchTerms.length === 0) return true;

  const searchableText = [
    product.product_name,
    product.generic_name,
    product.brand_name,
    product.dosage_form,
  ]
    .join(" ")
    .toLowerCase();

  return searchTerms.every((term) => searchableText.includes(term));
}

function getImportBatchKey(productId: string, batchNumber: string, expiryDate: string) {
  return `${productId}::${batchNumber.trim().toLowerCase()}::${expiryDate}`;
}

function joinReadable(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function getOnboardingBannerMessage(onboarding: OnboardingProgressSummary) {
  const missing = onboarding.missing_requirements;
  if (missing.length === 0) return "Finish the final setup review.";

  const reviewItems = missing.filter((item) => item === "pharmacy profile" || item === "business rules");
  const addItems = missing.filter((item) => item === "one product" || item === "one stock batch");
  const clauses: string[] = [];

  if (reviewItems.length > 0) clauses.push(`Review the ${joinReadable(reviewItems)}`);
  if (addItems.length > 0) clauses.push(`add ${joinReadable(addItems)}`);

  const sentence = clauses.length === 2 ? `${clauses[0]}, then ${clauses[1]}` : joinReadable(clauses);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function validateImportRows(
  kind: ImportKind,
  rows: CsvRow[],
  productsByName: Map<string, ProductWithStock>,
  existingBatchKeys: Set<string>,
): ImportPreview {
  const requiredColumns = getRequiredColumns(kind);
  const missingColumns = rows.length
    ? requiredColumns.filter((column) => {
        if (kind === "batches" && column === "buying_price_per_pack") {
          return !("buying_price_per_pack" in rows[0]) && !("buying_price" in rows[0]);
        }
        return !(column in rows[0]);
      })
    : [...requiredColumns];
  const errors: ImportPreview["errors"] = [];
  const warnings: ImportPreview["warnings"] = [];
  const seenImportBatchKeys = new Set<string>();

  rows.forEach((row, index) => {
    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    for (const column of requiredColumns) {
      if (kind === "products" && (column === "default_unit_price" || column === "default_pack_price" || column === "reorder_level")) continue;
      if (!String(row[column] ?? "").trim()) rowErrors.push(`Missing ${column}.`);
    }

    if (kind === "products") {
      const unitsPerPack = Number(row.units_per_pack);
      const defaultUnitPrice = String(row.default_unit_price || "").trim() === "" ? null : Number(row.default_unit_price);
      const defaultPackPrice = String(row.default_pack_price || "").trim() === "" ? null : Number(row.default_pack_price);
      const reorderText = String(row.reorder_level ?? "").trim();
      const reorderLevel = reorderText === "" ? null : Number(reorderText);
      const sellingMode = String(row.selling_mode || "").trim();

      if (!String(row.product_name || "").trim()) rowErrors.push("Missing product name.");
      if (!Number.isInteger(unitsPerPack) || unitsPerPack <= 0) rowErrors.push("Invalid units per pack.");
      if (!["UNIT", "PACK", "BOTH"].includes(sellingMode)) rowErrors.push("Selling mode must be UNIT, PACK, or BOTH.");
      if (defaultUnitPrice === null && defaultPackPrice === null) rowErrors.push("At least one default price is required.");
      if (defaultUnitPrice !== null && (!Number.isFinite(defaultUnitPrice) || defaultUnitPrice < 0)) rowErrors.push("Default unit price cannot be negative.");
      if (defaultPackPrice !== null && (!Number.isFinite(defaultPackPrice) || defaultPackPrice < 0)) rowErrors.push("Default pack price cannot be negative.");
      if (reorderLevel !== null && (!Number.isInteger(reorderLevel) || reorderLevel < 0)) rowErrors.push("Reorder level must be a whole number zero or greater.");
    } else {
      const productName = String(row.product_name || "").trim();
      const packsReceived = Number(row.packs_received);
      const buyingPricePerPack = Number(row.buying_price_per_pack || row.buying_price);
      const batchNumber = String(row.batch_number || "").trim();
      const expiryDate = String(row.expiry_date || "").trim();
      const product = productsByName.get(productName.toLowerCase());

      if (!productName) rowErrors.push("Missing product name.");
      if (productName && !product) rowErrors.push("Product name does not match an existing product.");
      if (!isValidIsoDate(expiryDate)) rowErrors.push("Invalid expiry date.");
      if (!Number.isInteger(packsReceived) || packsReceived <= 0) rowErrors.push("Packs received must be greater than zero.");
      if (!Number.isFinite(buyingPricePerPack) || buyingPricePerPack < 0) rowErrors.push("Buying price per pack cannot be negative.");

      if (product && batchNumber && isValidIsoDate(expiryDate)) {
        const batchKey = getImportBatchKey(product.id, batchNumber, expiryDate);
        if (existingBatchKeys.has(batchKey)) rowWarnings.push(DUPLICATE_BATCH_MESSAGE);
        if (seenImportBatchKeys.has(batchKey)) rowWarnings.push(DUPLICATE_BATCH_MESSAGE);
        seenImportBatchKeys.add(batchKey);
      }
    }

    if (rowErrors.length) errors.push({ row: index + 2, errors: rowErrors });
    if (rowWarnings.length) warnings.push({ row: index + 2, warnings: rowWarnings });
  });

  return { rows, errors, warnings, missingColumns };
}

export function PharmacyApp({
  initialData,
  initialPharmacies,
  initialPharmacyId,
  initialUser,
  initialOnboarding,
  initialNotificationCounts,
  isDebugMode,
}: {
  initialData: DashboardData;
  initialPharmacies: Pharmacy[];
  initialPharmacyId: string;
  initialUser: PharmacyUser | null;
  initialOnboarding: OnboardingProgressSummary | null;
  initialNotificationCounts: NotificationCounts | null;
  isDebugMode: boolean;
}) {
  const router = useRouter();
  const [pharmacies, setPharmacies] = useState(initialPharmacies);
  const [activePharmacyId, setActivePharmacyId] = useState(initialPharmacyId);
  const [dashboardData, setDashboardData] = useState(initialData);
  const [isLoadingPharmacy, setIsLoadingPharmacy] = useState(false);
  const [pharmacyMessage, setPharmacyMessage] = useState("");
  const [pharmacyName, setPharmacyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [pharmacyCode, setPharmacyCode] = useState("");
  const [pharmacyPassword, setPharmacyPassword] = useState("");
  const [loginNameOrCode, setLoginNameOrCode] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [activeUser, setActiveUser] = useState<PharmacyUser | null>(initialUser);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCreatingPharmacy, setIsCreatingPharmacy] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [query, setQuery] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productStockStatus, setProductStockStatus] = useState<ProductStockFilter>("ALL");
  const [salesSearch, setSalesSearch] = useState("");
  const [salesDate, setSalesDate] = useState("");
  const [salesOverrideFlag, setSalesOverrideFlag] = useState<OverrideFlag | "ALL">("ALL");
  const [expirySearch, setExpirySearch] = useState("");
  const [expiryStatus, setExpiryStatus] = useState<ExpiryStatus | "ALL">("ALL");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [preferredSellType, setPreferredSellType] = useState<SellType>("UNIT");
  const [quantity, setQuantity] = useState("1");
  const [overridePrice, setOverridePrice] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [saleMessage, setSaleMessage] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [stockMessage, setStockMessage] = useState("");
  const [stockConfirmation, setStockConfirmation] = useState("");
  const [batchProductId, setBatchProductId] = useState("");
  const [batchProductSearch, setBatchProductSearch] = useState("");
  const [isBatchProductPickerOpen, setIsBatchProductPickerOpen] = useState(false);
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [packsReceived, setPacksReceived] = useState("");
  const [buyingPricePerPack, setBuyingPricePerPack] = useState("");
  const [isSavingSale, setIsSavingSale] = useState(false);
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [adjustmentProductSearch, setAdjustmentProductSearch] = useState("");
  const [adjustmentProductId, setAdjustmentProductId] = useState("");
  const [isAdjustmentPickerOpen, setIsAdjustmentPickerOpen] = useState(false);
  const [adjustmentBatchId, setAdjustmentBatchId] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState<InventoryAdjustmentReason>("DAMAGED");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [adjustmentMessage, setAdjustmentMessage] = useState("");
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);
  const [productImport, setProductImport] = useState<ImportPreview | null>(null);
  const [batchImport, setBatchImport] = useState<ImportPreview | null>(null);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [isImportingBatches, setIsImportingBatches] = useState(false);

  const filteredProducts = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return [];
    return dashboardData.products.filter((product) =>
      [product.product_name, product.generic_name, product.brand_name].some((value) => value.toLowerCase().includes(text)),
    );
  }, [dashboardData.products, query]);
  const filteredProductList = useMemo(() => {
    const text = productSearch.trim().toLowerCase();

    return dashboardData.products.filter((product) => {
      const matchesText =
        !text ||
        product.product_name.toLowerCase().includes(text) ||
        product.generic_name.toLowerCase().includes(text);
      const matchesStatus =
        productStockStatus === "ALL" ||
        (productStockStatus === "REORDER_UNCONFIGURED"
          ? !product.reorder_level_configured
          : product.stock_status === productStockStatus);

      return matchesText && matchesStatus;
    });
  }, [dashboardData.products, productSearch, productStockStatus]);
  const filteredBatchProducts = useMemo(() => {
    return dashboardData.products.filter((product) => matchesProductSearch(product, batchProductSearch));
  }, [batchProductSearch, dashboardData.products]);
  const filteredAdjustmentProducts = useMemo(() => {
    if (!adjustmentProductSearch.trim()) return [];
    return dashboardData.products.filter((product) => matchesProductSearch(product, adjustmentProductSearch));
  }, [adjustmentProductSearch, dashboardData.products]);

  const selectedProduct = dashboardData.products.find((product) => product.id === selectedProductId);
  const batchProduct = dashboardData.products.find((product) => product.id === batchProductId);
  const adjustmentProduct = dashboardData.products.find((product) => product.id === adjustmentProductId);
  const adjustmentBatches = dashboardData.batches.filter((batch) => batch.product_id === adjustmentProductId);
  const adjustmentIsCustomerReturn = adjustmentReason === "CUSTOMER_RETURN";
  const adjustmentQuantityNumber = Number(adjustmentQuantity);
  const adjustmentFormInvalid =
    !adjustmentProduct ||
    (!adjustmentIsCustomerReturn && !adjustmentBatchId) ||
    !Number.isInteger(adjustmentQuantityNumber) ||
    adjustmentQuantityNumber <= 0 ||
    adjustmentNote.length > 500;
  const sellType: SellType = selectedProduct ? getProductSellType(selectedProduct, preferredSellType) : preferredSellType;
  const saleQuantity = Number(quantity);
  const overridePriceNumber = overridePrice.trim() === "" ? null : Number(overridePrice);
  const overridePriceInvalid = overridePriceNumber !== null && (!Number.isFinite(overridePriceNumber) || overridePriceNumber < 0);
  const selectedDefaultPrice =
    selectedProduct ? resolveDefaultPrice(selectedProduct, sellType) : null;
  const effectiveSellingPrice = selectedProduct && !overridePriceInvalid ? overridePriceNumber ?? selectedDefaultPrice : null;
  const saleTotal =
    Number.isFinite(saleQuantity) && saleQuantity > 0 && !overridePriceInvalid && effectiveSellingPrice != null
      ? saleQuantity * effectiveSellingPrice
      : 0;
  const unitsToDeduct =
    selectedProduct && Number.isFinite(saleQuantity) && saleQuantity > 0
      ? sellType === "PACK"
        ? saleQuantity * selectedProduct.units_per_pack
        : saleQuantity
      : 0;
  const cartUnitsForSelectedProduct = selectedProduct
    ? cartItems
        .filter((item) => item.product_id === selectedProduct.id)
        .reduce((total, item) => total + item.units_sold, 0)
    : 0;
  const exceedsStock = selectedProduct && Number.isFinite(saleQuantity)
    ? unitsToDeduct + cartUnitsForSelectedProduct > selectedProduct.available_stock
    : false;
  const saleQuantityInvalid = !Number.isFinite(saleQuantity) || saleQuantity <= 0;
  const saleQuantityFractional = Number.isFinite(saleQuantity) && !Number.isInteger(saleQuantity);
  const saleQuantityBlocked = saleQuantityInvalid || saleQuantityFractional;
  const saveSaleDisabled =
    !activePharmacyId ||
    !selectedProduct ||
    selectedDefaultPrice == null ||
    saleQuantityBlocked ||
    overridePriceInvalid ||
    exceedsStock ||
    selectedProduct.available_stock <= 0;
  const cartTotal = cartItems.reduce((total, item) => total + item.total_sale, 0);
  const packsReceivedNumber = Number(packsReceived);
  const buyingPricePerPackNumber = Number(buyingPricePerPack);
  const packsReceivedInvalid = !Number.isInteger(packsReceivedNumber) || packsReceivedNumber <= 0;
  const buyingPricePerPackInvalid = !Number.isFinite(buyingPricePerPackNumber) || buyingPricePerPackNumber < 0;
  const expiryDateInvalid = expiryDate !== "" && !isValidIsoDate(expiryDate);
  const expiryBatches = useMemo(() => {
    const text = expirySearch.trim().toLowerCase();

    return [...dashboardData.batches]
      .filter((batch) => {
        const matchesText = !text || batch.product.product_name.toLowerCase().includes(text);
        const matchesStatus = expiryStatus === "ALL" || batch.expiry_status === expiryStatus;

        return matchesText && matchesStatus;
      })
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  }, [dashboardData.batches, expirySearch, expiryStatus]);
  const groupedSales = useMemo(() => {
    const groups = new Map<string, SaleGroup>();

    for (const sale of dashboardData.sales) {
      const key = sale.transaction_id || sale.id;
      const existing = groups.get(key);

      if (existing) {
        existing.lines.push(sale);
        existing.totalSale += sale.total_sale;
        existing.unitsSold += sale.units_sold;
        existing.hasOverride ||= sale.override_flag === "OVERRIDDEN";
      } else {
        groups.set(key, {
          key,
          transactionId: sale.transaction_id,
          createdAt: sale.created_at,
          lines: [sale],
          totalSale: sale.total_sale,
          unitsSold: sale.units_sold,
          hasOverride: sale.override_flag === "OVERRIDDEN",
        });
      }
    }

    const text = salesSearch.trim().toLowerCase();
    return [...groups.values()].filter((transaction) =>
      transaction.lines.some((sale) => {
        const matchesText = !text || sale.product.product_name.toLowerCase().includes(text);
        const matchesDate = !salesDate || sale.created_at.slice(0, 10) === salesDate;
        const matchesFlag = salesOverrideFlag === "ALL" || sale.override_flag === salesOverrideFlag;
        return matchesText && matchesDate && matchesFlag;
      }),
    );
  }, [dashboardData.sales, salesDate, salesOverrideFlag, salesSearch]);
  const groupedSaleLineCount = groupedSales.reduce((total, transaction) => total + transaction.lines.length, 0);
  const productsByName = useMemo(
    () => new Map(dashboardData.products.map((product) => [product.product_name.toLowerCase(), product])),
    [dashboardData.products],
  );
  const existingBatchKeys = useMemo(
    () => new Set(dashboardData.batches.map((batch) => getImportBatchKey(batch.product_id, batch.batch_number, batch.expiry_date))),
    [dashboardData.batches],
  );
  const canViewFinancials = activeUser?.role === "OWNER" || activeUser?.role === "PHARMACIST";
  const showOnboardingBanner = activeUser?.role === "OWNER" && initialOnboarding && !initialOnboarding.completed;
  const kpiCards = useMemo(
    () => [
      {
        label: "Total Products",
        value: String(dashboardData.stats.total_products),
        detail: "Products in catalog",
        onClick: () => setActiveTab("products" as Tab),
        tone: "slate" as const,
      },
      {
        label: "Low Stock Items",
        value: String(dashboardData.stats.low_stock_items),
        detail: "At or below reorder level",
        onClick: () => setActiveTab("products" as Tab),
        tone: "yellow" as const,
      },
      {
        label: "Out of Stock Items",
        value: String(dashboardData.stats.out_of_stock_items),
        detail: "Available stock is zero",
        onClick: () => setActiveTab("products" as Tab),
        tone: "rose" as const,
      },
      {
        label: "Reorder Levels Needed",
        value: String(dashboardData.stats.reorder_level_unconfigured_items),
        detail: "Configure product minimums",
        onClick: () => {
          setProductStockStatus("REORDER_UNCONFIGURED");
          setActiveTab("products" as Tab);
        },
        tone: "slate" as const,
      },
      {
        label: "Expiring Soon Batches",
        value: String(dashboardData.stats.expiring_soon_batches),
        detail: `Within ${dashboardData.stats.expiry_warning_days} days`,
        onClick: () => setActiveTab("expiry" as Tab),
        tone: "orange" as const,
      },
      {
        label: "Total Inventory Value",
        value: formatTZS(dashboardData.stats.total_inventory_value),
        detail: "Available stock at unit cost",
        onClick: () => setActiveTab("products" as Tab),
        tone: "emerald" as const,
      },
      {
        label: "Today's Sales",
        value: formatTZS(dashboardData.stats.todays_sales),
        detail: "Sales recorded today",
        onClick: () => setActiveTab("sales" as Tab),
        tone: "blue" as const,
      },
      {
        label: "This Month's Sales",
        value: formatTZS(dashboardData.stats.month_sales),
        detail: "Month-to-date revenue",
        onClick: () => setActiveTab("sales" as Tab),
        tone: "blue" as const,
      },
      ...(canViewFinancials
        ? [
            {
              label: "Today's Gross Profit",
              value: formatTZS(dashboardData.stats.todays_gross_profit),
              detail: dashboardData.stats.todays_profit_incomplete_sales
                ? `${dashboardData.stats.todays_profit_incomplete_sales} sale(s) missing exact COGS`
                : "Exact batch COGS",
              onClick: () => setActiveTab("sales" as Tab),
              tone: "emerald" as const,
            },
            {
              label: "This Month's Gross Profit",
              value: formatTZS(dashboardData.stats.month_gross_profit),
              detail: dashboardData.stats.month_profit_incomplete_sales
                ? `${dashboardData.stats.month_profit_incomplete_sales} sale(s) missing exact COGS`
                : "Exact batch COGS",
              onClick: () => setActiveTab("sales" as Tab),
              tone: "emerald" as const,
            },
            {
              label: "This Month's Expenses",
              value: formatTZS(dashboardData.stats.month_expenses),
              detail: "Operating costs this month",
              onClick: () => router.push("/expenses"),
              tone: "rose" as const,
            },
            {
              label: "This Month's Net Profit",
              value: formatTZS(dashboardData.stats.month_net_profit),
              detail: "Gross profit less expenses",
              onClick: () => router.push("/expenses"),
              tone: "slate" as const,
            },
          ]
        : []),
    ],
    [canViewFinancials, dashboardData.stats, router],
  );
  const stockBatchDuplicate =
    batchProduct && batchNumber.trim() && isValidIsoDate(expiryDate)
      ? existingBatchKeys.has(getImportBatchKey(batchProduct.id, batchNumber, expiryDate))
      : false;
  const stockFormInvalid =
    !batchProduct ||
    !batchProductSearch.trim() ||
    !batchNumber.trim() ||
    !expiryDate ||
    expiryDateInvalid ||
    packsReceivedInvalid ||
    buyingPricePerPackInvalid ||
    stockBatchDuplicate;
  const saveStockDisabled = isSavingStock || !activePharmacyId || stockFormInvalid;
  const activePharmacy = pharmacies.find((pharmacy) => pharmacy.id === activePharmacyId) || null;
  const subscriptionWarning = activePharmacy ? getPharmacyExpiryWarning(activePharmacy) : null;

  async function loadPharmacyData(pharmacyId: string) {
    if (!pharmacyId) {
      setDashboardData({
        stats: {
          total_products: 0,
          low_stock_items: 0,
          out_of_stock_items: 0,
          reorder_level_unconfigured_items: 0,
          expiring_soon_batches: 0,
          expiry_warning_days: 30,
          total_inventory_value: 0,
          todays_sales: 0,
          month_sales: 0,
          todays_gross_profit: 0,
          month_gross_profit: 0,
          month_expenses: 0,
          month_net_profit: 0,
          todays_profit_incomplete_sales: 0,
          month_profit_incomplete_sales: 0,
          best_selling_products: [],
        },
        products: [],
        batches: [],
        expiringBatches: [],
        sales: [],
        adjustments: [],
      });
      return;
    }

    setIsLoadingPharmacy(true);
    setPharmacyMessage("");

    try {
      const response = await fetch("/api/dashboard");
      const result = await response.json();

      if (!response.ok) {
        const message = result.error || "Unable to load pharmacy data.";
        setPharmacyMessage(message);
        setToast({ message, type: "error" });
        return;
      }

      setDashboardData(result.data as DashboardData);
      setSelectedProductId("");
      setCartItems([]);
      setBatchProductId("");
      setBatchProductSearch("");
      setIsBatchProductPickerOpen(false);
      setAdjustmentProductId("");
      setAdjustmentProductSearch("");
      setAdjustmentBatchId("");
      setProductImport(null);
      setBatchImport(null);
    } catch {
      const message = "Unable to load pharmacy data. Check your connection and try again.";
      setPharmacyMessage(message);
      setToast({ message, type: "error" });
    } finally {
      setIsLoadingPharmacy(false);
    }
  }

  async function submitPharmacy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPharmacyMessage("");

    if (!pharmacyName.trim() || !ownerName.trim() || !phone.trim() || !pharmacyCode.trim() || !pharmacyPassword) {
      const message = "Complete all pharmacy fields.";
      setPharmacyMessage(message);
      setToast({ message, type: "error" });
      return;
    }

    setIsCreatingPharmacy(true);

    try {
      const response = await fetch("/api/pharmacies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pharmacy_name: pharmacyName,
          owner_name: ownerName,
          phone,
          pharmacy_code: pharmacyCode,
          password: pharmacyPassword,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        const message = result.error || "Unable to create pharmacy.";
        setPharmacyMessage(message);
        setToast({ message, type: "error" });
        return;
      }

      const pharmacy = result.pharmacy as Pharmacy;
      setPharmacies((items) => [...items, pharmacy].sort((a, b) => a.pharmacy_name.localeCompare(b.pharmacy_name)));
      setActivePharmacyId(pharmacy.id);
      setPharmacyName("");
      setOwnerName("");
      setPhone("");
      setPharmacyCode("");
      setPharmacyPassword("");
      setToast({ message: `${pharmacy.pharmacy_name} created.`, type: "success" });
      await loadPharmacyData(pharmacy.id);
      router.refresh();
    } catch {
      const message = "Unable to create pharmacy. Check your connection and try again.";
      setPharmacyMessage(message);
      setToast({ message, type: "error" });
    } finally {
      setIsCreatingPharmacy(false);
    }
  }

  async function submitPharmacyLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPharmacyMessage("");

    if (!loginNameOrCode.trim() || !loginUsername.trim() || !loginPassword) {
      const message = "Enter pharmacy code, username, and password.";
      setPharmacyMessage(message);
      setToast({ message, type: "error" });
      return;
    }

    setIsLoggingIn(true);

    try {
      const response = await fetch("/api/pharmacy-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: loginNameOrCode,
          username: loginUsername,
          password: loginPassword,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        const message = result.error || "Invalid pharmacy login.";
        setPharmacyMessage(message);
        setToast({ message, type: "error" });
        return;
      }

      const pharmacy = result.pharmacy as Pharmacy;
      const user = result.user as PharmacyUser;
      setPharmacies([pharmacy]);
      setActivePharmacyId(pharmacy.id);
      setActiveUser(user);
      setLoginNameOrCode("");
      setLoginUsername("");
      setLoginPassword("");
      setToast({ message: `Logged in to ${pharmacy.pharmacy_name}.`, type: "success" });
      await loadPharmacyData(pharmacy.id);
      router.refresh();
    } catch {
      const message = "Unable to log in. Check your connection and try again.";
      setPharmacyMessage(message);
      setToast({ message, type: "error" });
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function logoutPharmacy() {
    try {
      const response = await fetch("/api/pharmacy-logout", { method: "POST" });
      const result = await response.json();

      if (!response.ok) {
        const message = result.error || "Unable to log out.";
        setToast({ message, type: "error" });
        return;
      }

      setActivePharmacyId("");
      setActiveUser(null);
      setPharmacies(isDebugMode ? initialPharmacies : []);
      await loadPharmacyData("");
      setToast({ message: "Pharmacy logged out.", type: "success" });
      router.refresh();
    } catch {
      setToast({ message: "Unable to log out. Check your connection and try again.", type: "error" });
    }
  }

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  function submitSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaleMessage("");
    setStockConfirmation("");

    if (!activePharmacyId) {
      const message = "Select a pharmacy before saving a sale.";
      setSaleMessage(message);
      setToast({ message, type: "error" });
      return;
    }

    if (!selectedProduct) return;
    if (saleQuantityBlocked) {
      setSaleMessage("Enter a valid quantity.");
      setToast({ message: "Quantity must be a whole number greater than zero.", type: "error" });
      return;
    }
    if (overridePriceInvalid) {
      setSaleMessage("Override price must be zero or greater.");
      setToast({ message: "Check the override price before saving.", type: "error" });
      return;
    }
    if (selectedDefaultPrice == null) {
      setSaleMessage("Price not set for this sell type.");
      setToast({ message: "Set a unit or pack default price before selling.", type: "error" });
      return;
    }
    if (exceedsStock) {
      const remainingStock = Math.max(0, selectedProduct.available_stock - cartUnitsForSelectedProduct);
      setSaleMessage(`Only ${remainingStock} more units are available after the items already in the cart.`);
      setToast({ message: "Sale blocked because stock is insufficient.", type: "error" });
      return;
    }

    const cartItem: CartItem = {
      id: crypto.randomUUID(),
      product_id: selectedProduct.id,
      product_name: selectedProduct.product_name,
      sell_type: sellType,
      quantity_entered: saleQuantity,
      units_sold: unitsToDeduct,
      unit_label: sellType === "PACK" ? selectedProduct.pack_type : selectedProduct.base_unit,
      default_price: selectedDefaultPrice,
      override_price: overridePriceNumber,
      effective_price: effectiveSellingPrice ?? selectedDefaultPrice,
      total_sale: saleTotal,
    };

    setCartItems((current) => {
      const existingIndex = current.findIndex(
        (item) =>
          item.product_id === cartItem.product_id &&
          item.sell_type === cartItem.sell_type &&
          item.override_price === cartItem.override_price,
      );

      if (existingIndex < 0) return [...current, cartItem];

      return current.map((item, index) =>
        index === existingIndex
          ? {
              ...item,
              quantity_entered: item.quantity_entered + cartItem.quantity_entered,
              units_sold: item.units_sold + cartItem.units_sold,
              total_sale: item.total_sale + cartItem.total_sale,
            }
          : item,
      );
    });

    setQuantity("1");
    setOverridePrice("");
    setQuery("");
    setSaleMessage(`${selectedProduct.product_name} added to the cart.`);
  }

  function removeCartItem(itemId: string) {
    setCartItems((current) => current.filter((item) => item.id !== itemId));
    setSaleMessage("");
  }

  function changeCartItemQuantity(itemId: string, change: number) {
    setCartItems((current) => {
      const target = current.find((item) => item.id === itemId);
      if (!target) return current;

      const nextQuantity = target.quantity_entered + change;
      if (nextQuantity <= 0) return current.filter((item) => item.id !== itemId);

      const product = dashboardData.products.find((candidate) => candidate.id === target.product_id);
      if (!product) return current;

      const unitsPerEntry = target.sell_type === "PACK" ? product.units_per_pack : 1;
      const nextUnits = nextQuantity * unitsPerEntry;
      const otherUnits = current
        .filter((item) => item.id !== itemId && item.product_id === target.product_id)
        .reduce((total, item) => total + item.units_sold, 0);

      if (nextUnits + otherUnits > product.available_stock) {
        setToast({ message: `Only ${product.available_stock} ${product.base_unit} are available.`, type: "error" });
        return current;
      }

      return current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity_entered: nextQuantity,
              units_sold: nextUnits,
              total_sale: nextQuantity * item.effective_price,
            }
          : item,
      );
    });
  }

  async function completeSale() {
    setSaleMessage("");

    if (!activePharmacyId) {
      setToast({ message: "Select a pharmacy before completing the sale.", type: "error" });
      return;
    }
    if (cartItems.length === 0) {
      setToast({ message: "Add at least one item to the cart.", type: "error" });
      return;
    }

    setIsSavingSale(true);

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map((item) => ({
            product_id: item.product_id,
            sell_type: item.sell_type,
            quantity_entered: item.quantity_entered,
            override_price: item.override_price,
          })),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        const message = result.error || "Unable to save sale.";
        setSaleMessage(message);
        setToast({ message, type: "error" });
        return;
      }

      const completedItemCount = cartItems.length;
      setCartItems([]);
      setSelectedProductId("");
      setQuery("");
      setQuantity("1");
      setOverridePrice("");
      setToast({ message: `Sale completed with ${completedItemCount} item${completedItemCount === 1 ? "" : "s"}.`, type: "success" });
      await loadPharmacyData(activePharmacyId);
      router.refresh();
    } catch {
      const message = "Unable to save sale. Check your connection and try again.";
      setSaleMessage(message);
      setToast({ message, type: "error" });
    } finally {
      setIsSavingSale(false);
    }
  }

  async function submitBatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStockMessage("");
    setStockConfirmation("");

    if (!activePharmacyId) {
      const message = "Select a pharmacy before adding stock.";
      setStockMessage(message);
      setToast({ message, type: "error" });
      return;
    }

    if (!batchProduct) return;
    if (stockBatchDuplicate) {
      setStockMessage(DUPLICATE_BATCH_MESSAGE);
      setToast({ message: DUPLICATE_BATCH_MESSAGE, type: "error" });
      return;
    }
    if (stockFormInvalid) {
      const message = "Complete all stock fields with valid values.";
      setStockMessage(message);
      setToast({ message, type: "error" });
      return;
    }

    setIsSavingStock(true);

    try {
      const response = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: batchProduct.id,
          batch_number: batchNumber,
          expiry_date: expiryDate,
          packs_received: packsReceived,
          buying_price_per_pack: buyingPricePerPack,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        const message = result.error || "Unable to save batch.";
        setStockMessage(message);
        setToast({ message, type: "error" });
        return;
      }

      const confirmation = `Stock added for ${batchProduct.product_name}.`;
      setBatchProductId("");
      setBatchProductSearch("");
      setIsBatchProductPickerOpen(false);
      setBatchNumber("");
      setExpiryDate("");
      setPacksReceived("");
      setBuyingPricePerPack("");
      setStockConfirmation(confirmation);
      setToast({ message: confirmation, type: "success" });
      await loadPharmacyData(activePharmacyId);
      router.refresh();
    } catch {
      const message = "Unable to save stock. Check your connection and try again.";
      setStockMessage(message);
      setToast({ message, type: "error" });
    } finally {
      setIsSavingStock(false);
    }
  }

  async function submitAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdjustmentMessage("");
    if (!activePharmacyId || adjustmentFormInvalid) return;

    setIsSavingAdjustment(true);
    try {
      const response = await fetch("/api/inventory-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: adjustmentProduct.id,
          inventory_batch_id: adjustmentBatchId || null,
          reason: adjustmentReason,
          quantity: adjustmentQuantityNumber,
          note: adjustmentNote,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const message = result.error || "Unable to record the adjustment.";
        setAdjustmentMessage(message);
        setToast({ message, type: "error" });
        return;
      }

      const message = adjustmentIsCustomerReturn
        ? "Customer return recorded in quarantine. Sellable stock was not increased."
        : `${adjustmentQuantityNumber} unit${adjustmentQuantityNumber === 1 ? "" : "s"} removed from sellable stock.`;
      setAdjustmentProductId("");
      setAdjustmentProductSearch("");
      setAdjustmentBatchId("");
      setAdjustmentQuantity("");
      setAdjustmentNote("");
      setAdjustmentReason("DAMAGED");
      setAdjustmentMessage(message);
      setToast({ message, type: "success" });
      await loadPharmacyData(activePharmacyId);
      router.refresh();
    } catch {
      const message = "Unable to record the adjustment. Check your connection and try again.";
      setAdjustmentMessage(message);
      setToast({ message, type: "error" });
    } finally {
      setIsSavingAdjustment(false);
    }
  }

  async function handleCsvFile(kind: ImportKind, file: File | null) {
    if (!file) return;
    if (!activePharmacyId) {
      setToast({ message: "Select a pharmacy before importing CSV files.", type: "error" });
      return;
    }

    const text = await file.text();
    const rows = parseCsv(text);
    const preview = validateImportRows(kind, rows, productsByName, existingBatchKeys);

    if (kind === "products") {
      setProductImport(preview);
    } else {
      setBatchImport(preview);
    }

    if (preview.missingColumns.length > 0) {
      setToast({ message: `Missing columns: ${preview.missingColumns.join(", ")}`, type: "error" });
    } else if (preview.errors.length > 0) {
      setToast({ message: "CSV has row errors to fix before import.", type: "error" });
    } else if (preview.warnings.length > 0) {
      setToast({ message: "CSV has duplicate batches to remove before import.", type: "error" });
    } else {
      setToast({ message: `Preview ready: ${preview.rows.length} rows.`, type: "success" });
    }
  }

  async function importCsv(kind: ImportKind) {
    const preview = kind === "products" ? productImport : batchImport;
    if (!preview || preview.rows.length === 0) return;
    if (!activePharmacyId) {
      setToast({ message: "Select a pharmacy before importing CSV files.", type: "error" });
      return;
    }
    if (preview.missingColumns.length || preview.errors.length || preview.warnings.length) {
      setToast({ message: "Fix CSV errors before importing.", type: "error" });
      return;
    }

    const setLoading = kind === "products" ? setIsImportingProducts : setIsImportingBatches;
    setLoading(true);

    try {
      const response = await fetch(`/api/import/${kind === "products" ? "products" : "batches"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows }),
      });
      const result = await response.json();

      if (!response.ok) {
        const rowErrors = Array.isArray(result.rowErrors) ? result.rowErrors : preview.errors;
        const duplicateWarnings = Array.isArray(result.duplicateRows) ? result.duplicateRows : preview.warnings;
        const nextPreview = { ...preview, errors: rowErrors, warnings: duplicateWarnings };
        if (kind === "products") setProductImport(nextPreview);
        else setBatchImport(nextPreview);
        setToast({ message: result.error || "Unable to import CSV.", type: "error" });
        return;
      }

      if (kind === "products") setProductImport(null);
      else setBatchImport(null);
      setToast({ message: `Imported ${result.imported || 0} ${kind === "products" ? "products" : "batches"}.`, type: "success" });
      await loadPharmacyData(activePharmacyId);
      router.refresh();
    } catch {
      setToast({ message: "Unable to import CSV. Check the file and try again.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  function exportCsv(kind: "products" | "stock" | "sales" | "expiry") {
    if (kind === "products") {
      downloadCsv(
        "products.csv",
        buildCsv(
          [...PRODUCT_IMPORT_COLUMNS],
          dashboardData.products.map((product) => [
            product.product_name,
            product.generic_name,
            product.brand_name,
            product.dosage_form,
            product.base_unit,
            product.pack_type,
            product.units_per_pack,
            product.selling_mode,
            product.default_unit_price,
            product.default_pack_price,
            product.reorder_level ?? "",
          ]),
        ),
      );
    }

    if (kind === "stock") {
      downloadCsv(
        "stock-summary.csv",
        buildCsv(
          ["product_name", "generic_name", "total_received", "total_sold", "available_stock", "reorder_level", "reorder_level_configured", "stock_status"],
          dashboardData.products.map((product) => [
            product.product_name,
            product.generic_name,
            product.total_received,
            product.total_sold,
            product.available_stock,
            product.reorder_level ?? "",
            product.reorder_level_configured ? "Yes" : "No",
            product.stock_status ?? "",
          ]),
        ),
      );
    }

    if (kind === "sales") {
      downloadCsv(
        "sales.csv",
        buildCsv(
          ["product_name", "sell_type", "quantity_entered", "units_sold", "default_price", "override_price", "effective_price", "total_sale", "override_flag", "created_at"],
          dashboardData.sales.map((sale) => [
            sale.product.product_name,
            sale.sell_type,
            sale.quantity_entered,
            sale.units_sold,
            sale.default_price,
            sale.override_price,
            sale.effective_price,
            sale.total_sale,
            sale.override_flag,
            sale.created_at,
          ]),
        ),
      );
    }

    if (kind === "expiry") {
      downloadCsv(
        "expiry.csv",
        buildCsv(
          [
            "product_name",
            "batch_number",
            "expiry_date",
            "expiry_status",
            "days_to_expiry",
            "packs_received",
            "total_units_received",
            "buying_price_per_pack",
            "derived_unit_cost",
          ],
          dashboardData.batches.map((batch) => [
            batch.product.product_name,
            batch.batch_number,
            batch.expiry_date,
            batch.expiry_status,
            batch.days_to_expiry,
            batch.packs_received,
            batch.total_units_received,
            batch.buying_price_per_pack,
            batch.derived_unit_cost,
          ]),
        ),
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      {toast ? (
        <div className={`fixed left-4 right-4 top-4 z-50 mx-auto max-w-md rounded-md border px-4 py-3 text-sm font-bold shadow-lg sm:left-auto sm:right-6 sm:mx-0 ${TOAST_CLASSES[toast.type]}`}>
          {toast.message}
        </div>
      ) : null}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Pharmacy POS</p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">PharmaStock MVP</h1>
            </div>
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm">
                  <p className="text-xs font-bold uppercase text-emerald-700">Active pharmacy</p>
                  <p className="mt-1 font-bold text-emerald-950">{activePharmacy?.pharmacy_name || "Not logged in"}</p>
                  {activeUser ? <p className="mt-1 text-xs font-bold uppercase text-emerald-700">{activeUser.full_name} / {activeUser.role}</p> : null}
                </div>
                {activePharmacyId && !isDebugMode ? (
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Link className="rounded-md border border-emerald-200 bg-white px-4 py-3 text-center text-sm font-bold text-emerald-800" href="/settings">
                      Settings
                    </Link>
                    <Link className="rounded-md border border-emerald-200 bg-white px-4 py-3 text-center text-sm font-bold text-emerald-800" href="/reports">
                      Reports
                    </Link>
                    <Link className="relative rounded-md border border-emerald-200 bg-white px-4 py-3 text-center text-sm font-bold text-emerald-800" href="/notifications">
                      Notifications
                      {initialNotificationCounts?.unread_active ? (
                        <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-black text-white">{initialNotificationCounts.unread_active}</span>
                      ) : null}
                    </Link>
                    {canViewFinancials ? (
                      <Link className="rounded-md border border-emerald-200 bg-white px-4 py-3 text-center text-sm font-bold text-emerald-800" href="/expenses">
                        Expenses
                      </Link>
                    ) : null}
                    {activeUser?.role === "OWNER" ? (
                      <>
                        <Link className="rounded-md border border-emerald-200 bg-white px-4 py-3 text-center text-sm font-bold text-emerald-800" href="/activity">
                          Activity
                        </Link>
                        <Link className="rounded-md border border-emerald-200 bg-white px-4 py-3 text-center text-sm font-bold text-emerald-800" href="/backup">
                          Backup
                        </Link>
                        <Link className="rounded-md border border-emerald-200 bg-white px-4 py-3 text-center text-sm font-bold text-emerald-800" href="/staff">
                          Staff
                        </Link>
                        <Link className="rounded-md border border-emerald-200 bg-white px-4 py-3 text-center text-sm font-bold text-emerald-800" href="/onboarding">
                          Setup
                        </Link>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={logoutPharmacy}
                      className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800"
                    >
                      Log out
                    </button>
                  </div>
                ) : null}
              </div>
              {isLoadingPharmacy ? <p className="mt-2 text-sm font-semibold text-slate-600">Loading pharmacy records...</p> : null}
              {subscriptionWarning ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                  {subscriptionWarning}
                </p>
              ) : null}
              {showOnboardingBanner ? (
                <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-blue-950">Setup incomplete: {initialOnboarding.percent}% ready</p>
                      <p className="mt-1 text-sm font-semibold text-blue-900">
                        {getOnboardingBannerMessage(initialOnboarding)}
                      </p>
                    </div>
                    <Link className="rounded-md bg-blue-700 px-4 py-3 text-center text-sm font-bold text-white" href="/onboarding">
                      Continue Setup
                    </Link>
                  </div>
                </div>
              ) : null}
              {pharmacyMessage ? <p className="mt-2 text-sm font-semibold text-rose-700">{pharmacyMessage}</p> : null}
            </section>
            {!activePharmacyId ? (
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-bold">Pharmacy Login</h2>
                <form className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={submitPharmacyLogin}>
                  <Input label="Pharmacy code" value={loginNameOrCode} onChange={setLoginNameOrCode} />
                  <Input label="Username" value={loginUsername} onChange={setLoginUsername} />
                  <Input label="Password" value={loginPassword} onChange={setLoginPassword} type="password" />
                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="self-end rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isLoggingIn ? "Logging in..." : "Log In"}
                  </button>
                </form>
              </section>
            ) : null}
            {isDebugMode ? (
              <section className="rounded-lg border-2 border-red-200 bg-red-50 p-3">
                <div className="rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-red-900">
                  <p className="text-sm font-black uppercase">MULTI PHARMACY DEBUG</p>
                  <p className="mt-1 text-sm font-bold">Development admin mode is enabled.</p>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
                  <div className="grid gap-3">
                    <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm">
                      <p className="text-xs font-bold uppercase text-emerald-700">Active pharmacy name</p>
                      <p className="mt-1 font-bold text-emerald-950">{activePharmacy?.pharmacy_name || "No pharmacy selected"}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">Pharmacy count: {pharmacies.length}</p>
                      <p className="mt-1 text-sm font-semibold text-rose-700">
                        {pharmacies.length === 0 ? "No pharmacies found." : "Pharmacies loaded."}
                      </p>
                    </div>
                    <label className="block text-sm font-semibold">
                      Select pharmacy
                      <select
                        value={activePharmacyId}
                        onChange={async (event) => {
                          const nextPharmacyId = event.target.value;
                          setActivePharmacyId(nextPharmacyId);
                          await loadPharmacyData(nextPharmacyId);
                        }}
                        disabled={isLoadingPharmacy}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600 disabled:bg-slate-100"
                      >
                        <option value="">{pharmacies.length === 0 ? "No pharmacies yet" : "Choose pharmacy"}</option>
                        {pharmacies.map((pharmacy) => (
                          <option key={pharmacy.id} value={pharmacy.id}>
                            {pharmacy.pharmacy_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <form className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr] lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]" onSubmit={submitPharmacy}>
                    <Input label="Pharmacy name" value={pharmacyName} onChange={setPharmacyName} />
                    <Input label="Owner" value={ownerName} onChange={setOwnerName} />
                    <Input label="Phone" value={phone} onChange={setPhone} />
                    <Input label="Access code" value={pharmacyCode} onChange={setPharmacyCode} />
                    <Input label="Password" value={pharmacyPassword} onChange={setPharmacyPassword} type="password" />
                    <button
                      type="submit"
                      disabled={isCreatingPharmacy}
                      className="self-end rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isCreatingPharmacy ? "Adding..." : "Add Pharmacy"}
                    </button>
                  </form>
                </div>
              </section>
            ) : null}
          </div>
          {activePharmacyId || isDebugMode ? (
            <nav className="grid grid-cols-2 gap-2 sm:flex">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {!activePharmacyId && !isDebugMode ? (
          <EmptyState text="Log in with a pharmacy code or pharmacy name to view pharmacy records." />
        ) : null}

        {activePharmacyId || isDebugMode ? (
          <>
        {activeTab === "dashboard" ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold tracking-tight">Dashboard</h2>
              <p className="text-sm font-medium text-slate-600">A quick stock, expiry, and sales snapshot.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {kpiCards.map((card) => (
                <KpiCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  detail={card.detail}
                  tone={card.tone}
                  onClick={card.onClick}
                />
              ))}
            </div>

            {dashboardData.products.length === 0 ? (
              <EmptyState text="No products yet. Add products before the dashboard can show stock value." />
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold">Best-Selling Products</h3>
                  <button type="button" onClick={() => setActiveTab("sales")} className="text-sm font-bold text-emerald-700">
                    Sales
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  {dashboardData.stats.best_selling_products.length ? (
                    dashboardData.stats.best_selling_products.map((product) => (
                      <div key={product.product_id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                        <div>
                          <p className="font-semibold">{product.product_name}</p>
                          <p className="text-sm text-slate-600">{product.units_sold} units sold this month</p>
                        </div>
                        <p className="text-sm font-black text-slate-950">{formatTZS(product.total_sale)}</p>
                      </div>
                    ))
                  ) : (
                    <EmptyState text="No sales recorded this month." />
                  )}
                </div>
              </article>

              {canViewFinancials ? (
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold">Profit Snapshot</h3>
                    <Link href="/expenses" className="text-sm font-bold text-emerald-700">
                      Expenses
                    </Link>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-xs font-bold uppercase text-emerald-700">This month gross profit</p>
                      <p className="mt-1 text-xl font-black text-emerald-950">{formatTZS(dashboardData.stats.month_gross_profit)}</p>
                      {dashboardData.stats.month_profit_incomplete_sales ? (
                        <p className="mt-1 text-xs font-semibold text-amber-700">
                          {dashboardData.stats.month_profit_incomplete_sales} sale(s) missing exact COGS.
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-xs font-bold uppercase text-rose-700">This month expenses</p>
                      <p className="mt-1 text-xl font-black text-rose-950">{formatTZS(dashboardData.stats.month_expenses)}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-bold uppercase text-slate-600">This month net profit</p>
                      <p className="mt-1 text-xl font-black text-slate-950">{formatTZS(dashboardData.stats.month_net_profit)}</p>
                    </div>
                  </div>
                </article>
              ) : null}

              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold">Stock Attention</h3>
                  <button type="button" onClick={() => setActiveTab("products")} className="text-sm font-bold text-emerald-700">
                    Products
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  {dashboardData.products.filter((product) => product.stock_status !== "OK").length ? (
                    dashboardData.products
                      .filter((product) => product.stock_status !== "OK")
                      .slice(0, 5)
                      .map((product) => (
                        <div key={product.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                          <div>
                            <p className="font-semibold">{product.product_name}</p>
                            <p className="text-sm text-slate-600">{product.available_stock} {product.base_unit} available</p>
                          </div>
                          <ProductStockBadges product={product} />
                        </div>
                      ))
                  ) : (
                    <EmptyState text="No low or out of stock products." />
                  )}
                </div>
              </article>

              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold">Expiry Attention</h3>
                  <button type="button" onClick={() => setActiveTab("expiry")} className="text-sm font-bold text-emerald-700">
                    Expiry
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  {dashboardData.expiringBatches.length ? (
                    dashboardData.expiringBatches.slice(0, 5).map((batch) => (
                      <div key={batch.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                        <div>
                          <p className="font-semibold">{batch.product.product_name}</p>
                          <p className="text-sm text-slate-600">Batch {batch.batch_number} expires {batch.expiry_date}</p>
                        </div>
                        <StatusBadge value={batch.expiry_status} />
                      </div>
                    ))
                  ) : (
                    <EmptyState text="No expired or expiring soon batches." />
                  )}
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {activeTab === "sell" ? (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold">Sell</h2>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product, generic, or brand"
                className="mt-4 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
              />
              <div className="mt-4 grid gap-2">
                {dashboardData.products.length === 0 ? (
                  <EmptyState text="No products found. Add products in Supabase to start selling." />
                ) : null}
                {dashboardData.products.length > 0 && query.trim() && filteredProducts.length === 0 ? (
                  <EmptyState text="No products match your search." />
                ) : null}
                {filteredProducts.slice(0, 20).map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    sellType={getProductSellType(product, preferredSellType)}
                    selected={product.id === selectedProduct?.id}
                    onSelect={() => {
                      setSelectedProductId(product.id);
                      setQuery("");
                      setSaleMessage("");
                    }}
                  />
                ))}
                {filteredProducts.length > 20 ? (
                  <p className="text-sm font-semibold text-slate-500">
                    Showing 20 of {filteredProducts.length} matches. Type more letters to narrow the list.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold">Sale Ticket</h2>
              {selectedProduct ? (
                <form className="mt-4 space-y-4" onSubmit={submitSale}>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="font-semibold">{selectedProduct.product_name}</p>
                    <p className="text-sm text-slate-600">{selectedProduct.generic_name} - {selectedProduct.dosage_form}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Metric label="Available" value={`${selectedProduct.available_stock} ${selectedProduct.base_unit}`} />
                      <Metric label="Default price" value={formatOptionalTZS(selectedDefaultPrice)} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Sell by</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={selectedProduct.selling_mode === "PACK"}
                        onClick={() => setPreferredSellType("UNIT")}
                        className={`rounded-md border px-3 py-2 text-sm font-bold ${
                          sellType === "UNIT" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white text-slate-700"
                        } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
                      >
                        Unit
                      </button>
                      <button
                        type="button"
                        disabled={selectedProduct.selling_mode === "UNIT"}
                        onClick={() => setPreferredSellType("PACK")}
                        className={`rounded-md border px-3 py-2 text-sm font-bold ${
                          sellType === "PACK" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white text-slate-700"
                        } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
                      >
                        Pack
                      </button>
                    </div>
                  </div>
                  <label className="block text-sm font-semibold">
                    Quantity ({sellType === "PACK" ? selectedProduct.pack_type : selectedProduct.base_unit})
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Override selling price
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={overridePrice}
                      onChange={(event) => setOverridePrice(event.target.value)}
                      placeholder="Optional"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                    />
                    <span className="mt-1 block text-xs font-medium text-slate-500">
                      {sellType === "PACK" ? "Price per pack" : "Price per unit"}
                    </span>
                  </label>
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-emerald-900">Live total</span>
                      <span className="text-xl font-bold text-emerald-950">{formatTZS(saleTotal)}</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-emerald-800">
                      {quantity || "0"} x {formatOptionalTZS(effectiveSellingPrice)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-emerald-800">
                      Units deducted: {unitsToDeduct}
                    </p>
                  </div>
                  {exceedsStock ? (
                    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                      Cannot add {unitsToDeduct} units. The cart already contains {cartUnitsForSelectedProduct} units and only {selectedProduct.available_stock} are available.
                    </p>
                  ) : null}
                  {saleQuantityFractional ? (
                    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                      Quantity must be a whole number.
                    </p>
                  ) : null}
                  {saleQuantityInvalid ? (
                    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                      Quantity must be greater than zero.
                    </p>
                  ) : null}
                  {overridePriceInvalid ? (
                    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                      Override price must be zero or greater.
                    </p>
                  ) : null}
                  {selectedDefaultPrice == null ? (
                    <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                      Price not set for {sellType === "PACK" ? "pack" : "unit"} sales.
                    </p>
                  ) : null}
                  {saleMessage ? <p className="text-sm font-semibold text-slate-700">{saleMessage}</p> : null}
                  <button
                    type="submit"
                    disabled={saveSaleDisabled}
                    className="w-full rounded-md bg-emerald-700 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Add to Cart
                  </button>
                </form>
              ) : (
                <p className="mt-4 text-slate-600">
                  {dashboardData.products.length === 0
                    ? "Add a product in Supabase to start selling."
                    : "Search for and select a medicine to prepare the sale."}
                </p>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">Current Sale</h2>
                  <p className="text-sm text-slate-600">{cartItems.length} cart item{cartItems.length === 1 ? "" : "s"}</p>
                </div>
                <p className="text-2xl font-black text-emerald-800">{formatTZS(cartTotal)}</p>
              </div>

              {cartItems.length === 0 ? (
                <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                  Search for a medicine, prepare its quantity, and add it to the cart.
                </p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {cartItems.map((item) => (
                    <article key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold">{item.product_name}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {item.sell_type === "PACK" ? "Pack" : "Unit"} · {formatTZS(item.effective_price)} each
                            {item.override_price !== null ? " · Price overridden" : ""}
                          </p>
                        </div>
                        <p className="text-lg font-black">{formatTZS(item.total_sale)}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Reduce ${item.product_name} quantity`}
                          onClick={() => changeCartItemQuantity(item.id, -1)}
                          className="min-h-11 min-w-11 rounded-md border border-slate-300 bg-white text-xl font-bold"
                        >
                          −
                        </button>
                        <span className="min-w-24 text-center text-sm font-bold">
                          {item.quantity_entered} {item.unit_label}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase ${item.product_name} quantity`}
                          onClick={() => changeCartItemQuantity(item.id, 1)}
                          className="min-h-11 min-w-11 rounded-md border border-slate-300 bg-white text-xl font-bold"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCartItem(item.id)}
                          className="ml-auto min-h-11 rounded-md border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={cartItems.length === 0 || isSavingSale}
                onClick={completeSale}
                className="mt-4 w-full rounded-md bg-emerald-700 px-4 py-3.5 text-base font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSavingSale ? "Completing Sale..." : `Complete Sale · ${formatTZS(cartTotal)}`}
              </button>
              <p className="mt-2 text-center text-xs font-semibold text-slate-500">
                Stock is rechecked and the entire cart is saved together.
              </p>
            </section>
          </div>
        ) : null}

        {activeTab === "products" ? (
          <section className="grid gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold">Products</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search product or generic name"
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                />
                <select
                  value={productStockStatus}
                  onChange={(event) => setProductStockStatus(event.target.value as ProductStockFilter)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                >
                  <option value="ALL">All stock statuses</option>
                  <option value="OK">OK</option>
                  <option value="LOW STOCK">Low stock</option>
                  <option value="OUT OF STOCK">Out of stock</option>
                  <option value="REORDER_UNCONFIGURED">Reorder level not configured</option>
                </select>
              </div>
              {dashboardData.products.length ? (
                <p className="mt-3 text-sm font-semibold text-slate-600">{filteredProductList.length} of {dashboardData.products.length} products</p>
              ) : null}
            </div>

            {dashboardData.products.length > 0 && filteredProductList.length === 0 ? (
              <EmptyState text="No products match the current search and stock filter." />
            ) : null}

            {dashboardData.products.length ? filteredProductList.map((product) => (
              <article key={product.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-bold">{product.product_name}</h2>
                    <p className="text-sm text-slate-600">{product.generic_name} - {product.brand_name} - {product.dosage_form}</p>
                  </div>
                  <ProductStockBadges product={product} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Available" value={String(product.available_stock)} />
                  <Metric label="Received" value={String(product.total_received)} />
                  <Metric label="Sold" value={String(product.total_sold)} />
                  <Metric label="Adjusted" value={String(product.total_adjusted)} />
                  <Metric label="Unit cost" value={product.derived_unit_cost == null ? "-" : formatTZS(product.derived_unit_cost)} />
                  <Metric label="Reorder" value={product.reorder_level == null ? "Not configured" : String(product.reorder_level)} />
                </div>
                {!product.reorder_level_configured ? (
                  <ReorderLevelForm productId={product.id} initialReorderLevel={product.reorder_level} onSaved={() => loadPharmacyData(activePharmacyId)} />
                ) : null}
                <Link className="mt-4 inline-block text-sm font-bold text-emerald-700" href={`/products/${product.id}`}>
                  Product detail
                </Link>
              </article>
            )) : <EmptyState text="No products yet. Add product records in Supabase to begin tracking stock." />}
          </section>
        ) : null}

        {activeTab === "stock" ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold">Add Stock</h2>
            {dashboardData.products.length === 0 ? <div className="mt-4"><EmptyState text="No products available for stock entry." /></div> : null}
            {dashboardData.products.length ? <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submitBatch}>
              <div className="sm:col-span-2">
                <label htmlFor="stock-product-search" className="block text-sm font-semibold">Product</label>
                <div className="relative mt-1">
                  <input
                    id="stock-product-search"
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    enterKeyHint="search"
                    value={batchProductSearch}
                    onFocus={(event) => {
                      setIsBatchProductPickerOpen(true);
                      if (batchProduct) event.currentTarget.select();
                    }}
                    onChange={(event) => {
                      setBatchProductSearch(event.target.value);
                      setBatchProductId("");
                      setIsBatchProductPickerOpen(true);
                    }}
                    placeholder="Search product, generic, brand, or strength"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="stock-product-results"
                    aria-expanded={isBatchProductPickerOpen}
                    className="w-full rounded-md border border-slate-300 px-4 py-3.5 pr-12 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                  {batchProductSearch ? (
                    <button
                      type="button"
                      aria-label="Clear stock product search"
                      onClick={() => {
                        setBatchProductSearch("");
                        setBatchProductId("");
                        setIsBatchProductPickerOpen(true);
                      }}
                      className="absolute right-2 top-1/2 min-h-10 min-w-10 -translate-y-1/2 rounded-md text-xl font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                {isBatchProductPickerOpen ? (
                  <div id="stock-product-results" role="listbox" aria-label="Stock product search results" className="mt-2 grid max-h-[45vh] gap-2 overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-slate-50 p-2">
                    {filteredBatchProducts.length === 0 ? (
                      <EmptyState text={`No product matches “${batchProductSearch.trim()}”.`} />
                    ) : null}
                    {filteredBatchProducts.slice(0, 20).map((product) => (
                      <StockProductOption
                        key={product.id}
                        product={product}
                        selected={product.id === batchProductId}
                        onSelect={() => {
                          setBatchProductId(product.id);
                          setBatchProductSearch(product.product_name);
                          setIsBatchProductPickerOpen(false);
                          setStockMessage("");
                        }}
                      />
                    ))}
                    {filteredBatchProducts.length > 20 ? (
                      <p className="px-2 py-1 text-center text-xs font-semibold text-slate-500">
                        Showing 20 of {filteredBatchProducts.length} matches. Type more letters to narrow the list.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {!batchProductId ? (
                  <p className="mt-2 text-xs font-semibold text-amber-700">Select a product from the search results.</p>
                ) : null}
              </div>
              <Input label="Batch number" value={batchNumber} onChange={setBatchNumber} />
              <Input label="Expiry date" value={expiryDate} onChange={setExpiryDate} type="date" />
              <Input label="Packs received" value={packsReceived} onChange={setPacksReceived} type="number" min="1" />
              <Input label="Buying price per pack" value={buyingPricePerPack} onChange={setBuyingPricePerPack} type="number" min="0" step="0.01" />
              <div className="rounded-md bg-slate-50 p-3 text-sm sm:col-span-2">
                Units per pack: <strong>{batchProduct?.units_per_pack || 0}</strong>
              </div>
              {expiryDateInvalid ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 sm:col-span-2">
                  Enter a valid expiry date.
                </p>
              ) : null}
              {packsReceived !== "" && packsReceivedInvalid ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 sm:col-span-2">
                  Packs received must be a whole number greater than zero.
                </p>
              ) : null}
              {buyingPricePerPack !== "" && buyingPricePerPackInvalid ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 sm:col-span-2">
                  Buying price per pack must be zero or greater.
                </p>
              ) : null}
              {stockBatchDuplicate ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 sm:col-span-2">
                  {DUPLICATE_BATCH_MESSAGE}
                </p>
              ) : null}
              {stockConfirmation ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 sm:col-span-2">
                  {stockConfirmation}
                </p>
              ) : null}
              {stockMessage ? <p className="text-sm font-semibold text-slate-700 sm:col-span-2">{stockMessage}</p> : null}
              <button
                className="rounded-md bg-emerald-700 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 sm:col-span-2"
                type="submit"
                disabled={saveStockDisabled}
              >
                {isSavingStock ? "Saving Stock..." : "Save Batch"}
              </button>
            </form> : null}
          </section>
        ) : null}

        {activeTab === "adjust" ? (
          <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold">Adjust Stock</h2>
              <p className="mt-1 text-sm text-slate-600">Record stock that cannot be sold or does not match the physical count.</p>
              <form className="mt-4 grid gap-4" onSubmit={submitAdjustment}>
                <div>
                  <label htmlFor="adjustment-product-search" className="block text-sm font-semibold">Medicine</label>
                  <div className="relative mt-1">
                    <input
                      id="adjustment-product-search"
                      type="search"
                      autoComplete="off"
                      value={adjustmentProductSearch}
                      onFocus={() => setIsAdjustmentPickerOpen(true)}
                      onChange={(event) => {
                        setAdjustmentProductSearch(event.target.value);
                        setAdjustmentProductId("");
                        setAdjustmentBatchId("");
                        setIsAdjustmentPickerOpen(true);
                      }}
                      placeholder="Search medicine, generic, or brand"
                      role="combobox"
                      aria-expanded={isAdjustmentPickerOpen}
                      aria-controls="adjustment-product-results"
                      className="w-full rounded-md border border-slate-300 px-4 py-3.5 text-base outline-none focus:border-emerald-600"
                    />
                  </div>
                  {isAdjustmentPickerOpen && adjustmentProductSearch.trim() ? (
                    <div id="adjustment-product-results" role="listbox" className="mt-2 grid max-h-64 gap-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2">
                      {filteredAdjustmentProducts.length === 0 ? <EmptyState text="No medicine matches your search." /> : null}
                      {filteredAdjustmentProducts.slice(0, 20).map((product) => (
                        <StockProductOption
                          key={product.id}
                          product={product}
                          selected={product.id === adjustmentProductId}
                          onSelect={() => {
                            setAdjustmentProductId(product.id);
                            setAdjustmentProductSearch(product.product_name);
                            setAdjustmentBatchId("");
                            setIsAdjustmentPickerOpen(false);
                            setAdjustmentMessage("");
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                <label className="text-sm font-semibold">
                  Reason
                  <select
                    value={adjustmentReason}
                    onChange={(event) => {
                      const reason = event.target.value as InventoryAdjustmentReason;
                      setAdjustmentReason(reason);
                      if (reason === "CUSTOMER_RETURN") setAdjustmentBatchId("");
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3"
                  >
                    {adjustmentReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                  </select>
                </label>

                <label className="text-sm font-semibold">
                  Batch {adjustmentIsCustomerReturn ? "(optional)" : ""}
                  <select
                    value={adjustmentBatchId}
                    disabled={!adjustmentProduct}
                    onChange={(event) => setAdjustmentBatchId(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-3 disabled:bg-slate-100"
                  >
                    <option value="">{adjustmentIsCustomerReturn ? "Unknown / not recorded" : "Choose batch"}</option>
                    {adjustmentBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.batch_number} · expires {batch.expiry_date} · {batch.available_stock} units available
                      </option>
                    ))}
                  </select>
                </label>

                <Input label="Quantity in units" value={adjustmentQuantity} onChange={setAdjustmentQuantity} type="number" min="1" step="1" />
                <label className="text-sm font-semibold">
                  Note (optional)
                  <textarea
                    value={adjustmentNote}
                    onChange={(event) => setAdjustmentNote(event.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="What happened?"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                  />
                  <span className="mt-1 block text-xs text-slate-500">{adjustmentNote.length}/500 characters</span>
                </label>

                {adjustmentIsCustomerReturn ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                    Customer returns are quarantined. They are recorded but are not added back to sellable stock.
                  </p>
                ) : (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
                    This permanently removes the entered units from the selected batch’s sellable stock.
                  </p>
                )}
                {adjustmentMessage ? <p className="text-sm font-semibold text-slate-700">{adjustmentMessage}</p> : null}
                <button
                  type="submit"
                  disabled={isSavingAdjustment || !activePharmacyId || adjustmentFormInvalid}
                  className="rounded-md bg-emerald-700 px-4 py-3.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isSavingAdjustment ? "Recording..." : adjustmentIsCustomerReturn ? "Record Quarantined Return" : "Confirm Stock Adjustment"}
                </button>
              </form>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold">Recent Adjustments</h2>
              <p className="mt-1 text-sm text-slate-600">The latest 100 immutable adjustment records.</p>
              <div className="mt-4 grid gap-3">
                {dashboardData.adjustments.length === 0 ? <EmptyState text="No inventory adjustments recorded yet." /> : null}
                {dashboardData.adjustments.map((adjustment) => (
                  <article key={adjustment.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-bold">{adjustment.product.product_name}</p>
                        <p className="text-sm text-slate-600">
                          {adjustmentReasons.find((reason) => reason.value === adjustment.reason)?.label || adjustment.reason}
                          {adjustment.batch ? ` · Batch ${adjustment.batch.batch_number}` : ""}
                        </p>
                      </div>
                      <p className={`font-black ${adjustment.stock_effect === -1 ? "text-rose-700" : "text-amber-700"}`}>
                        {adjustment.stock_effect === -1 ? "−" : "Quarantine "}{adjustment.quantity} units
                      </p>
                    </div>
                    {adjustment.note ? <p className="mt-2 text-sm text-slate-700">{adjustment.note}</p> : null}
                    <p className="mt-2 text-xs font-semibold text-slate-500">{adjustment.staff_name} · {formatDateTime(adjustment.created_at)}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "expiry" ? (
          <section className="grid gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold">Expiry</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
                <input
                  value={expirySearch}
                  onChange={(event) => setExpirySearch(event.target.value)}
                  placeholder="Search product name"
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                />
                <select
                  value={expiryStatus}
                  onChange={(event) => setExpiryStatus(event.target.value as ExpiryStatus | "ALL")}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                >
                  <option value="ALL">All expiry statuses</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="EXPIRING SOON">Expiring soon</option>
                  <option value="OK">OK</option>
                </select>
              </div>
              {dashboardData.batches.length ? (
                <p className="mt-3 text-sm font-semibold text-slate-600">{expiryBatches.length} of {dashboardData.batches.length} batches</p>
              ) : null}
            </div>

            {dashboardData.batches.length > 0 && expiryBatches.length === 0 ? (
              <EmptyState text="No batches match the current expiry filters." />
            ) : null}

            {dashboardData.batches.length ? expiryBatches.map((batch) => (
              <article key={batch.id} className={`rounded-lg border p-4 shadow-sm ${expiryCardClass[batch.expiry_status]}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-bold">{batch.product.product_name}</h2>
                    <p className={batch.expiry_status === "EXPIRED" ? "text-sm font-semibold text-rose-800" : "text-sm font-semibold text-orange-800"}>
                      Batch {batch.batch_number} - expires {batch.expiry_date}
                    </p>
                  </div>
                  <StatusBadge value={batch.expiry_status} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Days" value={String(batch.days_to_expiry)} />
                  <Metric label="Packs" value={String(batch.packs_received)} />
                  <Metric label="Units" value={String(batch.total_units_received)} />
                  <Metric label="Available" value={String(batch.available_stock)} />
                  <Metric label="Buying/pack" value={formatTZS(batch.buying_price_per_pack)} />
                  <Metric label="Unit cost" value={batch.derived_unit_cost == null ? "-" : formatTZS(batch.derived_unit_cost)} />
                </div>
              </article>
            )) : <EmptyState text="No inventory batches found." />}
          </section>
        ) : null}

        {activeTab === "sales" ? (
          <section className="grid gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold">Sales</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <input
                  value={salesSearch}
                  onChange={(event) => setSalesSearch(event.target.value)}
                  placeholder="Search product name"
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                />
                <input
                  type="date"
                  value={salesDate}
                  onChange={(event) => setSalesDate(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                />
                <select
                  value={salesOverrideFlag}
                  onChange={(event) => setSalesOverrideFlag(event.target.value as OverrideFlag | "ALL")}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                >
                  <option value="ALL">All override flags</option>
                  <option value="NORMAL">Normal</option>
                  <option value="OVERRIDDEN">Overridden</option>
                </select>
              </div>
              {dashboardData.sales.length ? (
                <p className="mt-3 text-sm font-semibold text-slate-600">
                  {groupedSales.length} transaction{groupedSales.length === 1 ? "" : "s"} · {groupedSaleLineCount} sale line{groupedSaleLineCount === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>

            {dashboardData.sales.length > 0 && groupedSales.length === 0 ? (
              <EmptyState text="No sales match the current search and filters." />
            ) : null}

            {dashboardData.sales.length ? groupedSales.map((transaction) => (
              <article key={transaction.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-bold">
                      {transaction.transactionId ? `Transaction #${transaction.transactionId.slice(0, 8).toUpperCase()}` : "Legacy sale"}
                    </h2>
                    <p className="text-sm text-slate-600">
                      {formatDateTime(transaction.createdAt)} · {transaction.lines.length} item{transaction.lines.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <StatusBadge value={transaction.hasOverride ? "OVERRIDDEN" : "NORMAL"} />
                </div>
                <div className="mt-4 grid gap-2">
                  {transaction.lines.map((sale) => (
                    <div key={sale.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{sale.product.product_name}</p>
                          <p className="text-sm text-slate-600">
                            {sale.quantity_entered} {sale.sell_type === "PACK" ? "pack" : "unit"} · {sale.units_sold} units
                          </p>
                        </div>
                        <p className="font-black">{formatTZS(sale.total_sale)}</p>
                      </div>
                      <Link className="mt-2 inline-block text-sm font-bold text-emerald-700" href={`/sales/${sale.id}`}>
                        Line detail
                      </Link>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Metric label="Total units" value={String(transaction.unitsSold)} />
                  <Metric label="Transaction total" value={formatTZS(transaction.totalSale)} />
                </div>
              </article>
            )) : <EmptyState text="No sales recorded yet." />}
          </section>
        ) : null}

        {activeTab === "csv" ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold">Import Products</h2>
              <p className="mt-1 text-sm text-slate-600">Required columns: {PRODUCT_IMPORT_COLUMNS.join(", ")}</p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => handleCsvFile("products", event.target.files?.[0] || null)}
                className="mt-4 w-full rounded-md border border-slate-300 px-3 py-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold"
              />
              <ImportPreviewPanel preview={productImport} />
              <button
                type="button"
                disabled={
                  !productImport ||
                  productImport.rows.length === 0 ||
                  productImport.errors.length > 0 ||
                  productImport.warnings.length > 0 ||
                  productImport.missingColumns.length > 0 ||
                  isImportingProducts
                }
                onClick={() => importCsv("products")}
                className="mt-4 w-full rounded-md bg-emerald-700 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isImportingProducts ? "Importing Products..." : "Save Product Import"}
              </button>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold">Import Inventory Batches</h2>
              <p className="mt-1 text-sm text-slate-600">Required columns: {BATCH_IMPORT_COLUMNS.join(", ")}</p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => handleCsvFile("batches", event.target.files?.[0] || null)}
                className="mt-4 w-full rounded-md border border-slate-300 px-3 py-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold"
              />
              <ImportPreviewPanel preview={batchImport} />
              <button
                type="button"
                disabled={
                  !batchImport ||
                  batchImport.rows.length === 0 ||
                  batchImport.errors.length > 0 ||
                  batchImport.warnings.length > 0 ||
                  batchImport.missingColumns.length > 0 ||
                  isImportingBatches
                }
                onClick={() => importCsv("batches")}
                className="mt-4 w-full rounded-md bg-emerald-700 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isImportingBatches ? "Importing Batches..." : "Save Batch Import"}
              </button>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-bold">Export CSV</h2>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <button type="button" onClick={() => exportCsv("products")} className="rounded-md border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-800">
                  Products
                </button>
                <button type="button" onClick={() => exportCsv("stock")} className="rounded-md border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-800">
                  Stock Summary
                </button>
                <button type="button" onClick={() => exportCsv("sales")} className="rounded-md border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-800">
                  Sales
                </button>
                <button type="button" onClick={() => exportCsv("expiry")} className="rounded-md border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-800">
                  Expiry
                </button>
              </div>
            </article>
          </section>
        ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}

function ImportPreviewPanel({ preview }: { preview: ImportPreview | null }) {
  if (!preview) {
    return <div className="mt-4 rounded-md border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500">Choose a CSV file to preview rows before saving.</div>;
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
        <p className="font-bold">{preview.rows.length} rows found</p>
        <p className={preview.errors.length || preview.warnings.length || preview.missingColumns.length ? "mt-1 font-semibold text-rose-700" : "mt-1 font-semibold text-emerald-700"}>
          {preview.errors.length || preview.warnings.length || preview.missingColumns.length ? "Fix issues before saving." : "Ready to import."}
        </p>
      </div>

      {preview.missingColumns.length ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          Missing columns: {preview.missingColumns.join(", ")}
        </div>
      ) : null}

      {preview.errors.length ? (
        <div className="max-h-52 overflow-auto rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {preview.errors.map((error) => (
            <div key={error.row} className="border-b border-rose-200 py-2 last:border-b-0">
              <p className="font-bold">Row {error.row}</p>
              <p>{error.errors.join(" ")}</p>
            </div>
          ))}
        </div>
      ) : null}

      {preview.warnings.length ? (
        <div className="max-h-52 overflow-auto rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {preview.warnings.map((warning) => (
            <div key={warning.row} className="border-b border-amber-200 py-2 last:border-b-0">
              <p className="font-bold">Row {warning.row}</p>
              <p>{warning.warnings.join(" ")}</p>
            </div>
          ))}
        </div>
      ) : null}

      {preview.rows.length ? (
        <div className="max-h-60 overflow-auto rounded-md border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                {Object.keys(preview.rows[0]).slice(0, 6).map((header) => (
                  <th key={header} className="px-3 py-2 font-bold">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 5).map((row, index) => (
                <tr key={`${index}-${Object.values(row).join("-")}`} className="border-t border-slate-100">
                  {Object.keys(preview.rows[0]).slice(0, 6).map((header) => (
                    <td key={header} className="px-3 py-2 text-slate-700">{row[header]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  detail,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone: keyof typeof KPI_CARD_CLASSES;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${KPI_CARD_CLASSES[tone]}`}
    >
      <p className="text-xs font-bold uppercase text-slate-600">{label}</p>
      <p className="mt-3 text-2xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600">{detail}</p>
    </button>
  );
}

function ProductRow({
  product,
  sellType,
  selected,
  onSelect,
}: {
  product: ProductWithStock;
  sellType: SellType;
  selected: boolean;
  onSelect: () => void;
}) {
  const defaultPrice = resolveDefaultPrice(product, sellType);
  const priceMissing = defaultPrice == null;

  return (
    <button
      type="button"
      disabled={priceMissing}
      onClick={onSelect}
      className={`rounded-md border p-3 text-left transition ${
        selected ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-300"
      } disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-75`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{product.product_name}</p>
          <p className="text-sm text-slate-600">
            {priceMissing ? product.generic_name : `${product.generic_name} - ${sellType === "PACK" ? "Pack" : "Unit"} ${formatTZS(defaultPrice)}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {priceMissing ? (
            <span className="w-fit rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
              PRICE MISSING
            </span>
          ) : null}
          <ProductStockBadges product={product} />
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-700">{product.available_stock} {product.base_unit} available</p>
    </button>
  );
}

function StockProductOption({
  product,
  selected,
  onSelect,
}: {
  product: ProductWithStock;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`min-h-16 rounded-md border p-3 text-left transition ${
        selected ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-300"
      }`}
    >
      <p className="font-semibold">{product.product_name}</p>
      <p className="mt-1 text-sm text-slate-600">
        {[product.generic_name, product.brand_name, product.dosage_form].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-2 text-sm text-slate-700">
        {product.available_stock} {product.base_unit} available · {product.units_per_pack} per {product.pack_type}
      </p>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ value }: { value: StatusBadgeValue }) {
  return <span className={STATUS_BADGE_CLASSES[value]}>{value}</span>;
}

function ProductStockBadges({ product }: { product: ProductWithStock }) {
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {product.stock_status ? <StatusBadge value={product.stock_status} /> : null}
      {!product.reorder_level_configured ? (
        <span className="w-fit rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
          Reorder level not configured
        </span>
      ) : null}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
      />
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center font-semibold text-slate-600">{text}</div>;
}
