/**
 * Shared print row/table renderers used by BOTH Parts Catalog and Parts Group reports.
 * Ensures visual parity: same HTML structure, same CSS classes, same typography.
 *
 * Each renderer accepts a normalized PrintPart object:
 * {
 *   id, name, partNumber, image, categoryPath, notes, vehicle,
 *   source, cost, retail, stock, demand,
 *   // Optional group extensions:
 *   quantity, extCost, extRetail, requiredOptional, groupNotes,
 *   // Optional catalog extensions:
 *   locations[], vendorSources[], partType,
 * }
 */

import { esc, formatCurrency, PART_TYPE_LABELS } from "./printHelpers";

// ─── ILLUSTRATED CARD (full-width, one per part) ────────────────────────
export function renderIllustratedCard(p, opts = {}) {
  const {
    includeImages = true,
    includeNotes = true,
    includeLocations = false,
    includeVendorSources = false,
    includeCost = true,
    includeSource = true,
    isGroupContext = false,
  } = opts;

  const imgUrl = includeImages ? p.image : null;

  // Right-side inventory/value block
  let invRows = "";
  if (isGroupContext) {
    invRows += `<div class="inv-row"><span class="inv-label">Qty</span><span class="inv-val">${p.quantity || 1}</span></div>`;
    invRows += `<div class="inv-row"><span class="inv-label">${p.requiredOptional === "Optional" ? '<span style="color:#b45309;">Optional</span>' : 'Required'}</span><span class="inv-val"></span></div>`;
    if (includeCost) {
      invRows += `<div class="inv-row price"><span class="inv-label">Cost</span><span class="inv-val">${formatCurrency(p.cost || 0)}</span></div>`;
      invRows += `<div class="inv-row price"><span class="inv-label">Ext Cost</span><span class="inv-val">${formatCurrency(p.extCost || 0)}</span></div>`;
    }
  } else {
    if (p.demand != null) invRows += `<div class="inv-row"><span class="inv-label">Demand</span><span class="inv-val">${p.demand}</span></div>`;
    if (p.stock != null) invRows += `<div class="inv-row"><span class="inv-label">On Hand</span><span class="inv-val">${p.stock}</span></div>`;
    invRows += `<div class="inv-row price"><span class="inv-label">Cost</span><span class="inv-val">${formatCurrency(p.cost || 0)}</span></div>`;
    invRows += `<div class="inv-row price"><span class="inv-label">Retail</span><span class="inv-val">${formatCurrency(p.retail || 0)}</span></div>`;
  }

  let cardHTML = `<div class="part-card">
    <div class="card-top">
      ${includeImages ? `<div class="card-thumb">${imgUrl
        ? `<img src="${esc(imgUrl)}" alt="${esc(p.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="placeholder" style="display:none">No Image</div>`
        : `<div class="placeholder">No Image</div>`
      }</div>` : ""}
      <div class="card-info">
        <div class="card-name">${esc(p.name)}</div>
        ${p.partNumber ? `<div class="card-pn"><span class="pn-label">Part #:</span> ${esc(p.partNumber)}</div>` : ""}
        ${p.partType && p.partType !== "PURCHASED_VENDOR" ? `<div class="card-type">${PART_TYPE_LABELS[p.partType] || p.partType}</div>` : ""}
        ${p.categoryPath ? `<div class="card-meta"><span class="ml">Category:</span> ${esc(p.categoryPath)}</div>` : ""}
        ${p.vehicle ? `<div class="card-meta"><span class="ml">Vehicle:</span> ${esc(p.vehicle)}</div>` : ""}
        ${includeSource && p.source ? `<div class="card-meta"><span class="ml">${isGroupContext ? "Source:" : "Preferred Vendor:"}</span> ${esc(p.source)}</div>` : ""}
        ${p.otherSources ? `<div class="card-meta"><span class="ml">Other Sources:</span> ${p.otherSources}</div>` : ""}
      </div>
      <div class="card-inv">${invRows}</div>
    </div>
    ${includeNotes && (p.notes || p.groupNotes) ? `<div class="card-notes">${p.notes ? `<span class="ml">Notes:</span> ${esc(p.notes)}` : ""}${p.groupNotes ? `${p.notes ? "<br/>" : ""}<span class="ml">Group Notes:</span> ${esc(p.groupNotes)}` : ""}</div>` : ""}`;

  // Catalog-specific sections
  if (includeLocations && p.locations && p.locations.length > 0) {
    cardHTML += `<div class="card-section">
      <div class="cs-label">Locations</div>
      <div class="loc-list">${p.locations.map(l =>
        `<div class="loc-item${l.path === "UNASSIGNED" ? " unassigned" : ""}">${esc(l.path)} <span class="loc-qty">— Qty ${l.qty}</span></div>`
      ).join("")}</div>
    </div>`;
  }

  if (includeVendorSources && p.vendorSources && p.vendorSources.length > 0) {
    cardHTML += `<div class="card-section">
      <div class="cs-label">Vendor Sources</div>
      <table class="src-table"><thead><tr>
        <th>Vendor</th><th>SKU</th><th style="text-align:right">Cost</th><th>Lead Time</th><th>Pref</th><th>URL</th>
      </tr></thead><tbody>
      ${p.vendorSources.map(s => `<tr>
        <td>${esc(s.vendorName)}</td>
        <td class="mono">${s.sku ? esc(s.sku) : "—"}</td>
        <td class="money">${s.cost != null ? formatCurrency(s.cost) : "—"}</td>
        <td>${s.leadTime != null ? `${s.leadTime}d` : "—"}</td>
        <td>${s.preferred ? "★" : ""}</td>
        <td class="small url-cell">${s.url ? esc(s.url) : ""}</td>
      </tr>`).join("")}
      </tbody></table>
    </div>`;
  }

  cardHTML += `</div>`;
  return cardHTML;
}

// ─── ILLUSTRATED CSS (shared) ───────────────────────────────────────────
export function illustratedCSS() {
  return `
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
  }`;
}

// ─── PRICE LIST TABLE ROW ───────────────────────────────────────────────
export function renderPriceListRow(p, idx, opts = {}) {
  const { includeImages = true, includeDescriptions = true, includeVehicle = false, isGroupContext = false } = opts;
  const imgUrl = includeImages ? p.image : null;
  const retail = isGroupContext ? (p.extRetail || 0) : (p.retail || 0);

  return `<tr class="${idx % 2 === 0 ? "even" : "odd"}">
    ${includeImages ? `<td class="img-cell">${imgUrl
      ? `<img src="${esc(imgUrl)}" class="row-thumb" onerror="this.style.display='none'" />`
      : `<div class="thumb-placeholder"></div>`
    }</td>` : ""}
    <td>
      <div class="pl-name">${esc(p.name)}</div>
      ${includeDescriptions && p.notes ? `<div class="pl-desc">${esc(p.notes.substring(0, 120))}${p.notes.length > 120 ? "…" : ""}</div>` : ""}
    </td>
    <td class="pl-pn">${p.partNumber ? esc(p.partNumber) : "—"}</td>
    ${isGroupContext ? `<td class="center qty">${p.quantity || 1}</td>` : ""}
    ${isGroupContext ? `<td class="small">${p.requiredOptional === "Optional" ? '<span style="color:#b45309;">Optional</span>' : "Required"}</td>` : ""}
    ${includeVehicle ? `<td class="small">${p.vehicle ? esc(p.vehicle) : "—"}</td>` : ""}
    <td class="money">${formatCurrency(retail)}</td>
  </tr>`;
}

// ─── PRICE LIST TABLE HEADER ────────────────────────────────────────────
export function renderPriceListHeader(opts = {}) {
  const { includeImages = true, includeVehicle = false, isGroupContext = false } = opts;
  return `<table class="price-table"><thead><tr>
    ${includeImages ? '<th class="col-img"></th>' : ""}
    <th>Part</th>
    <th>Part Number</th>
    ${isGroupContext ? '<th style="text-align:center">Qty</th>' : ""}
    ${isGroupContext ? '<th>Req/Opt</th>' : ""}
    ${includeVehicle ? '<th>Vehicle</th>' : ""}
    <th style="text-align:right">Retail</th>
  </tr></thead><tbody>`;
}

// ─── PRICE LIST CSS (shared) ────────────────────────────────────────────
export function priceListCSS() {
  return `
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
  .center { text-align: center; }
  .qty { font-weight: 600; }
  @media print {
    .price-table tr { page-break-inside: avoid; }
  }`;
}

// ─── SUMMARY TABLE ROW ─────────────────────────────────────────────────
export function renderSummaryRow(p, idx, opts = {}) {
  const { includeCost = true, includeRetail = true, isGroupContext = false, includeSource = true, includeStock = true, includeDemand = true, includeNotes = false } = opts;

  return `<tr class="${idx % 2 === 0 ? "even" : "odd"}">
    <td class="num">${idx}</td>
    <td>
      <div class="part-name">${esc(p.name)}</div>
      ${p.partNumber ? `<div class="part-num">${isGroupContext ? "" : "Part #: "}${esc(p.partNumber)}</div>` : ""}
      ${p.partType && p.partType !== "PURCHASED_VENDOR" ? `<div class="part-type">${PART_TYPE_LABELS[p.partType] || p.partType}</div>` : ""}
    </td>
    ${isGroupContext && p.categoryPath ? `<td class="small" style="max-width:160px;word-wrap:break-word;">${esc(p.categoryPath)}</td>` : ""}
    ${isGroupContext ? `<td class="center qty">${p.quantity || 1}</td>` : ""}
    ${isGroupContext ? `<td class="small">${p.requiredOptional === "Optional" ? '<span style="color:#b45309;">Optional</span>' : "Required"}</td>` : ""}
    ${!isGroupContext && includeSource ? `<td class="small">${p.source ? esc(p.source) : "—"}</td>` : ""}
    ${isGroupContext && includeSource ? `<td class="small">${p.source ? esc(p.source) : "—"}</td>` : ""}
    ${includeCost ? `<td class="money">${formatCurrency(p.cost || 0)}</td>` : ""}
    ${isGroupContext && includeCost ? `<td class="money" style="font-weight:600;">${formatCurrency(p.extCost || 0)}</td>` : ""}
    ${includeRetail ? `<td class="money">${formatCurrency(isGroupContext ? (p.extRetail || 0) : (p.retail || 0))}</td>` : ""}
    ${includeDemand ? `<td class="center qty">${p.demand ?? "—"}</td>` : ""}
    ${includeStock ? `<td class="center qty">${p.stock ?? "—"}</td>` : ""}
    ${isGroupContext && includeNotes ? `<td class="small" style="max-width:120px;word-wrap:break-word;">${p.groupNotes ? esc(p.groupNotes) : ""}</td>` : ""}
  </tr>`;
}

// ─── SUMMARY TABLE HEADER ───────────────────────────────────────────────
export function renderSummaryHeader(opts = {}) {
  const { includeCost = true, includeRetail = true, isGroupContext = false, includeSource = true, includeStock = true, includeDemand = true, includeNotes = false, showCategory = false } = opts;

  return `<table class="parts-table"><thead><tr>
    <th class="col-num">#</th>
    <th>Part</th>
    ${isGroupContext && showCategory ? '<th>Category</th>' : ''}
    ${isGroupContext ? '<th style="text-align:center">Qty</th>' : ''}
    ${isGroupContext ? '<th>Req/Opt</th>' : ''}
    ${!isGroupContext ? '<th>Preferred Vendor</th>' : ''}
    ${isGroupContext && includeSource ? '<th>Source</th>' : ''}
    ${includeCost ? '<th style="text-align:right">Cost</th>' : ''}
    ${isGroupContext && includeCost ? '<th style="text-align:right">Ext Cost</th>' : ''}
    ${includeRetail ? '<th style="text-align:right">Retail</th>' : ''}
    ${includeDemand ? '<th style="text-align:center">Demand</th>' : ''}
    ${includeStock ? '<th style="text-align:center">On Hand</th>' : ''}
    ${isGroupContext && includeNotes ? '<th>Notes</th>' : ''}
  </tr></thead><tbody>`;
}

// ─── SUMMARY TABLE CSS (shared) ─────────────────────────────────────────
export function summaryCSS() {
  return `
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
  .estimate-note { font-size: 7.5pt; color: #888; font-style: italic; margin-top: 12px; }
  .compact-table .part-name { font-size: 8.5pt; }
  @media print { .parts-table tr { page-break-inside: avoid; } thead { display: table-header-group; } .subcat-heading { break-after: avoid; } }`;
}

// ─── SECTION HEADING (shared) ───────────────────────────────────────────
export function renderSectionHeading(name, count, extra = "") {
  return `<h3 class="subcat-heading">${esc(name.toUpperCase())} <span class="part-count">· ${count} Part${count !== 1 ? "s" : ""}${extra ? ` · ${extra}` : ""}</span></h3>`;
}