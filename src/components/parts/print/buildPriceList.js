import {
  esc, buildLookupMaps, buildCategoryGroups, getVehicle,
  getTimestamp, baseStyles, headerHTML, footerHTML,
  formatCurrency, getPartRetailEffectiveSafe,
} from "./printHelpers";

/**
 * Price List — client-facing. No cost, no inventory, no vendor names, no internal data.
 * Columns: Part, Part Number, Retail. Optional: thumbnail, vehicle, description.
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

  let currentParent = null;
  let globalIdx = 0;
  let sectionsHTML = "";

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const isNewParent = group.parentName !== currentParent;
    currentParent = group.parentName;

    if (isNewParent) {
      sectionsHTML += `<div class="category-group"><h2 class="cat-heading">${esc(group.parentName.toUpperCase())}</h2>`;
    }

    const subLabel = group.subName || (group.parentName === "UNCATEGORIZED" ? null : "General");
    const headingText = subLabel || group.parentName;
    const partCount = group.parts.length;

    sectionsHTML += `<div class="subcategory-group">
      <h3 class="subcat-heading">${esc(headingText)} <span class="part-count">· ${partCount} Part${partCount !== 1 ? "s" : ""}</span></h3>`;

    sectionsHTML += `<table class="price-table"><thead><tr>
      ${includeImages ? '<th class="col-img"></th>' : ""}
      <th>Part</th>
      <th>Part Number</th>
      ${includeVehicle ? '<th>Vehicle</th>' : ""}
      <th style="text-align:right">Retail</th>
    </tr></thead><tbody>`;

    for (const part of group.parts) {
      globalIdx++;
      const { value: retail } = getPartRetailEffectiveSafe(part);
      const imgUrl = includeImages ? (part.featured_photo || (part.photos && part.photos[0]) || null) : null;
      const vehicle = includeVehicle ? getVehicle(part, maps) : null;

      sectionsHTML += `<tr class="${globalIdx % 2 === 0 ? "even" : "odd"}">
        ${includeImages ? `<td class="img-cell">${imgUrl
          ? `<img src="${esc(imgUrl)}" class="row-thumb" onerror="this.style.display='none'" />`
          : `<div class="thumb-placeholder"></div>`
        }</td>` : ""}
        <td>
          <div class="pl-name">${esc(part.part_name)}</div>
          ${includeDescriptions && part.notes ? `<div class="pl-desc">${esc(part.notes.substring(0, 120))}${part.notes.length > 120 ? "…" : ""}</div>` : ""}
        </td>
        <td class="pl-pn">${part.vendor_part_number ? esc(part.vendor_part_number) : "—"}</td>
        ${includeVehicle ? `<td class="small">${vehicle ? esc(vehicle) : "—"}</td>` : ""}
        <td class="money">${formatCurrency(retail)}</td>
      </tr>`;
    }

    sectionsHTML += `</tbody></table></div>`;

    const nextGroup = groups[gi + 1];
    if (!nextGroup || nextGroup.parentName !== currentParent) {
      sectionsHTML += `</div>`;
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Price List</title>
<style>
  ${baseStyles()}
  @page { size: portrait; margin: 0.6in; }
  .price-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 4px; }
  .price-table th { background: #1a1a1a; color: #fff; padding: 6px 6px; text-align: left; font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.3px; }
  .price-table td { padding: 6px 6px; border-bottom: 1px solid #e5e5e5; vertical-align: middle; }
  .price-table tr.even td { background: #fafafa; }
  .price-table tr.odd td { background: #fff; }
  .col-img { width: 50px; }
  .img-cell { width: 50px; padding: 4px !important; }
  .row-thumb { width: 42px; height: 42px; object-fit: contain; border-radius: 3px; display: block; }
  .thumb-placeholder { width: 42px; height: 42px; background: #f0f0f0; border: 1px solid #e0e0e0; border-radius: 3px; }
  .pl-name { font-weight: 700; font-size: 9.5pt; color: #111; }
  .pl-desc { font-size: 7.5pt; color: #777; margin-top: 2px; max-width: 360px; }
  .pl-pn { font-family: 'SF Mono', 'Courier New', monospace; font-size: 8pt; color: #555; }
  .money { text-align: right; font-family: 'SF Mono', 'Courier New', monospace; font-size: 9pt; font-weight: 600; white-space: nowrap; }
  .small { font-size: 8pt; color: #555; }
  @media print {
    .price-table tr { page-break-inside: avoid; }
  }
</style>
</head><body>
  ${headerHTML("Price List", subtitle, filterNote, ts)}
  ${sectionsHTML}
  ${footerHTML(ts)}
</body></html>`;
}