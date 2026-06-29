"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatOptionalTZS, formatTZS } from "@/lib/format";
import { resolveDefaultPrice } from "@/lib/pricing";
import { getPharmacyExpiryWarning } from "@/lib/subscription";
import type { DashboardData, ExpiryStatus, OverrideFlag, Pharmacy, ProductWithStock, SellType, StockStatus } from "@/lib/types";

type Tab = "dashboard" | "sell" | "products" | "stock" | "expiry" | "sales" | "csv";
type Toast = {
  message: string;
  type: "success" | "error";
};
type ImportKind = "products" | "batches";
type CsvRow = Record<string, string>;
type ImportPreview = {
  rows: CsvRow[];
  errors: { row: number; errors: string[] }[];
  warnings: { row: number; warnings: string[] }[];
  missingColumns: string[];
};

const tabs: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sell", label: "Sell" },
  { id: "products", label: "Products" },
  { id: "stock", label: "Add Stock" },
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

function hasPriceForSellType(product: ProductWithStock, preferredSellType: SellType) {
  return resolveDefaultPrice(product, getProductSellType(product, preferredSellType)) != null;
}

function getImportBatchKey(productId: string, batchNumber: string, expiryDate: string) {
  return `${productId}::${batchNumber.trim().toLowerCase()}::${expiryDate}`;
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
      if (kind === "products" && (column === "default_unit_price" || column === "default_pack_price")) continue;
      if (!String(row[column] ?? "").trim()) rowErrors.push(`Missing ${column}.`);
    }

    if (kind === "products") {
      const unitsPerPack = Number(row.units_per_pack);
      const defaultUnitPrice = String(row.default_unit_price || "").trim() === "" ? null : Number(row.default_unit_price);
      const defaultPackPrice = String(row.default_pack_price || "").trim() === "" ? null : Number(row.default_pack_price);
      const reorderLevel = Number(row.reorder_level);
      const sellingMode = String(row.selling_mode || "").trim();

      if (!String(row.product_name || "").trim()) rowErrors.push("Missing product name.");
      if (!Number.isInteger(unitsPerPack) || unitsPerPack <= 0) rowErrors.push("Invalid units per pack.");
      if (!["UNIT", "PACK", "BOTH"].includes(sellingMode)) rowErrors.push("Selling mode must be UNIT, PACK, or BOTH.");
      if (defaultUnitPrice === null && defaultPackPrice === null) rowErrors.push("At least one default price is required.");
      if (defaultUnitPrice !== null && (!Number.isFinite(defaultUnitPrice) || defaultUnitPrice < 0)) rowErrors.push("Default unit price cannot be negative.");
      if (defaultPackPrice !== null && (!Number.isFinite(defaultPackPrice) || defaultPackPrice < 0)) rowErrors.push("Default pack price cannot be negative.");
      if (!Number.isInteger(reorderLevel) || reorderLevel < 0) rowErrors.push("Reorder level cannot be negative.");
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
  isDebugMode,
}: {
  initialData: DashboardData;
  initialPharmacies: Pharmacy[];
  initialPharmacyId: string;
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
  const [loginPassword, setLoginPassword] = useState("");
  const [subscriptionWarning, setSubscriptionWarning] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCreatingPharmacy, setIsCreatingPharmacy] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [query, setQuery] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productStockStatus, setProductStockStatus] = useState<StockStatus | "ALL">("ALL");
  const [salesSearch, setSalesSearch] = useState("");
  const [salesDate, setSalesDate] = useState("");
  const [salesOverrideFlag, setSalesOverrideFlag] = useState<OverrideFlag | "ALL">("ALL");
  const [expirySearch, setExpirySearch] = useState("");
  const [expiryStatus, setExpiryStatus] = useState<ExpiryStatus | "ALL">("ALL");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [preferredSellType, setPreferredSellType] = useState<SellType>("UNIT");
  const [quantity, setQuantity] = useState("1");
  const [overridePrice, setOverridePrice] = useState("");
  const [saleMessage, setSaleMessage] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [stockMessage, setStockMessage] = useState("");
  const [stockConfirmation, setStockConfirmation] = useState("");
  const [batchProductId, setBatchProductId] = useState(initialData.products[0]?.id || "");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [packsReceived, setPacksReceived] = useState("");
  const [buyingPricePerPack, setBuyingPricePerPack] = useState("");
  const [isSavingSale, setIsSavingSale] = useState(false);
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [productImport, setProductImport] = useState<ImportPreview | null>(null);
  const [batchImport, setBatchImport] = useState<ImportPreview | null>(null);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [isImportingBatches, setIsImportingBatches] = useState(false);

  const filteredProducts = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return dashboardData.products;
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
      const matchesStatus = productStockStatus === "ALL" || product.stock_status === productStockStatus;

      return matchesText && matchesStatus;
    });
  }, [dashboardData.products, productSearch, productStockStatus]);

  const selectedProduct = dashboardData.products.find((product) => product.id === selectedProductId);
  const batchProduct = dashboardData.products.find((product) => product.id === batchProductId) || dashboardData.products[0];
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
  const exceedsStock = selectedProduct && Number.isFinite(saleQuantity) ? unitsToDeduct > selectedProduct.available_stock : false;
  const saleQuantityInvalid = !Number.isFinite(saleQuantity) || saleQuantity <= 0;
  const saleQuantityFractional = Number.isFinite(saleQuantity) && !Number.isInteger(saleQuantity);
  const saleQuantityBlocked = saleQuantityInvalid || saleQuantityFractional;
  const saveSaleDisabled =
    isSavingSale ||
    !activePharmacyId ||
    !selectedProduct ||
    selectedDefaultPrice == null ||
    saleQuantityBlocked ||
    overridePriceInvalid ||
    exceedsStock ||
    selectedProduct.available_stock <= 0;
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
  const filteredSales = useMemo(() => {
    const text = salesSearch.trim().toLowerCase();

    return dashboardData.sales.filter((sale) => {
      const matchesText = !text || sale.product.product_name.toLowerCase().includes(text);
      const matchesDate = !salesDate || sale.created_at.slice(0, 10) === salesDate;
      const matchesFlag = salesOverrideFlag === "ALL" || sale.override_flag === salesOverrideFlag;

      return matchesText && matchesDate && matchesFlag;
    });
  }, [dashboardData.sales, salesDate, salesOverrideFlag, salesSearch]);
  const productsByName = useMemo(
    () => new Map(dashboardData.products.map((product) => [product.product_name.toLowerCase(), product])),
    [dashboardData.products],
  );
  const existingBatchKeys = useMemo(
    () => new Set(dashboardData.batches.map((batch) => getImportBatchKey(batch.product_id, batch.batch_number, batch.expiry_date))),
    [dashboardData.batches],
  );
  const kpiCards = useMemo(
    () => [
      {
        label: "Total Products",
        value: String(dashboardData.stats.total_products),
        detail: "Products in catalog",
        target: "products" as Tab,
        tone: "slate" as const,
      },
      {
        label: "Low Stock Items",
        value: String(dashboardData.stats.low_stock_items),
        detail: "At or below reorder level",
        target: "products" as Tab,
        tone: "yellow" as const,
      },
      {
        label: "Out of Stock Items",
        value: String(dashboardData.stats.out_of_stock_items),
        detail: "Available stock is zero",
        target: "products" as Tab,
        tone: "rose" as const,
      },
      {
        label: "Expiring Soon Batches",
        value: String(dashboardData.stats.expiring_soon_batches),
        detail: "Within 30 days",
        target: "expiry" as Tab,
        tone: "orange" as const,
      },
      {
        label: "Total Inventory Value",
        value: formatTZS(dashboardData.stats.total_inventory_value),
        detail: "Available stock at unit cost",
        target: "products" as Tab,
        tone: "emerald" as const,
      },
      {
        label: "Today's Sales",
        value: formatTZS(dashboardData.stats.todays_sales),
        detail: "Sales recorded today",
        target: "sales" as Tab,
        tone: "blue" as const,
      },
    ],
    [dashboardData.stats],
  );
  const stockBatchDuplicate =
    batchProduct && batchNumber.trim() && isValidIsoDate(expiryDate)
      ? existingBatchKeys.has(getImportBatchKey(batchProduct.id, batchNumber, expiryDate))
      : false;
  const stockFormInvalid =
    !batchProduct ||
    !batchNumber.trim() ||
    !expiryDate ||
    expiryDateInvalid ||
    packsReceivedInvalid ||
    buyingPricePerPackInvalid ||
    stockBatchDuplicate;
  const saveStockDisabled = isSavingStock || !activePharmacyId || stockFormInvalid;
  const activePharmacy = pharmacies.find((pharmacy) => pharmacy.id === activePharmacyId) || null;

  useEffect(() => {
    setSubscriptionWarning(activePharmacy ? getPharmacyExpiryWarning(activePharmacy) : null);
  }, [activePharmacy]);

  async function loadPharmacyData(pharmacyId: string) {
    if (!pharmacyId) {
      setDashboardData({
        stats: {
          total_products: 0,
          low_stock_items: 0,
          out_of_stock_items: 0,
          expiring_soon_batches: 0,
          total_inventory_value: 0,
          todays_sales: 0,
        },
        products: [],
        batches: [],
        expiringBatches: [],
        sales: [],
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
      setBatchProductId((result.data as DashboardData).products[0]?.id || "");
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

    if (!loginNameOrCode.trim() || !loginPassword) {
      const message = "Enter pharmacy code or name and password.";
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
      setPharmacies([pharmacy]);
      setActivePharmacyId(pharmacy.id);
      setLoginNameOrCode("");
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

  useEffect(() => {
    const selectedStillValid =
      selectedProductId &&
      dashboardData.products.some((product) => product.id === selectedProductId && hasPriceForSellType(product, preferredSellType));

    if (selectedStillValid) return;

    const firstSellableProduct = dashboardData.products.find((product) => hasPriceForSellType(product, preferredSellType));
    setSelectedProductId(firstSellableProduct?.id || "");
  }, [dashboardData.products, preferredSellType, selectedProductId]);

  async function submitSale(event: React.FormEvent<HTMLFormElement>) {
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
      setSaleMessage(`Only ${selectedProduct.available_stock} units are available.`);
      setToast({ message: "Sale blocked because stock is insufficient.", type: "error" });
      return;
    }

    setIsSavingSale(true);

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: selectedProduct.id,
          sell_type: sellType,
          quantity_entered: saleQuantity,
          override_price: overridePrice,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        const message = result.error || "Unable to save sale.";
        setSaleMessage(message);
        setToast({ message, type: "error" });
        return;
      }

      setQuantity("1");
      setOverridePrice("");
      setToast({ message: "Sale saved successfully.", type: "success" });
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
            product.reorder_level,
          ]),
        ),
      );
    }

    if (kind === "stock") {
      downloadCsv(
        "stock-summary.csv",
        buildCsv(
          ["product_name", "generic_name", "total_received", "total_sold", "available_stock", "reorder_level", "stock_status"],
          dashboardData.products.map((product) => [
            product.product_name,
            product.generic_name,
            product.total_received,
            product.total_sold,
            product.available_stock,
            product.reorder_level,
            product.stock_status,
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
                </div>
                {activePharmacyId && !isDebugMode ? (
                  <button
                    type="button"
                    onClick={logoutPharmacy}
                    className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800"
                  >
                    Log out
                  </button>
                ) : null}
              </div>
              {isLoadingPharmacy ? <p className="mt-2 text-sm font-semibold text-slate-600">Loading pharmacy records...</p> : null}
              {subscriptionWarning ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                  {subscriptionWarning}
                </p>
              ) : null}
              {pharmacyMessage ? <p className="mt-2 text-sm font-semibold text-rose-700">{pharmacyMessage}</p> : null}
            </section>
            {!activePharmacyId ? (
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-bold">Pharmacy Login</h2>
                <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={submitPharmacyLogin}>
                  <Input label="Pharmacy code or name" value={loginNameOrCode} onChange={setLoginNameOrCode} />
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
                  onClick={() => setActiveTab(card.target)}
                />
              ))}
            </div>

            {dashboardData.products.length === 0 ? (
              <EmptyState text="No products yet. Add products before the dashboard can show stock value." />
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
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
                          <StatusBadge value={product.stock_status} />
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
                {dashboardData.products.length > 0 && filteredProducts.length === 0 ? (
                  <EmptyState text="No products match your search." />
                ) : null}
                {filteredProducts.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    sellType={getProductSellType(product, preferredSellType)}
                    selected={product.id === selectedProduct?.id}
                    onSelect={() => setSelectedProductId(product.id)}
                  />
                ))}
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
                      Cannot deduct {unitsToDeduct} units. Only {selectedProduct.available_stock} units are available.
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
                    {isSavingSale ? "Saving Sale..." : "Save Sale"}
                  </button>
                </form>
              ) : (
                <p className="mt-4 text-slate-600">Add a product in Supabase to start selling.</p>
              )}
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
                  onChange={(event) => setProductStockStatus(event.target.value as StockStatus | "ALL")}
                  className="w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                >
                  <option value="ALL">All stock statuses</option>
                  <option value="OK">OK</option>
                  <option value="LOW STOCK">Low stock</option>
                  <option value="OUT OF STOCK">Out of stock</option>
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
                  <StatusBadge value={product.stock_status} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Available" value={String(product.available_stock)} />
                  <Metric label="Received" value={String(product.total_received)} />
                  <Metric label="Sold" value={String(product.total_sold)} />
                  <Metric label="Unit cost" value={product.derived_unit_cost == null ? "-" : formatTZS(product.derived_unit_cost)} />
                  <Metric label="Reorder" value={String(product.reorder_level)} />
                </div>
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
              <label className="block text-sm font-semibold sm:col-span-2">
                Product
                <select
                  value={batchProductId}
                  onChange={(event) => setBatchProductId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none focus:border-emerald-600"
                >
                  {dashboardData.products.map((product) => (
                    <option key={product.id} value={product.id}>{product.product_name}</option>
                  ))}
                </select>
              </label>
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
                <p className="mt-3 text-sm font-semibold text-slate-600">{filteredSales.length} of {dashboardData.sales.length} sales</p>
              ) : null}
            </div>

            {dashboardData.sales.length > 0 && filteredSales.length === 0 ? (
              <EmptyState text="No sales match the current search and filters." />
            ) : null}

            {dashboardData.sales.length ? filteredSales.map((sale) => (
              <article key={sale.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-bold">{sale.product.product_name}</h2>
                    <p className="text-sm text-slate-600">
                      {formatDateTime(sale.created_at)} - {sale.quantity_entered} {sale.sell_type === "PACK" ? "pack" : "unit"}
                    </p>
                  </div>
                  <StatusBadge value={sale.override_flag} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Sell type" value={sale.sell_type} />
                  <Metric label="Units sold" value={String(sale.units_sold)} />
                  <Metric label="Default" value={formatTZS(sale.default_price)} />
                  <Metric label="Override" value={sale.override_price == null ? "-" : formatTZS(sale.override_price)} />
                  <Metric label="Effective" value={formatTZS(sale.effective_price)} />
                  <Metric label="Total" value={formatTZS(sale.total_sale)} />
                </div>
                <Link className="mt-4 inline-block text-sm font-bold text-emerald-700" href={`/sales/${sale.id}`}>
                  Sale detail
                </Link>
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
          <StatusBadge value={product.stock_status} />
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-700">{product.available_stock} {product.base_unit} available</p>
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

