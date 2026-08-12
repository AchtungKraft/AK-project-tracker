import {
  esc, buildLookupMaps, buildCategoryGroups, getCompactSource,
  getTimestamp, baseStyles, headerHTML, footerHTML,
  formatCurrency, getPartRetailEffectiveSafe, PART_TYPE_LABELS,
} from "./printHelpers";
import { renderSummaryRow, renderSummaryHeader, summaryCSS } from "./sharedPrintRenderers";

/**
 * Summary Report — dense table, category-grouped, no images.
 * Uses shared renderSummaryRow for visual parity with Parts Group summary.
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

  let globalIdx = 0;
  let sectionsHTML = "";

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const partCount = group.parts.length;

    sectionsHTML += `<div class="category-group">
      <h2 class="cat-heading">${esc(group.parentName.toUpperCase())} <span class="part-count">· ${partCount} Part${partCount !== 1 ? "s" : ""}</span></h2>`;

    sectionsHTML += renderSummaryHeader({
      includeCost,
      includeRetail,
      isGroupContext: false,
    });

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

      sectionsHTML += renderSummaryRow({
        name: part.part_name,
        partNumber: part.vendor_part_number,
        partType: part.part_type,
        source,
        cost: part.cost || 0,
        retail,
        demand,
        stock: onHand,
      }, globalIdx, { includeCost, includeRetail, isGroupContext: false });
    }

    sectionsHTML += `</tbody>`;

    if (includeGroupTotals) {
      let colCount = 3; // #, Part, Vendor
      if (includeCost) colCount++;
      if (includeRetail) colCount++;
      sectionsHTML += `<tfoot><tr class="group-footer">
        <td colspan="2" class="gf-label">${partCount} Part${partCount !== 1 ? "s" : ""}</td>
        <td></td>
        ${includeCost ? `<td class="money gf-val">${formatCurrency(groupCost)}</td>` : ""}
        ${includeRetail ? `<td class="money gf-val">${formatCurrency(groupRetail)}</td>` : ""}
        <td class="center gf-val">${groupDemand}</td>
        <td class="center gf-val">${groupOnHand}</td>
      </tr></tfoot>`;
    }

    sectionsHTML += `</table></div>`; // close category-group
  }

  let stripHTML = `<div class="summary-strip">
    <span>Parts: <strong>${parts.length}</strong></span>`;
  if (includeCost) stripHTML += `<span>Total Cost: <strong>${formatCurrency(totalCost)}</strong></span>`;
  if (includeRetail) stripHTML += `<span>Total Retail: <strong>${formatCurrency(totalRetail)}</strong></span>`;
  stripHTML += `</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Summary Report</title>
<style>
  ${baseStyles()}
  ${summaryCSS()}
</style>
</head><body>
  ${headerHTML("Parts Catalog", subtitle, filterNote, ts)}
  ${stripHTML}
  ${sectionsHTML}
  ${footerHTML(ts)}
</body></html>`;
}