import {
  esc, buildLookupMaps, buildCategoryGroups, getCategoryPath, getVehicle,
  getDetailedLocations, getTimestamp, baseStyles, headerHTML, footerHTML,
  formatCurrency, getPartRetailEffectiveSafe, PART_TYPE_LABELS,
} from "./printHelpers";

/**
 * Illustrated Catalog — one card per part with thumbnail, all locations, all sources.
 */
export function buildIllustratedCatalog({
  parts, categories, vendors, makes, models, years,
  inventoryViewMap, inventoryItems = [], locations = [], vendorSources = [],
  categoryLabel = null, searchTerm = "",
  options = {},
}) {
  const {
    includeImages = true,
    includeVendorSources = true,
    includeLocations = true,
    includeNotes = true,
  } = options;

  const maps = buildLookupMaps({ categories, vendors, makes, models, years });
  const locationMap = new Map(locations.map(l => [l.id, l]));
  const ts = getTimestamp();
  const groups = buildCategoryGroups(parts, maps.catMap, categories);

  const subtitle = categoryLabel
    ? `${categoryLabel} · ${parts.length} Part${parts.length !== 1 ? "s" : ""}`
    : `All Categories · ${parts.length} Part${parts.length !== 1 ? "s" : ""}`;
  const filterNote = searchTerm ? `Search: "${searchTerm}"` : null;

  // Count parts with images
  const partsWithImages = parts.filter(p => p.featured_photo || (p.photos && p.photos.length > 0)).length;
  const imageRatio = parts.length > 0 ? partsWithImages / parts.length : 1;
  const imageWarning = includeImages && imageRatio < 0.9
    ? `<div class="image-warning">Note: ${parts.length - partsWithImages} of ${parts.length} parts do not have images. Those parts will display a placeholder.</div>`
    : "";

  let currentParent = null;
  let cardsHTML = "";

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const isNewParent = group.parentName !== currentParent;
    currentParent = group.parentName;

    if (isNewParent) {
      cardsHTML += `<div class="category-group"><h2 class="cat-heading">${esc(group.parentName.toUpperCase())}</h2>`;
    }

    const subLabel = group.subName || (group.parentName === "UNCATEGORIZED" ? null : "General");
    const headingText = subLabel || group.parentName;
    const partCount = group.parts.length;

    cardsHTML += `<div class="subcategory-group">
      <h3 class="subcat-heading">${esc(headingText)} <span class="part-count">· ${partCount} Part${partCount !== 1 ? "s" : ""}</span></h3>`;

    for (const part of group.parts) {
      const inv = inventoryViewMap?.get(part.id);
      const demand = inv?.required_total ?? 0;
      const onHand = inv?.physical_stock ?? 0;
      const { value: retail } = getPartRetailEffectiveSafe(part);
      const vehicle = getVehicle(part, maps);
      const catPath = getCategoryPath(part.part_category_id, maps.catMap);
      const imgUrl = part.featured_photo || (part.photos && part.photos[0]) || null;
      const locs = includeLocations ? getDetailedLocations(part.id, inventoryItems, locationMap) : [];
      const sources = includeVendorSources
        ? vendorSources.filter(s => s.part_id === part.id && s.is_active !== false)
            .sort((a, b) => (b.is_preferred ? 1 : 0) - (a.is_preferred ? 1 : 0))
        : [];

      // Preferred source for quick display
      const prefSource = sources.find(s => s.is_preferred) || sources[0];
      const prefVendor = prefSource ? maps.vendorMap.get(prefSource.vendor_id) : maps.vendorMap.get(part.default_vendor_id);
      const otherSources = sources.length > 1 ? sources.filter(s => s !== prefSource) : [];

      cardsHTML += `<div class="part-card">
        <div class="card-top">
          ${includeImages ? `<div class="card-thumb">${imgUrl
            ? `<img src="${esc(imgUrl)}" alt="${esc(part.part_name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="placeholder" style="display:none">No Image</div>`
            : `<div class="placeholder">No Image</div>`
          }</div>` : ""}
          <div class="card-info">
            <div class="card-name">${esc(part.part_name)}</div>
            ${part.vendor_part_number ? `<div class="card-pn"><span class="pn-label">Part #:</span> ${esc(part.vendor_part_number)}</div>` : ""}
            ${part.part_type && part.part_type !== "PURCHASED_VENDOR" ? `<div class="card-type">${PART_TYPE_LABELS[part.part_type] || part.part_type}</div>` : ""}
            ${catPath ? `<div class="card-meta"><span class="ml">Category:</span> ${esc(catPath)}</div>` : ""}
            ${vehicle ? `<div class="card-meta"><span class="ml">Vehicle:</span> ${esc(vehicle)}</div>` : ""}
            ${prefVendor ? `<div class="card-meta"><span class="ml">Preferred Vendor:</span> ${esc(prefVendor.vendor_name)}</div>` : ""}
            ${otherSources.length > 0 ? `<div class="card-meta"><span class="ml">Other Sources:</span> ${otherSources.map(s => {
              const v = maps.vendorMap.get(s.vendor_id);
              return v ? esc(v.vendor_name) : "—";
            }).join(", ")}</div>` : ""}
          </div>
          <div class="card-inv">
            <div class="inv-row"><span class="inv-label">Demand</span><span class="inv-val">${demand}</span></div>
            <div class="inv-row"><span class="inv-label">On Hand</span><span class="inv-val">${onHand}</span></div>
            <div class="inv-row price"><span class="inv-label">Cost</span><span class="inv-val">${formatCurrency(part.cost || 0)}</span></div>
            <div class="inv-row price"><span class="inv-label">Retail</span><span class="inv-val">${formatCurrency(retail)}</span></div>
          </div>
        </div>
        ${includeNotes && part.notes ? `<div class="card-notes"><span class="ml">Notes:</span> ${esc(part.notes)}</div>` : ""}
        ${includeLocations && locs.length > 0 ? `
          <div class="card-section">
            <div class="cs-label">Locations</div>
            <div class="loc-list">${locs.map(l =>
              `<div class="loc-item${l.path === "UNASSIGNED" ? " unassigned" : ""}">${esc(l.path)} <span class="loc-qty">— Qty ${l.qty}</span></div>`
            ).join("")}</div>
          </div>
        ` : ""}
        ${includeVendorSources && sources.length > 0 ? `
          <div class="card-section">
            <div class="cs-label">Vendor Sources</div>
            <table class="src-table"><thead><tr>
              <th>Vendor</th><th>SKU</th><th style="text-align:right">Cost</th><th>Lead Time</th><th>Pref</th><th>URL</th>
            </tr></thead><tbody>
            ${sources.map(s => {
              const v = maps.vendorMap.get(s.vendor_id);
              return `<tr>
                <td>${v ? esc(v.vendor_name) : "—"}</td>
                <td class="mono">${s.vendor_part_number ? esc(s.vendor_part_number) : "—"}</td>
                <td class="money">${s.unit_cost != null ? formatCurrency(s.unit_cost) : "—"}</td>
                <td>${s.lead_time_days != null ? `${s.lead_time_days}d` : "—"}</td>
                <td>${s.is_preferred ? "★" : ""}</td>
                <td class="small url-cell">${s.order_url ? esc(s.order_url) : ""}</td>
              </tr>`;
            }).join("")}
            </tbody></table>
          </div>
        ` : ""}
      </div>`;
    }

    cardsHTML += `</div>`; // close subcategory

    const nextGroup = groups[gi + 1];
    if (!nextGroup || nextGroup.parentName !== currentParent) {
      cardsHTML += `</div>`; // close category-group
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Illustrated Catalog</title>
<style>
  ${baseStyles()}
  @page { size: portrait; margin: 0.5in; }
  .image-warning { background: #fffbeb; border: 1px solid #fbbf24; color: #92400e; padding: 6px 10px; border-radius: 4px; font-size: 8pt; margin-bottom: 12px; }
  .part-card { border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 10px; background: #fafafa; break-inside: avoid; page-break-inside: avoid; }
  .card-top { display: flex; gap: 12px; }
  .card-thumb { width: 100px; min-width: 100px; height: 100px; border: 1px solid #e5e5e5; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #f0f0f0; flex-shrink: 0; }
  .card-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 8pt; font-weight: 500; }
  .card-info { flex: 1; min-width: 0; }
  .card-name { font-size: 11pt; font-weight: 700; color: #111; margin-bottom: 2px; }
  .card-pn { font-family: 'SF Mono', 'Courier New', monospace; font-size: 8pt; color: #666; }
  .pn-label { color: #999; }
  .card-type { font-size: 7.5pt; color: #dc2626; font-weight: 500; }
  .card-meta { font-size: 8pt; color: #444; margin-top: 1px; }
  .ml { color: #888; }
  .card-inv { width: 110px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; padding-left: 10px; border-left: 1px solid #e5e5e5; }
  .inv-row { display: flex; justify-content: space-between; font-size: 8.5pt; }
  .inv-label { color: #777; font-size: 7.5pt; }
  .inv-val { font-weight: 700; color: #111; }
  .inv-row.price .inv-val { font-family: 'SF Mono', 'Courier New', monospace; font-size: 8pt; }
  .card-notes { font-size: 7.5pt; color: #555; margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee; }
  .card-section { margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee; }
  .cs-label { font-size: 7.5pt; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 2px; }
  .loc-list { font-size: 8pt; }
  .loc-item { color: #333; }
  .loc-item.unassigned { color: #dc2626; font-weight: 600; }
  .loc-qty { color: #888; }
  .src-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
  .src-table th { background: #eee; color: #333; padding: 3px 4px; text-align: left; font-weight: 600; font-size: 7pt; text-transform: uppercase; }
  .src-table td { padding: 2px 4px; border-bottom: 1px solid #eee; }
  .mono { font-family: 'SF Mono', 'Courier New', monospace; font-size: 7pt; }
  .money { text-align: right; font-family: 'SF Mono', 'Courier New', monospace; font-size: 7.5pt; }
  .small { font-size: 7pt; color: #555; }
  .url-cell { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media print {
    .part-card { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
</head><body>
  ${headerHTML("Illustrated Catalog", subtitle, filterNote, ts)}
  ${imageWarning}
  ${cardsHTML}
  ${footerHTML(ts)}
</body></html>`;
}