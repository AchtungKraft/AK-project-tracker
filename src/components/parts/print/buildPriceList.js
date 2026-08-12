import {
  esc, buildLookupMaps, buildCategoryGroups, getVehicle,
  getTimestamp, baseStyles, headerHTML, footerHTML,
  formatCurrency, getPartRetailEffectiveSafe,
} from "./printHelpers";
import { renderPriceListRow, renderPriceListHeader, priceListCSS } from "./sharedPrintRenderers";

/**
 * Price List — client-facing. No cost, no inventory, no vendor names.
 * Uses shared renderPriceListRow for visual parity with Parts Group price list.
 */
export function buildPriceList({
  parts, categories, vendors, makes, models, years,
  categoryLabel = null, searchTerm = "",
  options = {},
}) {
  const {
    includeImages = true,
    includeDescriptions = true,
    includeVehicle = false,
  } = options;

  const maps = buildLookupMaps({ categories, vendors, makes, models, years });
  const ts = getTimestamp();
  const groups = buildCategoryGroups(parts, maps.catMap, categories);

  const subtitle = categoryLabel
    ? `${categoryLabel} · ${parts.length} Part${parts.length !== 1 ? "s" : ""}`
    : `All Categories · ${parts.length} Part${parts.length !== 1 ? "s" : ""}`;
  const filterNote = searchTerm ? `Search: "${searchTerm}"` : null;

  let globalIdx = 0;
  let sectionsHTML = "";

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const partCount = group.parts.length;

    sectionsHTML += `<div class="category-group">
      <h2 class="cat-heading">${esc(group.parentName.toUpperCase())} <span class="part-count">· ${partCount} Part${partCount !== 1 ? "s" : ""}</span></h2>`;

    sectionsHTML += renderPriceListHeader({ includeImages, includeVehicle, isGroupContext: false });

    for (const part of group.parts) {
      globalIdx++;
      const { value: retail } = getPartRetailEffectiveSafe(part);
      const vehicle = includeVehicle ? getVehicle(part, maps) : null;

      sectionsHTML += renderPriceListRow({
        name: part.part_name,
        partNumber: part.vendor_part_number,
        image: part.featured_photo || (part.photos && part.photos[0]) || null,
        notes: part.notes,
        vehicle,
        retail,
      }, globalIdx, { includeImages, includeDescriptions, includeVehicle, isGroupContext: false });
    }

    sectionsHTML += `</tbody></table></div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Price List</title>
<style>
  ${baseStyles()}
  ${priceListCSS()}
</style>
</head><body>
  ${headerHTML("Price List", subtitle, filterNote, ts)}
  ${sectionsHTML}
  ${footerHTML(ts)}
</body></html>`;
}