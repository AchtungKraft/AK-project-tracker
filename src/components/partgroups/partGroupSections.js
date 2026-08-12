/**
 * Shared Required/Optional ordering + group subtotal helper for Parts Groups.
 *
 * Used by BOTH the interactive PartGroupDetail view AND all print report builders.
 * Single source of truth — prevents ordering and subtotal logic from drifting.
 *
 * Pipeline:
 *  1. Group items by groupBy (section | category | none)
 *  2. Within each group, split into Required and Optional
 *  3. Apply sortBy independently to each subset
 *  4. Calculate per-group pricing subtotals
 *
 * Returns: PreparedSection[]
 * {
 *   key: string,
 *   label: string,
 *   requiredItems: EnrichedItem[],
 *   optionalItems: EnrichedItem[],
 *   counts: { required, optional, total, totalQty },
 *   pricing: { requiredCost, optionalCost, subtotalCost, requiredRetail, optionalRetail, subtotalRetail },
 * }
 */

import { getCategoryPathLabel } from "@/lib/categoryTreeHelpers";

// ─── SORT COMPARATORS ───────────────────────────────────────────────────
function buildComparator(sortBy, catLookups, vendorsMap) {
  switch (sortBy) {
    case "name":
      return (a, b) => (a.part?.part_name || "").localeCompare(b.part?.part_name || "");
    case "part_number":
      return (a, b) => (a.part?.vendor_part_number || "").localeCompare(b.part?.vendor_part_number || "");
    case "category": {
      return (a, b) => {
        const pathA = a.part?.part_category_id ? (getCategoryPathLabel(a.part.part_category_id, catLookups?.byId || {}) || "") : "zzz";
        const pathB = b.part?.part_category_id ? (getCategoryPathLabel(b.part.part_category_id, catLookups?.byId || {}) || "") : "zzz";
        return pathA.localeCompare(pathB);
      };
    }
    case "cost":
      return (a, b) => (b.unitCost || 0) - (a.unitCost || 0);
    case "source": {
      return (a, b) => {
        const vA = vendorsMap?.[a.part?.default_vendor_id]?.vendor_name || "zzz";
        const vB = vendorsMap?.[b.part?.default_vendor_id]?.vendor_name || "zzz";
        return vA.localeCompare(vB);
      };
    }
    case "required":
      return (a, b) => (a.is_optional ? 1 : 0) - (b.is_optional ? 1 : 0);
    default:
      return null; // manual — preserve original sort_order
  }
}

// ─── PRICING CALCULATION ────────────────────────────────────────────────
function calcGroupPricing(items) {
  let requiredCost = 0, optionalCost = 0;
  let requiredRetail = 0, optionalRetail = 0;
  let requiredQty = 0, optionalQty = 0;

  for (const item of items) {
    const qty = item.quantity || 1;
    const unitCost = item.unitCost || 0;
    const unitRetail = item.part?.retail_override || item.part?.retail_matrix_price || 0;
    const extCost = unitCost * qty;
    const extRetail = unitRetail * qty;

    if (item.is_optional) {
      optionalCost += extCost;
      optionalRetail += extRetail;
      optionalQty += qty;
    } else {
      requiredCost += extCost;
      requiredRetail += extRetail;
      requiredQty += qty;
    }
  }

  return {
    requiredCost,
    optionalCost,
    subtotalCost: requiredCost + optionalCost,
    requiredRetail,
    optionalRetail,
    subtotalRetail: requiredRetail + optionalRetail,
    requiredQty,
    optionalQty,
    totalQty: requiredQty + optionalQty,
  };
}

// ─── MAIN EXPORT ────────────────────────────────────────────────────────
/**
 * @param {Object} params
 * @param {Array} params.items — enriched items (already have .part, .unitCost, .extCost, .quantity, .is_optional, .section_name)
 * @param {string} params.groupBy — "section" | "category" | "none"
 * @param {string} params.sortBy — "manual" | "name" | "cost" | "category" | "part_number" | "source" | "required"
 * @param {Object} [params.catLookups]
 * @param {Object} [params.vendorsMap]
 * @returns {PreparedSection[]}
 */
export function preparePartGroupSections({ items, groupBy, sortBy, catLookups, vendorsMap }) {
  // 1. Group
  const groupMap = new Map();
  if (groupBy === "category") {
    for (const item of items) {
      const catId = item.part?.part_category_id;
      const label = catId && catLookups?.byId?.[catId]
        ? getCategoryPathLabel(catId, catLookups.byId) : "Uncategorized";
      if (!groupMap.has(label)) groupMap.set(label, []);
      groupMap.get(label).push(item);
    }
  } else if (groupBy === "section") {
    for (const item of items) {
      const section = item.section_name || "General Parts";
      if (!groupMap.has(section)) groupMap.set(section, []);
      groupMap.get(section).push(item);
    }
  } else {
    groupMap.set("All Parts", [...items]);
  }

  // 2. Build comparator
  const cmp = buildComparator(sortBy, catLookups, vendorsMap);

  // 3. For each group, split → sort → calculate
  const sections = [];
  const entries = Array.from(groupMap.entries());
  // Sort groups alphabetically when grouping by category
  if (groupBy === "category") {
    entries.sort(([a], [b]) => a.localeCompare(b));
  }

  for (const [label, groupItems] of entries) {
    const required = groupItems.filter(i => !i.is_optional);
    const optional = groupItems.filter(i => i.is_optional);

    // Sort each subset independently (manual = preserve existing sort_order)
    if (cmp) {
      required.sort(cmp);
      optional.sort(cmp);
    }

    const reqCount = required.length;
    const optCount = optional.length;
    const pricing = calcGroupPricing(groupItems);

    sections.push({
      key: label,
      label,
      requiredItems: required,
      optionalItems: optional,
      counts: {
        required: reqCount,
        optional: optCount,
        total: reqCount + optCount,
        totalQty: pricing.totalQty,
      },
      pricing,
    });
  }

  return sections;
}