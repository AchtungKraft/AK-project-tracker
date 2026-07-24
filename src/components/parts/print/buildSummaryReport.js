import {
  esc, buildLookupMaps, buildCategoryGroups, getCompactSource,
  getTimestamp, baseStyles, headerHTML, footerHTML,
  formatCurrency, getPartRetailEffectiveSafe, PART_TYPE_LABELS,
} from "./printHelpers";

/**
 * Summary Report — dense table, category-grouped, no images.
 * Columns: #, Part, Preferred Vendor, Cost?, Retail?, Demand, On Hand
 */
export function buildSummaryReport({
  parts, categories, vendors, makes, models, years,
  inventoryViewMap, vendorSources = [],
  categoryLabel = null, searchTerm = "",
  options = {},
}) {
  const { includeCost = true, includeRetail = true, includeGroupTotals = true } = options;
  const maps = buildLookupMaps({ categories, vendors, makes, models, years });
  const ts = getTimestamp();
  const groups = buildCategoryGroups(parts, maps.catMap, categories);

  const subtitle = categoryLabel
    ? `${categoryLabel} · ${parts.length} Part${parts.length !== 1 ? "s" : ""}`
    : `All Categories · ${parts.length} Part${parts.length !== 1 ? "s" : ""}`;
  const filterNote = searchTerm ? `Search: "${searchTerm}"` : null;

  const totalCost = parts.reduce((s, p) => s + (p.cost || 0), 0);
  const totalRetail = parts.reduce((s, p) => s + getPartRetailEffectiveSafe(p).value, 0);

  // Compute column count for colspans
  let colCount = 5; // #, Part, Vendor, Demand, On Hand
  if (includeCost) colCount++;
  if (includeRetail) colCount++;

  let currentParent = null;
  let globalIdx = 0;
  let sectionsHTML = "";

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const isNewParent = group.parentName !== currentParent;
    currentParent = group.parentName;

    if (isNewParent) {
      if (gi > 0) {
        // check if previous group had different parent — close it
        const prevParent = groups[gi - 1].parentName;
        if (prevParent !== group.parentName) {
          // parent already closed below
        }
      }
      sectionsHTML += `<div class="category-group"><h2 class="cat-heading">${esc(group.parentName.toUpperCase())}</h2>`;
    }

    const subLabel = group.subName || (group.parentName === "UNCATEGORIZED" ? null : "General");
    const partCount = group.parts.length;
    const headingText = subLabel || group.parentName;

    sectionsHTML += `<div class="subcategory-group">
      <h3 class="subcat-heading">${esc(headingText)} <span class="part-count">· ${partCount} Part${partCount !== 1 ? "s" : ""}</span></h3>`;

    // Table
    sectionsHTML += `<table class="parts-table"><thead><tr>
      <th class="col-num">#</th>
      <th>Part</th>
      <th>Preferred Vendor</th>
      ${includeCost ? '<th style="text-align:right">Cost</th>' : ""}
      ${includeRetail ? '<th style="text-align:right">Retail</th>' : ""}
      <th style="text-align:center">Demand</th>
      <th style="text-align:center">On Hand</th>
    </tr></thead><tbody>`;

    let groupDemand = 0, groupOnHand = 0, groupCost = 0, groupRetail = 0;

    for (const part of group.parts) {
      globalIdx++;
      const inv = inventoryViewMap?.get(part.id);
      const demand = inv?.required_total ?? 0;
      const onHand = inv?.physical_stock ?? 0;
      const { value: retail } = getPartRetailEffectiveSafe(part);
      const source = getCompactSource(part, maps, vendorSources);

      groupDemand += demand;
      groupOnHand += onHand;
      groupCost += (part.cost || 0);
      groupRetail += retail;

      sectionsHTML += `<tr class="${globalIdx % 2 === 0 ? "even" : "odd"}">
        <td class="num">${globalIdx}</td>
        <td>
          <div class="part-name">${esc(part.part_name)}</div>
          ${part.vendor_part_number ? `<div class="part-num">Part #: ${esc(part.vendor_part_number)}</div>` : ""}
          ${part.part_type && part.part_type !== "PURCHASED_VENDOR" ? `<div class="part-type">${PART_TYPE_LABELS[part.part_type] || part.part_type}</div>` : ""}
        </td>
        <td class="small">${source}</td>
        ${includeCost ? `<td class="money">${formatCurrency(part.cost || 0)}</td>` : ""}
        ${includeRetail ? `<td class="money">${formatCurrency(retail)}</td>` : ""}
        <td class="center qty">${demand}</td>
        <td class="center qty">${onHand}</td>
      </tr>`;
    }

    sectionsHTML += `</tbody>`;

    // Group footer
    if (includeGroupTotals) {
      sectionsHTML += `<tfoot><tr class="group-footer">
        <td colspan="2" class="gf-label">${partCount} Part${partCount !== 1 ? "s" : ""}</td>
        <td></td>
        ${includeCost ? `<td class="money gf-val">${formatCurrency(groupCost)}</td>` : ""}
        ${includeRetail ? `<td class="money gf-val">${formatCurrency(groupRetail)}</td>` : ""}
        <td class="center gf-val">${groupDemand}</td>
        <td class="center gf-val">${groupOnHand}</td>
      </tr></tfoot>`;
    }

    sectionsHTML += `</table></div>`; // close subcategory-group

    // Close category group
    const nextGroup = groups[gi + 1];
    if (!nextGroup || nextGroup.parentName !== currentParent) {
      sectionsHTML += `</div>`; // close category-group
    }
  }

  // Summary strip
  let stripHTML = `<div class="summary-strip">
    <span>Parts: <strong>${parts.length}</strong></span>`;
  if (includeCost) stripHTML += `<span>Total Cost: <strong>${formatCurrency(totalCost)}</strong></span>`;
  if (includeRetail) stripHTML += `<span>Total Retail: <strong>${formatCurrency(totalRetail)}</strong></span>`;
  stripHTML += `</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Summary Report</title>
<style>
  ${baseStyles()}
  .parts-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 2px; }
  .parts-table th { background: #1a1a1a; color: #fff; padding: 5px 5px; text-align: left; font-weight: 600; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
  .parts-table td { padding: 4px 5px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  .parts-table tr.even td { background: #fafafa; }
  .parts-table tr.odd td { background: #fff; }
  .col-num { width: 24px; }
  .num { text-align: center; color: #999; font-size: 7pt; }
  .part-name { font-weight: 700; font-size: 9pt; color: #111; }
  .part-num { font-family: 'SF Mono', 'Courier New', monospace; font-size: 7pt; color: #777; margin-top: 1px; }
  .part-type { font-size: 7pt; color: #dc2626; font-weight: 500; margin-top: 1px; }
  .small { font-size: 7.5pt; color: #444; }
  .money { text-align: right; font-family: 'SF Mono', 'Courier New', monospace; font-size: 8pt; white-space: nowrap; }
  .center { text-align: center; }
  .qty { font-weight: 600; font-size: 8.5pt; }
  .source-extra { color: #999; font-size: 7pt; }
  .group-footer td { border-top: 2px solid #ccc; border-bottom: none; background: #f5f5f5 !important; padding: 4px 5px; }
  .gf-label { font-size: 8pt; font-weight: 600; color: #555; }
  .gf-val { font-weight: 700; color: #111; }
  @media print { .parts-table tr { page-break-inside: avoid; } }
</style>
</head><body>
  ${headerHTML("Parts Catalog", subtitle, filterNote, ts)}
  ${stripHTML}
  ${sectionsHTML}
  ${footerHTML(ts)}
</body></html>`;
}