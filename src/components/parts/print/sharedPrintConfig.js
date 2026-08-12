/**
 * Shared print configuration foundation for Parts Catalog and Parts Group reports.
 * Defines common report types, pricing modes, toggle definitions, and localStorage helpers.
 *
 * PRICING MODEL — single canonical control replaces independent Cost/Retail toggles:
 *   RETAIL_ONLY  — client-safe: NO cost data rendered anywhere in HTML
 *   COST_ONLY    — internal: cost only, no retail
 *   BOTH         — internal: cost + retail side by side
 *   NONE         — no pricing: operational parts list only
 */

import { FileText, BookOpen, DollarSign } from "lucide-react";

// ─── PRICING MODES ──────────────────────────────────────────────────────
export const PRICING_MODES = {
  RETAIL_ONLY: "RETAIL_ONLY",
  COST_ONLY: "COST_ONLY",
  BOTH: "BOTH",
  NONE: "NONE",
};

export const PRICING_MODE_LABELS = {
  [PRICING_MODES.RETAIL_ONLY]: "Retail Only",
  [PRICING_MODES.COST_ONLY]: "Cost Only",
  [PRICING_MODES.BOTH]: "Cost + Retail",
  [PRICING_MODES.NONE]: "No Pricing",
};

/** Should cost columns/values be rendered? */
export function showCost(pricingMode) {
  return pricingMode === PRICING_MODES.COST_ONLY || pricingMode === PRICING_MODES.BOTH;
}

/** Should retail columns/values be rendered? */
export function showRetail(pricingMode) {
  return pricingMode === PRICING_MODES.RETAIL_ONLY || pricingMode === PRICING_MODES.BOTH;
}

/** Are ANY pricing values rendered? */
export function showAnyPricing(pricingMode) {
  return pricingMode !== PRICING_MODES.NONE;
}

// ─── LEGACY MIGRATION ───────────────────────────────────────────────────
// Converts old includeCost/includeRetail booleans to canonical pricingMode.
export function migrateLegacyPricingToMode(saved) {
  if (saved.pricingMode) return saved.pricingMode;
  const hasCost = saved.includeCost;
  const hasRetail = saved.includeRetail;
  if (hasCost === undefined && hasRetail === undefined) return null; // no legacy data
  if (hasCost && hasRetail) return PRICING_MODES.BOTH;
  if (hasCost && !hasRetail) return PRICING_MODES.COST_ONLY;
  if (!hasCost && hasRetail) return PRICING_MODES.RETAIL_ONLY;
  return PRICING_MODES.NONE;
}

// ─── SHARED REPORT TYPES ────────────────────────────────────────────────
export const SHARED_REPORT_TYPES = {
  summary: {
    key: "summary",
    label: "Summary Report",
    icon: FileText,
    description: "Dense table for operations, inventory review, and purchasing meetings.",
  },
  illustrated: {
    key: "illustrated",
    label: "Illustrated Catalog",
    icon: BookOpen,
    description: "Visual cards with thumbnails for technicians.",
  },
  priceList: {
    key: "priceList",
    label: "Price List",
    icon: DollarSign,
    description: "Client-facing retail price list. No internal costs, inventory, or vendor data.",
  },
};

// ─── TOGGLE DEFINITIONS ─────────────────────────────────────────────────
export const TOGGLE_DEFS = {
  includeGroupTotals: { key: "includeGroupTotals", label: "Include Group Totals" },
  includeImages: { key: "includeImages", label: "Include Images" },
  includeVendorSources: { key: "includeVendorSources", label: "Include Vendor Sources" },
  includeLocations: { key: "includeLocations", label: "Include Inventory Locations" },
  includeNotes: { key: "includeNotes", label: "Include Notes" },
  includeDescriptions: { key: "includeDescriptions", label: "Include Descriptions" },
  includeVehicle: { key: "includeVehicle", label: "Include Vehicle Compatibility" },
  includeSource: { key: "includeSource", label: "Include Source / Vendor" },
  includeStock: { key: "includeStock", label: "Include Stock" },
  includeDemand: { key: "includeDemand", label: "Include Demand" },
  includePartNumber: { key: "includePartNumber", label: "Include Part Number" },
  includeCategory: { key: "includeCategory", label: "Include Category" },
};

// ─── PARTS CATALOG report configs ────────────────────────────────────────
export const CATALOG_REPORT_CONFIGS = {
  summary: {
    ...SHARED_REPORT_TYPES.summary,
    defaults: { pricingMode: PRICING_MODES.BOTH, includeGroupTotals: true },
    toggles: [TOGGLE_DEFS.includeGroupTotals],
  },
  illustrated: {
    ...SHARED_REPORT_TYPES.illustrated,
    description: "Visual cards with thumbnails, locations, and vendor sources for technicians.",
    defaults: { pricingMode: PRICING_MODES.BOTH, includeImages: true, includeVendorSources: true, includeLocations: true, includeNotes: true },
    toggles: [TOGGLE_DEFS.includeImages, TOGGLE_DEFS.includeVendorSources, TOGGLE_DEFS.includeLocations, TOGGLE_DEFS.includeNotes],
  },
  priceList: {
    ...SHARED_REPORT_TYPES.priceList,
    defaults: { pricingMode: PRICING_MODES.RETAIL_ONLY, includeImages: true, includeDescriptions: true, includeVehicle: false },
    toggles: [TOGGLE_DEFS.includeImages, TOGGLE_DEFS.includeDescriptions, TOGGLE_DEFS.includeVehicle],
  },
};

// ─── PARTS GROUP report configs ──────────────────────────────────────────
// Default: RETAIL_ONLY — client-safe by default.
export const GROUP_REPORT_CONFIGS = {
  summary: {
    ...SHARED_REPORT_TYPES.summary,
    defaults: { pricingMode: PRICING_MODES.RETAIL_ONLY, includeStock: true, includeDemand: true, includeSource: true, includeNotes: true, groupReportBy: "section" },
    toggles: [TOGGLE_DEFS.includeStock, TOGGLE_DEFS.includeDemand, TOGGLE_DEFS.includeSource, TOGGLE_DEFS.includeNotes],
  },
  illustrated: {
    ...SHARED_REPORT_TYPES.illustrated,
    defaults: { pricingMode: PRICING_MODES.RETAIL_ONLY, includeImages: true, includeSource: true, includeNotes: true, groupReportBy: "section" },
    toggles: [TOGGLE_DEFS.includeImages, TOGGLE_DEFS.includeSource, TOGGLE_DEFS.includeNotes],
  },
  priceList: {
    ...SHARED_REPORT_TYPES.priceList,
    description: "Client-facing retail price list with quantities. No internal costs or vendor data.",
    defaults: { pricingMode: PRICING_MODES.RETAIL_ONLY, includeImages: false, includeDescriptions: false, includeVehicle: false, groupReportBy: "section" },
    toggles: [TOGGLE_DEFS.includeImages, TOGGLE_DEFS.includeDescriptions],
  },
  compact: {
    key: "compact",
    label: "Compact List",
    icon: FileText,
    description: "Scannable checklist with part names and quantities. Group-specific report.",
    defaults: { pricingMode: PRICING_MODES.NONE, includePartNumber: true, includeCategory: true, groupReportBy: "section" },
    toggles: [TOGGLE_DEFS.includePartNumber, TOGGLE_DEFS.includeCategory],
    isGroupOnly: true,
  },
};

// ─── LOCALSTORAGE HELPERS ────────────────────────────────────────────────
export function loadSavedPrintOptions(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function savePrintOptions(storageKey, options) {
  try { localStorage.setItem(storageKey, JSON.stringify(options)); } catch {}
}

/**
 * Load options for a specific report type with legacy migration.
 * Returns merged defaults + saved, with pricingMode guaranteed.
 */
export function loadReportOptions(storageKey, reportType, configMap) {
  const config = configMap[reportType];
  if (!config) return {};
  const allSaved = loadSavedPrintOptions(storageKey);
  const saved = allSaved[reportType] || {};
  // Migrate legacy includeCost/includeRetail to pricingMode
  const migratedMode = migrateLegacyPricingToMode(saved);
  const merged = { ...config.defaults, ...saved };
  if (migratedMode) merged.pricingMode = migratedMode;
  // Remove legacy keys from persisted data
  delete merged.includeCost;
  delete merged.includeRetail;
  return merged;
}