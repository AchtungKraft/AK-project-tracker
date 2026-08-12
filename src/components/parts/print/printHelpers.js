import { formatCurrency, getPartRetailEffectiveSafe } from "@/components/supply/pricingHelpers";

export { formatCurrency, getPartRetailEffectiveSafe };

export function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildLookupMaps({ categories, vendors, makes, models, years }) {
  return {
    catMap: new Map(categories.map(c => [c.id, c])),
    vendorMap: new Map(vendors.map(v => [v.id, v])),
    makeMap: new Map(makes.map(m => [m.id, m])),
    modelMap: new Map(models.map(m => [m.id, m])),
    yearMap: new Map(years.map(y => [y.id, y])),
  };
}

export const PART_TYPE_LABELS = {
  PURCHASED_VENDOR: "Vendor",
  AK_MANUFACTURED: "AK Mfg",
  CLIENT_SUPPLIED: "Client",
  TAKE_OFF: "Take-Off",
  STOCK_AK: "AK Stock",
  WARRANTY_REPLACEMENT: "Warranty",
};

export function getVehicle(part, maps) {
  const segs = [];
  const year = maps.yearMap.get(part.car_year_id);
  const make = maps.makeMap.get(part.car_make_id);
  const model = maps.modelMap.get(part.car_model_id);
  if (year?.year) segs.push(year.year);
  if (make?.name) segs.push(make.name);
  if (model?.name) segs.push(model.name);
  return segs.length > 0 ? segs.join(" ") : "";
}

export function getCategoryPath(catId, catMap) {
  if (!catId) return "";
  const cat = catMap.get(catId);
  if (!cat) return "";
  if (cat.parent_id) {
    const parent = catMap.get(cat.parent_id);
    if (parent) return `${parent.name} › ${cat.name}`;
  }
  return cat.name;
}

export function buildLocationPath(locationId, locationMap) {
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

export function getDetailedLocations(partId, inventoryItems, locationMap) {
  const items = inventoryItems.filter(i => i.part_id === partId && (i.quantity_on_hand || 0) > 0);
  return items.map(item => {
    const path = item.location_id ? buildLocationPath(item.location_id, locationMap) : null;
    return { path: path || "UNASSIGNED", qty: item.quantity_on_hand || 0 };
  });
}

export function getCompactSource(part, maps, vendorSources) {
  const sources = vendorSources.filter(s => s.part_id === part.id && s.is_active !== false);
  if (sources.length > 0) {
    const preferred = sources.find(s => s.is_preferred) || sources[0];
    const vendor = maps.vendorMap.get(preferred.vendor_id);
    const name = vendor?.vendor_name || "—";
    const extra = sources.length - 1;
    return extra > 0 ? `${esc(name)} <span class="source-extra">+${extra}</span>` : esc(name);
  }
  const vendor = maps.vendorMap.get(part.default_vendor_id);
  return vendor ? esc(vendor.vendor_name) : "—";
}

export function buildCategoryGroups(parts, catMap, categories) {
  const parentCats = categories.filter(c => !c.parent_id);
  const subCatsByParent = new Map();
  for (const cat of categories) {
    if (cat.parent_id) {
      if (!subCatsByParent.has(cat.parent_id)) subCatsByParent.set(cat.parent_id, []);
      subCatsByParent.get(cat.parent_id).push(cat);
    }
  }

  const groups = [];
  const usedParts = new Set();

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

    const directParts = parts.filter(p => p.part_category_id === parent.id);
    if (directParts.length > 0) {
      groups.push({ parentName: parent.name, subName: null, parts: directParts });
      directParts.forEach(p => usedParts.add(p.id));
    }

    for (const sub of sortedSubs) {
      const subParts = parts.filter(p => p.part_category_id === sub.id);
      if (subParts.length > 0) {
        groups.push({ parentName: parent.name, subName: sub.name, parts: subParts });
        subParts.forEach(p => usedParts.add(p.id));
      }
    }
  }

  const uncategorized = parts.filter(p => !usedParts.has(p.id));
  if (uncategorized.length > 0) {
    groups.push({ parentName: "UNCATEGORIZED", subName: null, parts: uncategorized });
  }

  return groups;
}

export function getTimestamp() {
  const now = new Date();
  return {
    dateStr: now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    timeStr: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function baseStyles() {
  return `
    @page { size: landscape; margin: 0.4in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 9pt; color: #1a1a1a; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #dc2626; padding-bottom: 8px; margin-bottom: 12px; }
    .header h1 { font-size: 18pt; font-weight: 800; color: #111; letter-spacing: 0.5px; }
    .header .meta { text-align: right; font-size: 8pt; color: #666; }
    .subtitle { font-size: 10pt; color: #555; margin-bottom: 2px; }
    .filter-note { font-size: 8pt; color: #888; font-style: italic; }
    .summary-strip { display: flex; gap: 24px; margin-bottom: 16px; padding: 6px 12px; background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px; font-size: 9pt; }
    .summary-strip strong { font-size: 11pt; }
    .cat-heading { font-size: 13pt; font-weight: 800; color: #111; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #333; padding-bottom: 4px; margin-bottom: 8px; break-after: avoid; }
    .category-group { margin-bottom: 16px; }
    .subcategory-group { margin-bottom: 12px; }
    .subcat-heading { font-size: 10pt; font-weight: 700; color: #333; margin-bottom: 4px; break-after: avoid; }
    .part-count { font-weight: 400; color: #888; font-size: 9pt; }
    .source-extra { color: #999; font-size: 7pt; }
    .footer { margin-top: 16px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 7pt; color: #999; display: flex; justify-content: space-between; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .cat-heading { break-after: avoid; }
      .subcat-heading { break-after: avoid; }
      thead { display: table-header-group; }
    }
  `;
}

export function headerHTML(title, subtitle, filterNote, ts) {
  return `<div class="header">
    <div>
      <h1>ÄCHTUNG KRAFT — ${esc(title.toUpperCase())}</h1>
      <div class="subtitle">${esc(subtitle)}</div>
      ${filterNote ? `<div class="filter-note">${esc(filterNote)}</div>` : ""}
    </div>
    <div class="meta">${esc(ts.dateStr)}<br/>${esc(ts.timeStr)}</div>
  </div>`;
}

export function footerHTML(ts, context = "Parts Tracker") {
  return `<div class="footer">
    <span>Generated by AK Projects — ${esc(context)}</span>
    <span>${esc(ts.dateStr)} ${esc(ts.timeStr)}</span>
  </div>`;
}

export function openPrintWindow(html) {
  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}