/**
 * Shared print configuration foundation for Parts Catalog and Parts Group reports.
 * Defines common report types, toggle definitions, and localStorage helpers.
 *
 * Parts Catalog and Parts Groups both consume this shared config.
 * Group-specific controls (Group Report By, Section, Qty, Required/Optional)
 * are layered on top by PartGroupPrintModal.
 */

import { FileText, BookOpen, DollarSign } from "lucide-react";

// ─── SHARED REPORT TYPES ────────────────────────────────────────────────
// These are the canonical report templates available across both surfaces.
// Parts Group may extend with additional group-specific reports (e.g. Compact List).

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
// Each toggle has a key, label, and default value.

export const TOGGLE_DEFS = {
  includeCost: { key: "includeCost", label: "Include Cost" },
  includeRetail: { key: "includeRetail", label: "Include Retail" },
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
    defaults: { includeCost: true, includeRetail: true, includeGroupTotals: true },
    toggles: [TOGGLE_DEFS.includeCost, TOGGLE_DEFS.includeRetail, TOGGLE_DEFS.includeGroupTotals],
  },
  illustrated: {
    ...SHARED_REPORT_TYPES.illustrated,
    description: "Visual cards with thumbnails, locations, and vendor sources for technicians.",
    defaults: { includeImages: true, includeVendorSources: true, includeLocations: true, includeNotes: true },
    toggles: [TOGGLE_DEFS.includeImages, TOGGLE_DEFS.includeVendorSources, TOGGLE_DEFS.includeLocations, TOGGLE_DEFS.includeNotes],
  },
  priceList: {
    ...SHARED_REPORT_TYPES.priceList,
    defaults: { includeImages: true, includeDescriptions: true, includeVehicle: false },
    toggles: [TOGGLE_DEFS.includeImages, TOGGLE_DEFS.includeDescriptions, TOGGLE_DEFS.includeVehicle],
  },
};

// ─── PARTS GROUP report configs ──────────────────────────────────────────
// Shares Summary and Illustrated with catalog, adds group-specific Price List variant
// and group-only Compact List.
export const GROUP_REPORT_CONFIGS = {
  summary: {
    ...SHARED_REPORT_TYPES.summary,
    defaults: { includeCost: true, includeRetail: false, includeStock: true, includeDemand: true, includeSource: true, includeNotes: true, groupReportBy: "section" },
    toggles: [TOGGLE_DEFS.includeCost, TOGGLE_DEFS.includeRetail, TOGGLE_DEFS.includeStock, TOGGLE_DEFS.includeDemand, TOGGLE_DEFS.includeSource, TOGGLE_DEFS.includeNotes],
  },
  illustrated: {
    ...SHARED_REPORT_TYPES.illustrated,
    defaults: { includeImages: true, includeSource: true, includeNotes: true, includeCost: true, groupReportBy: "section" },
    toggles: [TOGGLE_DEFS.includeImages, TOGGLE_DEFS.includeSource, TOGGLE_DEFS.includeCost, TOGGLE_DEFS.includeNotes],
  },
  priceList: {
    ...SHARED_REPORT_TYPES.priceList,
    description: "Client-facing retail price list with quantities. No internal costs or vendor data.",
    defaults: { includeImages: false, includeDescriptions: false, includeVehicle: false, groupReportBy: "section" },
    toggles: [TOGGLE_DEFS.includeImages, TOGGLE_DEFS.includeDescriptions],
  },
  compact: {
    key: "compact",
    label: "Compact List",
    icon: FileText,
    description: "Scannable checklist with part names and quantities. Group-specific report.",
    defaults: { includePartNumber: true, includeCategory: true, groupReportBy: "section" },
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