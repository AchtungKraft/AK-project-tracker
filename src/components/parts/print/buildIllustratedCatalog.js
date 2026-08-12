import {
  esc, buildLookupMaps, buildCategoryGroups, getCategoryPath, getVehicle,
  getDetailedLocations, getTimestamp, baseStyles, headerHTML, footerHTML,
  formatCurrency, getPartRetailEffectiveSafe, PART_TYPE_LABELS,
} from "./printHelpers";
import { renderIllustratedCard, illustratedCSS } from "./sharedPrintRenderers";

/**
 * Illustrated Catalog — one full-width card per part with thumbnail, all locations, all sources.
 * Uses shared renderIllustratedCard for visual parity with Parts Group illustrated.
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
      const { value: retail } = getPartRetailEffectiveSafe(part);
      const vehicle = getVehicle(part, maps);
      const catPath = getCategoryPath(part.part_category_id, maps.catMap);
      const locs = includeLocations ? getDetailedLocations(part.id, inventoryItems, locationMap) : [];
      const sources = includeVendorSources
        ? vendorSources.filter(s => s.part_id === part.id && s.is_active !== false)
            .sort((a, b) => (b.is_preferred ? 1 : 0) - (a.is_preferred ? 1 : 0))
        : [];

      const prefSource = sources.find(s => s.is_preferred) || sources[0];
      const prefVendor = prefSource ? maps.vendorMap.get(prefSource.vendor_id) : maps.vendorMap.get(part.default_vendor_id);
      const otherSources = sources.length > 1 ? sources.filter(s => s !== prefSource) : [];

      // Build normalized PrintPart for shared renderer
      const printPart = {
        id: part.id,
        name: part.part_name,
        partNumber: part.vendor_part_number,
        image: part.featured_photo || (part.photos && part.photos[0]) || null,
        categoryPath: catPath,
        notes: part.notes,
        vehicle,
        partType: part.part_type,
        source: prefVendor?.vendor_name || null,
        otherSources: otherSources.length > 0
          ? otherSources.map(s => { const v = maps.vendorMap.get(s.vendor_id); return v ? esc(v.vendor_name) : "—"; }).join(", ")
          : null,
        cost: part.cost || 0,
        retail,
        stock: inv?.physical_stock ?? 0,
        demand: inv?.required_total ?? 0,
        locations: locs,
        vendorSources: sources.map(s => {
          const v = maps.vendorMap.get(s.vendor_id);
          return {
            vendorName: v?.vendor_name || "—",
            sku: s.vendor_part_number,
            cost: s.unit_cost,
            leadTime: s.lead_time_days,
            preferred: s.is_preferred,
            url: s.order_url,
          };
        }),
      };

      cardsHTML += renderIllustratedCard(printPart, {
        includeImages,
        includeNotes,
        includeLocations,
        includeVendorSources,
        isGroupContext: false,
      });
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
  ${illustratedCSS()}
</style>
</head><body>
  ${headerHTML("Illustrated Catalog", subtitle, filterNote, ts)}
  ${imageWarning}
  ${cardsHTML}
  ${footerHTML(ts)}
</body></html>`;
}