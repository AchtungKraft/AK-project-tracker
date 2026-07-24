import { formatCurrency, getPartRetailEffectiveSafe } from "@/components/supply/pricingHelpers";

/**
 * Builds a printable HTML document for the current parts list.
 * Groups by category/subcategory hierarchy.
 * Summary columns: #, Part Name/Part#, Vendor/Source, Vehicle, Cost, Retail, Demand, On Hand, Location.
 * Detailed part sections follow each group.
 */

// ─── helpers ───────────────────────────────────────────────────
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildLookupMaps({ categories, vendors, makes, models, years }) {
  return {
    catMap: new Map(categories.map(c => [c.id, c])),
    vendorMap: new Map(vendors.map(v => [v.id, v])),
    makeMap: new Map(makes.map(m => [m.id, m])),
    modelMap: new Map(models.map(m => [m.id, m])),
    yearMap: new Map(years.map(y => [y.id, y])),
  };
}

const PART_TYPE_LABELS = {
  PURCHASED_VENDOR: "Vendor",
  AK_MANUFACTURED: "AK Mfg",
  CLIENT_SUPPLIED: "Client",
  TAKE_OFF: "Take-Off",
  STOCK_AK: "AK Stock",
  WARRANTY_REPLACEMENT: "Warranty",
};

function getVehicle(part, maps) {
  const segs = [];
  const year = maps.yearMap.get(part.car_year_id);
  const make = maps.makeMap.get(part.car_make_id);
  const model = maps.modelMap.get(part.car_model_id);
  if (year?.year) segs.push(year.year);
  if (make?.name) segs.push(make.name);
  if (model?.name) segs.push(model.name);
  return segs.length > 0 ? segs.join(" ") : "";
}

function getCategoryPath(catId, catMap) {
  if (!catId) return "";
  const cat = catMap.get(catId);
  if (!cat) return "";
  if (cat.parent_id) {
    const parent = catMap.get(cat.parent_id);
    if (parent) return `${parent.name} › ${cat.name}`;
  }
  return cat.name;
}

// Build the full location path for a Location entity
function buildLocationPath(locationId, locationMap) {
  if (!locationId) return null;
  const loc = locationMap.get(locationId);
  if (!loc) return null;
  const parts = [];
  let current = loc;
  const visited = new Set();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    parts.unshift(current.location_area || current.short_code || "?");
    if (current.parent_id) {
      current = locationMap.get(current.parent_id);
    } else {
      break;
    }
  }
  return parts.join(" › ");
}

// Compact location string for summary table
function getCompactLocation(partId, inventoryItems, locationMap) {
  const items = inventoryItems.filter(i => i.part_id === partId && (i.quantity_on_hand || 0) > 0);
  if (items.length === 0) return null; // no inventory items with qty
  
  const locPaths = [];
  for (const item of items) {
    if (!item.location_id) {
      locPaths.push({ path: null, qty: item.quantity_on_hand || 0 });
    } else {
      const path = buildLocationPath(item.location_id, locationMap);
      locPaths.push({ path: path || null, qty: item.quantity_on_hand || 0 });
    }
  }

  // Check if any have no path (unassigned)
  const assigned = locPaths.filter(l => l.path);
  const unassigned = locPaths.filter(l => !l.path);

  if (assigned.length === 0 && unassigned.length > 0) return "UNASSIGNED";
  if (assigned.length === 1 && unassigned.length === 0) return assigned[0].path;
  if (assigned.length > 0) {
    const first = assigned[0].path;
    const extra = assigned.length + unassigned.length - 1;
    return extra > 0 ? `${first} +${extra}` : first;
  }
  return "UNASSIGNED";
}

// Full location breakdown for detail section
function getDetailedLocations(partId, inventoryItems, locationMap) {
  const items = inventoryItems.filter(i => i.part_id === partId && (i.quantity_on_hand || 0) > 0);
  return items.map(item => {
    const path = item.location_id ? buildLocationPath(item.location_id, locationMap) : null;
    return { path: path || "UNASSIGNED", qty: item.quantity_on_hand || 0 };
  });
}

// Compact vendor/source for summary
function getCompactSource(part, maps, vendorSources) {
  // Preferred vendor source first
  const sources = vendorSources.filter(s => s.part_id === part.id && s.is_active !== false);
  if (sources.length > 0) {
    const preferred = sources.find(s => s.is_preferred) || sources[0];
    const vendor = maps.vendorMap.get(preferred.vendor_id);
    const name = vendor?.vendor_name || "—";
    const extra = sources.length - 1;
    return extra > 0 ? `${esc(name)} <span class="source-extra">+${extra}</span>` : esc(name);
  }
  // Fallback to default_vendor_id
  const vendor = maps.vendorMap.get(part.default_vendor_id);
  return vendor ? esc(vendor.vendor_name) : "—";
}

// ─── grouping ──────────────────────────────────────────────────
function buildCategoryGroups(parts, catMap, categories) {
  // Identify parent (top-level) categories and subcategories
  const parentCats = categories.filter(c => !c.parent_id);
  const subCatsByParent = new Map();
  for (const cat of categories) {
    if (cat.parent_id) {
      if (!subCatsByParent.has(cat.parent_id)) subCatsByParent.set(cat.parent_id, []);
      subCatsByParent.get(cat.parent_id).push(cat);
    }
  }

  // Build groups
  const groups = []; // { parentName, subName, parts[] }
  const usedParts = new Set();

  // Sort parents by sort_order if it exists, else by name
  const sortedParents = [...parentCats].sort((a, b) => {
    if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order;
    return (a.name || "").localeCompare(b.name || "");
  });

  for (const parent of sortedParents) {
    const subs = subCatsByParent.get(parent.id) || [];
    const sortedSubs = [...subs].sort((a, b) => {
      if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order;
      return (a.name || "").localeCompare(b.name || "");
    });

    // Parts directly in parent (no subcategory)
    const directParts = parts.filter(p => p.part_category_id === parent.id);
    if (directParts.length > 0) {
      groups.push({ parentName: parent.name, subName: null, parts: directParts });
      directParts.forEach(p => usedParts.add(p.id));
    }

    // Parts in subcategories
    for (const sub of sortedSubs) {
      const subParts = parts.filter(p => p.part_category_id === sub.id);
      if (subParts.length > 0) {
        groups.push({ parentName: parent.name, subName: sub.name, parts: subParts });
        subParts.forEach(p => usedParts.add(p.id));
      }
    }
  }

  // Uncategorized
  const uncategorized = parts.filter(p => !usedParts.has(p.id));
  if (uncategorized.length > 0) {
    groups.push({ parentName: "UNCATEGORIZED", subName: null, parts: uncategorized });
  }

  return groups;
}

// ─── HTML builders ─────────────────────────────────────────────

function buildSummaryRow(part, idx, inv, maps, vendorSources, inventoryItems, locationMap) {
  const vehicle = getVehicle(part, maps);
  const { value: retail } = getPartRetailEffectiveSafe(part);
  const demand = inv?.required_total ?? 0;
  const onHand = inv?.physical_stock ?? 0;
  const compactLoc = onHand > 0
    ? getCompactLocation(part.id, inventoryItems, locationMap)
    : "—";
  const isUnassigned = compactLoc === "UNASSIGNED";
  const source = getCompactSource(part, maps, vendorSources);

  return `<tr class="${idx % 2 === 0 ? "even" : "odd"}">
    <td class="num">${idx + 1}</td>
    <td>
      <div class="part-name">${esc(part.part_name)}</div>
      ${part.vendor_part_number ? `<div class="part-num">${esc(part.vendor_part_number)}</div>` : ""}
      ${part.part_type && part.part_type !== "PURCHASED_VENDOR" ? `<div class="part-type">${PART_TYPE_LABELS[part.part_type] || part.part_type}</div>` : ""}
    </td>
    <td class="small">${source}</td>
    <td class="small">${vehicle ? esc(vehicle) : "—"}</td>
    <td class="money">${formatCurrency(part.cost || 0)}</td>
    <td class="money">${formatCurrency(retail)}</td>
    <td class="center qty">${demand}</td>
    <td class="center qty">${onHand}</td>
    <td class="small loc${isUnassigned ? " unassigned" : ""}">${isUnassigned ? '<span class="unassigned-tag">UNASSIGNED</span>' : esc(compactLoc || "—")}</td>
  </tr>`;
}

function buildDetailSection(part, inv, maps, vendorSources, inventoryItems, locationMap) {
  const { value: retail } = getPartRetailEffectiveSafe(part);
  const vehicle = getVehicle(part, maps);
  const catPath = getCategoryPath(part.part_category_id, maps.catMap);
  const demand = inv?.required_total ?? 0;
  const onHand = inv?.physical_stock ?? 0;

  // Operational quantities
  const available = inv?.available ?? 0;
  const reserved = inv?.reserved_total ?? 0;
  const onOrder = inv?.on_order ?? 0;
  const toOrder = inv?.to_order ?? 0;
  const reorderPt = part.reorder_point ?? 0;
  const reorderQty = part.reorder_quantity ?? 1;

  // Locations
  const locations = getDetailedLocations(part.id, inventoryItems, locationMap);

  // Vendor sources
  const sources = vendorSources.filter(s => s.part_id === part.id && s.is_active !== false)
    .sort((a, b) => (b.is_preferred ? 1 : 0) - (a.is_preferred ? 1 : 0));

  const hasOps = available > 0 || reserved > 0 || onOrder > 0 || toOrder > 0 || reorderPt > 0;

  return `<div class="part-detail">
    <div class="detail-header">${esc(part.part_name)}</div>
    <div class="detail-grid">
      <div class="detail-col">
        <div class="detail-label">Identity</div>
        ${part.vendor_part_number ? `<div class="detail-row"><span class="dl">Part #:</span> ${esc(part.vendor_part_number)}</div>` : ""}
        ${vehicle ? `<div class="detail-row"><span class="dl">Vehicle:</span> ${esc(vehicle)}</div>` : ""}
        ${catPath ? `<div class="detail-row"><span class="dl">Category:</span> ${esc(catPath)}</div>` : ""}
        ${part.part_type && part.part_type !== "PURCHASED_VENDOR" ? `<div class="detail-row"><span class="dl">Type:</span> ${PART_TYPE_LABELS[part.part_type] || part.part_type}</div>` : ""}
        ${part.notes ? `<div class="detail-row"><span class="dl">Notes:</span> ${esc(part.notes)}</div>` : ""}
      </div>
      <div class="detail-col">
        <div class="detail-label">Financial</div>
        <div class="detail-row"><span class="dl">Cost:</span> ${formatCurrency(part.cost || 0)}</div>
        <div class="detail-row"><span class="dl">Retail:</span> ${formatCurrency(retail)}</div>
        ${retail > 0 && (part.cost || 0) > 0 ? `<div class="detail-row"><span class="dl">Margin:</span> ${(((retail - part.cost) / retail) * 100).toFixed(1)}%</div>` : ""}
      </div>
      <div class="detail-col">
        <div class="detail-label">Operational</div>
        <div class="detail-row"><span class="dl">Demand:</span> <strong>${demand}</strong></div>
        <div class="detail-row"><span class="dl">On Hand:</span> <strong>${onHand}</strong></div>
        ${hasOps ? `
          <div class="detail-row"><span class="dl">Available:</span> ${available}</div>
          <div class="detail-row"><span class="dl">Reserved:</span> ${reserved}</div>
          <div class="detail-row"><span class="dl">On Order:</span> ${onOrder}</div>
          <div class="detail-row"><span class="dl">To Order:</span> ${toOrder}</div>
          ${reorderPt > 0 ? `<div class="detail-row"><span class="dl">Min Stock:</span> ${reorderPt}</div>` : ""}
        ` : ""}
      </div>
    </div>
    ${locations.length > 0 ? `
      <div class="detail-section">
        <div class="detail-label">Physical Locations</div>
        ${locations.map(l => `<div class="detail-row loc-row${!l.path || l.path === "UNASSIGNED" ? " unassigned" : ""}"><span class="loc-path">${esc(l.path)}</span> <span class="loc-qty">— Qty ${l.qty}</span></div>`).join("")}
      </div>
    ` : ""}
    ${sources.length > 0 ? `
      <div class="detail-section">
        <div class="detail-label">Purchasing Sources</div>
        <table class="source-table">
          <thead><tr><th>Vendor</th><th>SKU</th><th style="text-align:right">Cost</th><th>Lead Time</th><th>Preferred</th><th>URL</th></tr></thead>
          <tbody>
          ${sources.map(s => {
            const v = maps.vendorMap.get(s.vendor_id);
            return `<tr>
              <td>${v ? esc(v.vendor_name) : "—"}</td>
              <td class="mono">${s.vendor_part_number ? esc(s.vendor_part_number) : "—"}</td>
              <td class="money">${s.unit_cost != null ? formatCurrency(s.unit_cost) : "—"}</td>
              <td>${s.lead_time_days != null ? `${s.lead_time_days}d` : "—"}</td>
              <td>${s.is_preferred ? "★" : ""}</td>
              <td class="small">${s.order_url ? esc(s.order_url) : ""}</td>
            </tr>`;
          }).join("")}
          </tbody>
        </table>
      </div>
    ` : ""}
  </div>`;
}

// ─── main builder ──────────────────────────────────────────────
export function buildPartsListPrintHTML({
  parts,
  categories,
  vendors,
  makes,
  models,
  years,
  inventoryViewMap,
  inventoryItems = [],
  locations = [],
  vendorSources = [],
  title = "Parts Catalog",
  categoryLabel = null,
}) {
  const maps = buildLookupMaps({ categories, vendors, makes, models, years });
  const locationMap = new Map(locations.map(l => [l.id, l]));

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const totalCost = parts.reduce((s, p) => s + (p.cost || 0), 0);
  const totalRetail = parts.reduce((s, p) => s + getPartRetailEffectiveSafe(p).value, 0);

  // Build category-grouped structure
  const groups = buildCategoryGroups(parts, maps.catMap, categories);

  // Determine if single-category report
  const isSingleCategory = categoryLabel != null;
  const subtitle = isSingleCategory
    ? categoryLabel
    : "All Categories";

  // Build grouped sections
  let currentParent = null;
  let globalIdx = 0;
  let sectionsHTML = "";
  let detailsHTML = "";

  for (const group of groups) {
    const isNewParent = group.parentName !== currentParent;
    currentParent = group.parentName;

    // Parent category heading (only when it changes and we're multi-category)
    if (isNewParent && !isSingleCategory) {
      sectionsHTML += `<div class="category-group"><h2 class="cat-heading">${esc(group.parentName.toUpperCase())}</h2>`;
    } else if (isNewParent && isSingleCategory) {
      // Single category: parent is already the report heading, skip the parent heading
      sectionsHTML += `<div class="category-group">`;
    }

    // Subcategory heading
    const subLabel = group.subName || (group.parentName === "UNCATEGORIZED" ? null : "General");
    const partCount = group.parts.length;

    if (subLabel) {
      sectionsHTML += `<div class="subcategory-group">
        <h3 class="subcat-heading">${esc(subLabel)} <span class="part-count">· ${partCount} part${partCount !== 1 ? "s" : ""}</span></h3>`;
    } else {
      sectionsHTML += `<div class="subcategory-group">
        <h3 class="subcat-heading">${esc(group.parentName)} <span class="part-count">· ${partCount} part${partCount !== 1 ? "s" : ""}</span></h3>`;
    }

    // Summary table
    sectionsHTML += `<table class="parts-table">
      <thead><tr>
        <th class="col-num">#</th>
        <th>Part Name / Part #</th>
        <th>Source</th>
        <th>Vehicle</th>
        <th style="text-align:right">Cost</th>
        <th style="text-align:right">Retail</th>
        <th style="text-align:center">Demand</th>
        <th style="text-align:center">On Hand</th>
        <th>Location</th>
      </tr></thead><tbody>`;

    let groupDemand = 0;
    let groupOnHand = 0;

    for (const part of group.parts) {
      globalIdx++;
      const inv = inventoryViewMap?.get(part.id);
      const d = inv?.required_total ?? 0;
      const oh = inv?.physical_stock ?? 0;
      groupDemand += d;
      groupOnHand += oh;

      sectionsHTML += buildSummaryRow(part, globalIdx, inv, maps, vendorSources, inventoryItems, locationMap);
      detailsHTML += buildDetailSection(part, inv, maps, vendorSources, inventoryItems, locationMap);
    }

    sectionsHTML += `</tbody></table>`;

    // Group totals (only when the group has meaningful inventory activity)
    if (groupDemand > 0 || groupOnHand > 0) {
      sectionsHTML += `<div class="group-totals">
        <span>Group Demand: <strong>${groupDemand}</strong></span>
        <span>Group On Hand: <strong>${groupOnHand}</strong></span>
      </div>`;
    }

    sectionsHTML += `</div>`; // close subcategory-group

    // Close category group if next group is a different parent or end
    const nextGroup = groups[groups.indexOf(group) + 1];
    if (!nextGroup || nextGroup.parentName !== currentParent) {
      sectionsHTML += `</div>`; // close category-group
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: landscape; margin: 0.4in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 9pt; color: #1a1a1a; background: #fff; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #dc2626; padding-bottom: 8px; margin-bottom: 12px; }
  .header h1 { font-size: 18pt; font-weight: 800; color: #111; letter-spacing: 0.5px; }
  .header .meta { text-align: right; font-size: 8pt; color: #666; }
  .subtitle { font-size: 10pt; color: #555; margin-bottom: 2px; }

  /* Summary strip */
  .summary-strip { display: flex; gap: 24px; margin-bottom: 16px; padding: 6px 12px; background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px; font-size: 9pt; }
  .summary-strip strong { font-size: 11pt; }

  /* Category headings */
  .category-group { margin-bottom: 16px; break-inside: avoid; }
  .cat-heading { font-size: 13pt; font-weight: 800; color: #111; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #333; padding-bottom: 4px; margin-bottom: 8px; break-after: avoid; }
  .subcategory-group { margin-bottom: 12px; break-inside: avoid; }
  .subcat-heading { font-size: 10pt; font-weight: 700; color: #333; margin-bottom: 4px; break-after: avoid; }
  .part-count { font-weight: 400; color: #888; font-size: 9pt; }

  /* Summary table */
  .parts-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 4px; }
  .parts-table th { background: #1a1a1a; color: #fff; padding: 5px 4px; text-align: left; font-weight: 600; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
  .parts-table td { padding: 4px 4px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  .parts-table tr.even td { background: #fafafa; }
  .parts-table tr.odd td { background: #fff; }
  .col-num { width: 22px; }
  .num { text-align: center; color: #999; font-size: 7pt; }
  .part-name { font-weight: 600; font-size: 8.5pt; color: #111; }
  .part-num { font-family: 'SF Mono', 'Courier New', monospace; font-size: 7pt; color: #666; margin-top: 1px; }
  .part-type { font-size: 7pt; color: #dc2626; font-weight: 500; margin-top: 1px; }
  .small { font-size: 7.5pt; color: #444; }
  .money { text-align: right; font-family: 'SF Mono', 'Courier New', monospace; font-size: 8pt; white-space: nowrap; }
  .center { text-align: center; }
  .qty { font-weight: 600; font-size: 8.5pt; }
  .loc { font-size: 7pt; color: #555; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
  .source-extra { color: #999; font-size: 7pt; }
  .unassigned-tag { background: #fef2f2; color: #dc2626; font-weight: 600; font-size: 7pt; padding: 1px 4px; border-radius: 2px; border: 1px solid #fecaca; }

  /* Group totals */
  .group-totals { display: flex; gap: 20px; padding: 4px 8px; font-size: 8pt; color: #555; border-top: 1px solid #ddd; margin-bottom: 4px; }
  .group-totals strong { color: #111; }

  /* Detail sections */
  .details-divider { margin: 24px 0 16px 0; border-top: 3px solid #333; padding-top: 8px; }
  .details-divider h2 { font-size: 14pt; font-weight: 800; color: #111; }
  .part-detail { margin-bottom: 14px; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; background: #fafafa; break-inside: avoid; page-break-inside: avoid; }
  .detail-header { font-size: 10pt; font-weight: 700; color: #111; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 6px; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 6px; }
  .detail-col { }
  .detail-label { font-size: 8pt; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px; border-bottom: 1px solid #e5e5e5; padding-bottom: 2px; }
  .detail-row { font-size: 8pt; color: #333; margin-bottom: 1px; }
  .dl { color: #777; }
  .detail-section { margin-top: 6px; }
  .loc-row { font-size: 8pt; }
  .loc-row.unassigned .loc-path { color: #dc2626; font-weight: 600; }
  .loc-qty { color: #666; }
  .mono { font-family: 'SF Mono', 'Courier New', monospace; font-size: 7.5pt; }

  /* Source table in detail */
  .source-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-top: 4px; }
  .source-table th { background: #eee; color: #333; padding: 3px 4px; text-align: left; font-weight: 600; font-size: 7pt; text-transform: uppercase; }
  .source-table td { padding: 3px 4px; border-bottom: 1px solid #eee; }

  /* Footer */
  .footer { margin-top: 16px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 7pt; color: #999; display: flex; justify-content: space-between; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .parts-table tr { page-break-inside: avoid; }
    .category-group { break-inside: auto; }
    .subcategory-group { break-inside: auto; }
    .part-detail { break-inside: avoid; page-break-inside: avoid; }
    .cat-heading { break-after: avoid; }
    .subcat-heading { break-after: avoid; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>ÄCHTUNG KRAFT — ${esc(title.toUpperCase())}</h1>
      <div class="subtitle">${esc(subtitle)} · ${parts.length} part${parts.length !== 1 ? "s" : ""}</div>
    </div>
    <div class="meta">${esc(dateStr)}<br/>${esc(timeStr)}</div>
  </div>

  <div class="summary-strip">
    <span>Parts: <strong>${parts.length}</strong></span>
    <span>Total Cost: <strong>${formatCurrency(totalCost)}</strong></span>
    <span>Total Retail: <strong>${formatCurrency(totalRetail)}</strong></span>
  </div>

  ${sectionsHTML}

  <div class="details-divider"><h2>PART DETAILS</h2></div>
  ${detailsHTML}

  <div class="footer">
    <span>Ächtung Kraft — Parts Report</span>
    <span>Generated ${esc(dateStr)} ${esc(timeStr)}</span>
  </div>
</body>
</html>`;
}

/**
 * Opens the print dialog for a parts list.
 */
export function printPartsList(options) {
  const html = buildPartsListPrintHTML(options);
  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}