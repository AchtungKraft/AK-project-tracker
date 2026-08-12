import {
  esc, getTimestamp, baseStyles, headerHTML, footerHTML, formatCurrency,
} from "@/components/parts/print/printHelpers";
import { getCategoryPathLabel } from "@/lib/categoryTreeHelpers";

/**
 * Builds a print-ready HTML report for a single Parts Group.
 * Supports summary, illustrated, and compact report types.
 * Reuses the Ächtung Kraft print architecture.
 */
export function buildPartGroupPrintHTML({
  group, enrichedItems, sections, summary, vendorsMap,
  inventoryViewMap, catLookups,
  reportType = "summary", printOptions = {},
}) {
  const ts = getTimestamp();
  const opts = printOptions || {};
  const groupReportBy = opts.groupReportBy || "section";

  const subtitle = [
    group.group_code ? `Code: ${group.group_code}` : null,
    group.category || null,
    group.status,
  ].filter(Boolean).join(" · ");

  // Summary strip
  const stripHTML = `<div class="summary-strip">
    <span>Parts: <strong>${summary.uniqueParts}</strong></span>
    <span>Total Qty: <strong>${summary.totalQty}</strong></span>
    <span>Required: <strong>${summary.requiredCount}</strong></span>
    <span>Optional: <strong>${summary.optionalCount}</strong></span>
    <span>Required Est: <strong>${formatCurrency(summary.requiredCost)}</strong></span>
    <span>Optional Est: <strong>${formatCurrency(summary.optionalCost)}</strong></span>
    <span>Total Est: <strong>${formatCurrency(summary.totalCost)}</strong></span>
  </div>`;

  const descHTML = group.description
    ? `<div style="margin-bottom:12px;font-size:9pt;color:#444;max-width:80ch;">${esc(group.description)}</div>`
    : "";

  const instrHTML = group.instructions
    ? `<div style="margin-bottom:12px;padding:8px;background:#f0f7ff;border:1px solid #c8ddf5;border-radius:4px;font-size:8.5pt;color:#333;"><strong>Instructions:</strong> ${esc(group.instructions)}</div>`
    : "";

  // Build report-specific grouped sections
  const reportSections = buildReportSections(enrichedItems, groupReportBy, catLookups);

  let bodyHTML = "";
  if (reportType === "illustrated") {
    bodyHTML = buildIllustratedBody(reportSections, opts, vendorsMap, catLookups, groupReportBy);
  } else if (reportType === "priceList") {
    bodyHTML = buildPriceListBody(reportSections, opts, catLookups, groupReportBy);
  } else if (reportType === "compact") {
    bodyHTML = buildCompactBody(reportSections, opts, catLookups, groupReportBy);
  } else {
    bodyHTML = buildSummaryBody(reportSections, opts, vendorsMap, inventoryViewMap, catLookups, groupReportBy);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(group.name)} — Parts Group</title>
<style>
  ${baseStyles()}
  ${reportType === "illustrated" ? illustratedStyles() : tableStyles()}
  ${reportType === "priceList" ? priceListStyles() : ''}
</style>
</head><body>
  ${headerHTML("Parts Group", subtitle, null, ts)}
  ${descHTML}
  ${instrHTML}
  ${stripHTML}
  ${bodyHTML}
  <div class="estimate-note">* Estimated costs based on current Parts Tracker cost data. Actual costs may vary.</div>
  ${footerHTML(ts)}
</body></html>`;
}

function buildReportSections(enrichedItems, groupReportBy, catLookups) {
  if (groupReportBy === "category") {
    const map = new Map();
    for (const item of enrichedItems) {
      const catId = item.part?.part_category_id;
      const label = catId && catLookups?.byId?.[catId]
        ? getCategoryPathLabel(catId, catLookups.byId) : "Uncategorized";
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }
  if (groupReportBy === "none") {
    return [["All Parts", enrichedItems]];
  }
  // Default: section
  const sectionMap = new Map();
  for (const item of enrichedItems) {
    const section = item.section_name || "General Parts";
    if (!sectionMap.has(section)) sectionMap.set(section, []);
    sectionMap.get(section).push(item);
  }
  return Array.from(sectionMap.entries());
}

// ─── SUMMARY TABLE REPORT ───────────────────────────────────
function buildSummaryBody(sections, opts, vendorsMap, inventoryViewMap, catLookups, groupReportBy) {
  let html = "";
  let globalIdx = 0;
  const showCategory = groupReportBy !== "category";

  for (const [sectionName, sectionItems] of sections) {
    const sectionCost = sectionItems.reduce((s, i) => s + i.extCost, 0);
    const showHeading = sections.length > 1;

    if (showHeading) {
      html += `<div class="subcategory-group"><h3 class="subcat-heading">${esc(sectionName.toUpperCase())} <span class="part-count">· ${sectionItems.length} Part${sectionItems.length !== 1 ? "s" : ""} · ${formatCurrency(sectionCost)}</span></h3>`;
    }

    html += `<table class="parts-table"><thead><tr>
      <th class="col-num">#</th>
      <th>Part</th>
      ${showCategory ? '<th>Category</th>' : ''}
      <th style="text-align:center">Qty</th>
      <th>Req/Opt</th>
      ${opts.includeSource !== false ? '<th>Source</th>' : ''}
      ${opts.includeCost !== false ? '<th style="text-align:right">Unit Cost</th><th style="text-align:right">Ext Cost</th>' : ''}
      ${opts.includeRetail ? '<th style="text-align:right">Retail</th>' : ''}
      ${opts.includeStock !== false ? '<th style="text-align:center">Stock</th>' : ''}
      ${opts.includeDemand !== false ? '<th style="text-align:center">Demand</th>' : ''}
      ${opts.includeNotes !== false ? '<th>Notes</th>' : ''}
    </tr></thead><tbody>`;

    for (const item of sectionItems) {
      globalIdx++;
      const { part, inv, unitCost, extCost } = item;
      const vendor = vendorsMap?.[part.default_vendor_id];
      const onHand = inv?.physical_stock ?? "—";
      const demand = inv?.required_total ?? "—";
      const catPath = showCategory && part.part_category_id && catLookups?.byId?.[part.part_category_id]
        ? getCategoryPathLabel(part.part_category_id, catLookups.byId) : "";
      const retail = part.retail_override || part.retail_matrix_price || 0;

      html += `<tr class="${globalIdx % 2 === 0 ? "even" : "odd"}">
        <td class="num">${globalIdx}</td>
        <td>
          <div class="part-name">${esc(part.part_name)}</div>
          ${part.vendor_part_number ? `<div class="part-num">${esc(part.vendor_part_number)}</div>` : ""}
        </td>
        ${showCategory ? `<td class="small" style="max-width:160px;word-wrap:break-word;">${catPath ? esc(catPath) : "—"}</td>` : ''}
        <td class="center qty">${item.quantity || 1}</td>
        <td class="small">${item.is_optional ? '<span style="color:#b45309;">Optional</span>' : "Required"}</td>
        ${opts.includeSource !== false ? `<td class="small">${vendor ? esc(vendor.vendor_name) : "—"}</td>` : ''}
        ${opts.includeCost !== false ? `<td class="money">${formatCurrency(unitCost)}</td><td class="money" style="font-weight:600;">${formatCurrency(extCost)}</td>` : ''}
        ${opts.includeRetail ? `<td class="money">${formatCurrency(retail * (item.quantity || 1))}</td>` : ''}
        ${opts.includeStock !== false ? `<td class="center qty">${onHand}</td>` : ''}
        ${opts.includeDemand !== false ? `<td class="center qty">${demand}</td>` : ''}
        ${opts.includeNotes !== false ? `<td class="small" style="max-width:120px;word-wrap:break-word;">${item.notes ? esc(item.notes) : ""}</td>` : ''}
      </tr>`;
    }

    html += `</tbody></table>`;
    if (showHeading) html += `</div>`;
  }
  return html;
}

// ─── ILLUSTRATED REPORT ─────────────────────────────────────
function buildIllustratedBody(sections, opts, vendorsMap, catLookups, groupReportBy) {
  let html = "";
  for (const [sectionName, sectionItems] of sections) {
    if (sections.length > 1) {
      html += `<h3 class="subcat-heading" style="margin-top:16px;">${esc(sectionName.toUpperCase())}</h3>`;
    }
    html += '<div class="ill-grid">';
    for (const item of sectionItems) {
      const { part, unitCost } = item;
      const img = part.featured_photo || part.photos?.[0];
      const vendor = vendorsMap?.[part.default_vendor_id];
      const catPath = part.part_category_id && catLookups?.byId?.[part.part_category_id]
        ? getCategoryPathLabel(part.part_category_id, catLookups.byId) : "";
      html += `<div class="ill-card">
        ${opts.includeImages !== false && img ? `<div class="ill-img"><img src="${esc(img)}" /></div>` : ''}
        <div class="ill-body">
          <div class="part-name">${esc(part.part_name)}</div>
          ${part.vendor_part_number ? `<div class="part-num">${esc(part.vendor_part_number)}</div>` : ""}
          ${catPath ? `<div class="ill-cat">${esc(catPath)}</div>` : ""}
          <div class="ill-meta">Qty: <strong>${item.quantity || 1}</strong> · ${item.is_optional ? '<span style="color:#b45309;">Optional</span>' : 'Required'}</div>
          ${opts.includeSource !== false && vendor ? `<div class="ill-meta">Source: ${esc(vendor.vendor_name)}</div>` : ""}
          ${opts.includeCost !== false ? `<div class="ill-meta">Cost: ${formatCurrency(unitCost)} · Ext: ${formatCurrency(item.extCost)}</div>` : ""}
          ${opts.includeNotes !== false && item.notes ? `<div class="ill-note">📝 ${esc(item.notes)}</div>` : ""}
        </div>
      </div>`;
    }
    html += '</div>';
  }
  return html;
}

// ─── PRICE LIST REPORT ──────────────────────────────────────
function buildPriceListBody(sections, opts, catLookups, groupReportBy) {
  let html = "";
  let globalIdx = 0;
  for (const [sectionName, sectionItems] of sections) {
    if (sections.length > 1) {
      html += `<h3 class="subcat-heading" style="margin-top:12px;">${esc(sectionName.toUpperCase())} <span class="part-count">· ${sectionItems.length}</span></h3>`;
    }
    html += `<table class="parts-table"><thead><tr>
      ${opts.includeImages ? '<th class="col-img"></th>' : ''}
      <th>Part</th>
      <th>Part Number</th>
      <th style="text-align:center">Qty</th>
      <th>Req/Opt</th>
      <th style="text-align:right">Retail</th>
    </tr></thead><tbody>`;
    for (const item of sectionItems) {
      globalIdx++;
      const { part } = item;
      const retail = part.retail_override || part.retail_matrix_price || 0;
      const extRetail = retail * (item.quantity || 1);
      const img = opts.includeImages ? (part.featured_photo || part.photos?.[0]) : null;
      html += `<tr class="${globalIdx % 2 === 0 ? "even" : "odd"}">
        ${opts.includeImages ? `<td class="img-cell">${img ? `<img src="${esc(img)}" class="row-thumb" onerror="this.style.display='none'" />` : '<div class="thumb-placeholder"></div>'}</td>` : ''}
        <td>
          <div class="part-name">${esc(part.part_name)}</div>
          ${opts.includeDescriptions && part.notes ? `<div class="small" style="max-width:300px;">${esc(part.notes.substring(0, 100))}${part.notes.length > 100 ? "…" : ""}</div>` : ''}
        </td>
        <td class="part-num">${part.vendor_part_number ? esc(part.vendor_part_number) : "—"}</td>
        <td class="center qty">${item.quantity || 1}</td>
        <td class="small">${item.is_optional ? '<span style="color:#b45309;">Optional</span>' : "Required"}</td>
        <td class="money" style="font-weight:600;">${formatCurrency(extRetail)}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }
  return html;
}

// ─── COMPACT LIST REPORT ─────────────────────────────────────
function buildCompactBody(sections, opts, catLookups, groupReportBy) {
  let html = "";
  let globalIdx = 0;
  for (const [sectionName, sectionItems] of sections) {
    if (sections.length > 1) {
      html += `<h3 class="subcat-heading" style="margin-top:12px;">${esc(sectionName.toUpperCase())} <span class="part-count">· ${sectionItems.length}</span></h3>`;
    }
    html += `<table class="parts-table compact-table"><thead><tr>
      <th class="col-num">#</th>
      <th>Part Name</th>
      ${opts.includePartNumber !== false ? '<th>Part #</th>' : ''}
      ${opts.includeCategory !== false ? '<th>Category</th>' : ''}
      <th style="text-align:center">Qty</th>
      <th>Req/Opt</th>
    </tr></thead><tbody>`;
    for (const item of sectionItems) {
      globalIdx++;
      const { part } = item;
      const catPath = opts.includeCategory !== false && part.part_category_id && catLookups?.byId?.[part.part_category_id]
        ? getCategoryPathLabel(part.part_category_id, catLookups.byId) : "";
      html += `<tr class="${globalIdx % 2 === 0 ? "even" : "odd"}">
        <td class="num">${globalIdx}</td>
        <td><div class="part-name">${esc(part.part_name)}</div></td>
        ${opts.includePartNumber !== false ? `<td class="part-num">${part.vendor_part_number ? esc(part.vendor_part_number) : "—"}</td>` : ''}
        ${opts.includeCategory !== false ? `<td class="small" style="max-width:160px;word-wrap:break-word;">${catPath ? esc(catPath) : "—"}</td>` : ''}
        <td class="center qty">${item.quantity || 1}</td>
        <td class="small">${item.is_optional ? '<span style="color:#b45309;">Optional</span>' : "Required"}</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }
  return html;
}

// ─── STYLES ──────────────────────────────────────────────────
function tableStyles() {
  return `
  .parts-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 8px; }
  .parts-table th { background: #1a1a1a; color: #fff; padding: 5px 5px; text-align: left; font-weight: 600; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
  .parts-table td { padding: 4px 5px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  .parts-table tr.even td { background: #fafafa; }
  .parts-table tr.odd td { background: #fff; }
  .col-num { width: 24px; }
  .num { text-align: center; color: #999; font-size: 7pt; }
  .part-name { font-weight: 700; font-size: 9pt; color: #111; }
  .part-num { font-family: 'SF Mono', 'Courier New', monospace; font-size: 7pt; color: #777; margin-top: 1px; }
  .small { font-size: 7.5pt; color: #444; }
  .money { text-align: right; font-family: 'SF Mono', 'Courier New', monospace; font-size: 8pt; white-space: nowrap; }
  .center { text-align: center; }
  .qty { font-weight: 600; font-size: 8.5pt; }
  .estimate-note { font-size: 7.5pt; color: #888; font-style: italic; margin-top: 12px; }
  .compact-table .part-name { font-size: 8.5pt; }
  .col-img { width: 50px; }
  .img-cell { width: 50px; padding: 4px !important; }
  .row-thumb { width: 42px; height: 42px; object-fit: contain; border-radius: 3px; display: block; }
  .thumb-placeholder { width: 42px; height: 42px; background: #f0f0f0; border: 1px solid #e0e0e0; border-radius: 3px; }
  @media print {
    .parts-table tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .subcat-heading { break-after: avoid; }
  }`;
}

function illustratedStyles() {
  return `
  .ill-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 12px; }
  .ill-card { display: flex; gap: 8px; border: 1px solid #ddd; border-radius: 4px; padding: 8px; break-inside: avoid; }
  .ill-img { width: 64px; height: 64px; flex-shrink: 0; background: #f0f0f0; border-radius: 3px; overflow: hidden; }
  .ill-img img { width: 100%; height: 100%; object-fit: cover; }
  .ill-body { flex: 1; min-width: 0; }
  .part-name { font-weight: 700; font-size: 9pt; color: #111; }
  .part-num { font-family: 'SF Mono', 'Courier New', monospace; font-size: 7pt; color: #777; }
  .ill-cat { font-size: 7pt; color: #666; margin-top: 1px; }
  .ill-meta { font-size: 7.5pt; color: #444; margin-top: 2px; }
  .ill-note { font-size: 7pt; color: #3b82f6; margin-top: 2px; }
  .estimate-note { font-size: 7.5pt; color: #888; font-style: italic; margin-top: 12px; }
  @media print { .ill-card { break-inside: avoid; } }`;
}

function priceListStyles() {
  return `
  .parts-table td { vertical-align: middle; }
  `;
}