import {
  esc, getTimestamp, baseStyles, headerHTML, formatCurrency,
} from "@/components/parts/print/printHelpers";
import { getCategoryPathLabel } from "@/lib/categoryTreeHelpers";
import { showCost, showRetail, showAnyPricing, PRICING_MODES } from "@/components/parts/print/sharedPrintConfig";
import {
  renderIllustratedCard, illustratedCSS,
  renderPriceListRow, renderPriceListHeader, priceListCSS,
  renderSummaryRow, renderSummaryHeader, summaryCSS,
  renderSectionHeading,
} from "@/components/parts/print/sharedPrintRenderers";
import { preparePartGroupSections } from "./partGroupSections";

/**
 * Builds a print-ready HTML report for a single Parts Group.
 * Uses shared renderers from sharedPrintRenderers.js for visual parity with Parts Catalog.
 *
 * PRICING SAFETY: pricingMode controls ALL pricing output.
 * When RETAIL_ONLY, zero cost values appear in the generated HTML.
 *
 * ORDERING: Required items always before Optional within every group.
 * Subtotals per group when grouped by category or section.
 */
export function buildPartGroupPrintHTML({
  group, enrichedItems, sections: _legacySections, summary, vendorsMap,
  inventoryViewMap, catLookups,
  reportType = "summary", printOptions = {},
}) {
  const ts = getTimestamp();
  const opts = printOptions || {};
  const groupReportBy = opts.groupReportBy || "section";
  const pricingMode = opts.pricingMode || PRICING_MODES.RETAIL_ONLY;

  const hasCost = showCost(pricingMode);
  const hasRetail = showRetail(pricingMode);
  const hasAnyPricing = showAnyPricing(pricingMode);

  // Report type label for header
  const reportLabel = {
    summary: "Summary Report",
    illustrated: "Illustrated Catalog",
    priceList: "Price List",
    compact: "Compact List",
  }[reportType] || "Parts Group";

  const subtitle = [
    group.name,
    group.group_code ? `Code: ${group.group_code}` : null,
    group.category || null,
    group.status,
  ].filter(Boolean).join(" · ");

  // ── Canonical pricing totals ──────────────────────────────────────────
  const pricingTotals = calculatePartGroupPricing(enrichedItems);

  // Summary strip — only shows pricing values allowed by pricingMode
  let stripParts = [
    `<span>Parts: <strong>${summary.uniqueParts}</strong></span>`,
    `<span>Total Qty: <strong>${summary.totalQty}</strong></span>`,
    `<span>Required: <strong>${summary.requiredCount}</strong></span>`,
    `<span>Optional: <strong>${summary.optionalCount}</strong></span>`,
  ];
  if (hasCost) {
    stripParts.push(`<span>Required Cost: <strong>${formatCurrency(pricingTotals.requiredCost)}</strong></span>`);
    stripParts.push(`<span>Optional Cost: <strong>${formatCurrency(pricingTotals.optionalCost)}</strong></span>`);
    stripParts.push(`<span>Total Cost: <strong>${formatCurrency(pricingTotals.totalCost)}</strong></span>`);
  }
  if (hasRetail) {
    stripParts.push(`<span>Required Retail: <strong>${formatCurrency(pricingTotals.requiredRetail)}</strong></span>`);
    stripParts.push(`<span>Optional Retail: <strong>${formatCurrency(pricingTotals.optionalRetail)}</strong></span>`);
    stripParts.push(`<span>Total Retail: <strong>${formatCurrency(pricingTotals.totalRetail)}</strong></span>`);
  }
  const stripHTML = `<div class="summary-strip">${stripParts.join("\n")}</div>`;

  const descHTML = group.description
    ? `<div style="margin-bottom:12px;font-size:9pt;color:#444;max-width:80ch;">${esc(group.description)}</div>`
    : "";

  const instrHTML = group.instructions
    ? `<div style="margin-bottom:12px;padding:8px;background:#f0f7ff;border:1px solid #c8ddf5;border-radius:4px;font-size:8.5pt;color:#333;"><strong>Instructions:</strong> ${esc(group.instructions)}</div>`
    : "";

  // Build sections using shared helper (Required-first ordering + subtotals)
  const preparedSections = preparePartGroupSections({
    items: enrichedItems,
    groupBy: groupReportBy,
    sortBy: "manual", // print always uses stored sort_order
    catLookups,
    vendorsMap,
  });

  // Normalize items to shared PrintPart model
  const normalizePart = (item) => {
    const { part, inv, unitCost, extCost } = item;
    const vendor = vendorsMap?.[part.default_vendor_id];
    const catPath = part.part_category_id && catLookups?.byId?.[part.part_category_id]
      ? getCategoryPathLabel(part.part_category_id, catLookups.byId) : "";
    const retail = part.retail_override || part.retail_matrix_price || 0;
    return {
      id: part.id,
      name: part.part_name,
      partNumber: part.vendor_part_number,
      image: part.featured_photo || part.photos?.[0] || null,
      categoryPath: catPath,
      notes: part.notes,
      partType: part.part_type,
      source: vendor?.vendor_name || null,
      cost: unitCost,
      retail,
      stock: inv?.physical_stock ?? null,
      demand: inv?.required_total ?? null,
      extCost: extCost,
      extRetail: retail * (item.quantity || 1),
      quantity: item.quantity || 1,
      requiredOptional: item.is_optional ? "Optional" : "Required",
      groupNotes: item.notes || null,
    };
  };

  let bodyHTML = "";
  let reportCSS = "";

  if (reportType === "illustrated") {
    reportCSS = illustratedCSS() + groupSubtotalCSS();
    bodyHTML = buildIllustratedBody(preparedSections, opts, normalizePart, pricingMode);
  } else if (reportType === "priceList") {
    reportCSS = priceListCSS() + groupSubtotalCSS();
    bodyHTML = buildPriceListBody(preparedSections, opts, normalizePart, pricingMode);
  } else if (reportType === "compact") {
    reportCSS = summaryCSS() + groupSubtotalCSS();
    bodyHTML = buildCompactBody(preparedSections, opts, catLookups, pricingMode);
  } else {
    reportCSS = summaryCSS() + groupSubtotalCSS();
    bodyHTML = buildSummaryBody(preparedSections, opts, normalizePart, groupReportBy, pricingMode);
  }

  // Footer note — only show pricing note when pricing is displayed
  const pricingNote = hasAnyPricing
    ? `<div class="estimate-note">* ${hasRetail && !hasCost ? "Retail prices" : "Estimated values"} based on current Parts Tracker data. Actual values may vary.</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(group.name)} — ${esc(reportLabel)}</title>
<style>
  ${baseStyles()}
  ${reportCSS}
</style>
</head><body>
  ${headerHTML(reportLabel, subtitle, null, ts)}
  ${descHTML}
  ${instrHTML}
  ${stripHTML}
  ${bodyHTML}
  ${pricingNote}
  ${groupFooterHTML(ts)}
</body></html>`;
}

// ─── CANONICAL PRICING TOTALS ───────────────────────────────────────────
export function calculatePartGroupPricing(enrichedItems) {
  let requiredCost = 0, optionalCost = 0;
  let requiredRetail = 0, optionalRetail = 0;

  for (const item of enrichedItems) {
    const qty = item.quantity || 1;
    const unitCost = item.unitCost || 0;
    const unitRetail = item.part?.retail_override || item.part?.retail_matrix_price || 0;
    const extCost = unitCost * qty;
    const extRetail = unitRetail * qty;

    if (item.is_optional) {
      optionalCost += extCost;
      optionalRetail += extRetail;
    } else {
      requiredCost += extCost;
      requiredRetail += extRetail;
    }
  }

  return {
    requiredCost,
    optionalCost,
    totalCost: requiredCost + optionalCost,
    requiredRetail,
    optionalRetail,
    totalRetail: requiredRetail + optionalRetail,
  };
}

function groupFooterHTML(ts) {
  return `<div class="footer">
    <span>Generated by AK Projects — Parts Groups</span>
    <span>${esc(ts.dateStr)} ${esc(ts.timeStr)}</span>
  </div>`;
}

// ─── CSS for Optional dividers & group subtotals ────────────────────────
function groupSubtotalCSS() {
  return `
  .optional-divider {
    display: flex; align-items: center; gap: 8px;
    margin: 8px 0 6px 0; padding: 3px 0;
    font-size: 7.5pt; font-weight: 600; color: #b45309;
    text-transform: uppercase; letter-spacing: 0.5px;
    break-after: avoid; page-break-after: avoid;
  }
  .optional-divider::before {
    content: ''; flex: 0 0 3px; height: 3px; background: #d97706; border-radius: 2px;
  }
  .optional-divider::after {
    content: ''; flex: 1; height: 1px; background: #e5e0d5;
  }
  .group-subtotal {
    margin: 6px 0 14px 0; padding: 6px 10px;
    background: #f5f5f0; border: 1px solid #e0ddd5; border-radius: 4px;
    font-size: 8pt; color: #444;
    break-inside: avoid; page-break-inside: avoid;
  }
  .group-subtotal .gs-row {
    display: flex; justify-content: space-between; align-items: baseline; padding: 1px 0;
  }
  .group-subtotal .gs-row.gs-total {
    border-top: 1px solid #ccc; margin-top: 2px; padding-top: 3px;
    font-weight: 700; color: #111;
  }
  .group-subtotal .gs-label { font-size: 7.5pt; color: #666; }
  .group-subtotal .gs-label.gs-opt { color: #b45309; }
  .group-subtotal .gs-val { font-family: 'SF Mono', 'Courier New', monospace; font-size: 8.5pt; font-weight: 600; }
  .group-subtotal .gs-meta { font-size: 7.5pt; color: #888; }
  `;
}

// ─── OPTIONAL DIVIDER HTML ──────────────────────────────────────────────
function optionalDividerHTML(count) {
  return `<div class="optional-divider"><span>Optional · ${count}</span></div>`;
}

// ─── GROUP SUBTOTAL HTML ────────────────────────────────────────────────
function groupSubtotalHTML(section, pricingMode) {
  const { pricing, counts } = section;
  const hasCost = showCost(pricingMode);
  const hasRetail = showRetail(pricingMode);
  const hasAny = showAnyPricing(pricingMode);

  let rows = "";

  if (hasAny && (hasCost || hasRetail)) {
    // Required/Optional breakdown
    if (counts.optional > 0) {
      if (hasCost) {
        rows += `<div class="gs-row"><span class="gs-label">Required Cost</span><span class="gs-val">${formatCurrency(pricing.requiredCost)}</span></div>`;
        rows += `<div class="gs-row"><span class="gs-label gs-opt">Optional Cost</span><span class="gs-val">${formatCurrency(pricing.optionalCost)}</span></div>`;
      }
      if (hasRetail) {
        rows += `<div class="gs-row"><span class="gs-label">Required Retail</span><span class="gs-val">${formatCurrency(pricing.requiredRetail)}</span></div>`;
        rows += `<div class="gs-row"><span class="gs-label gs-opt">Optional Retail</span><span class="gs-val">${formatCurrency(pricing.optionalRetail)}</span></div>`;
      }
      // Subtotal
      if (hasCost) {
        rows += `<div class="gs-row gs-total"><span class="gs-label">Subtotal Cost</span><span class="gs-val">${formatCurrency(pricing.subtotalCost)}</span></div>`;
      }
      if (hasRetail) {
        rows += `<div class="gs-row gs-total"><span class="gs-label">Subtotal Retail</span><span class="gs-val">${formatCurrency(pricing.subtotalRetail)}</span></div>`;
      }
    } else {
      // No optional — just subtotal
      if (hasCost) {
        rows += `<div class="gs-row gs-total"><span class="gs-label">Subtotal Cost</span><span class="gs-val">${formatCurrency(pricing.subtotalCost)}</span></div>`;
      }
      if (hasRetail) {
        rows += `<div class="gs-row gs-total"><span class="gs-label">Subtotal Retail</span><span class="gs-val">${formatCurrency(pricing.subtotalRetail)}</span></div>`;
      }
    }
  } else {
    // No pricing — show parts/qty only
    rows += `<div class="gs-row"><span class="gs-meta">Parts: ${counts.total} · Qty: ${counts.totalQty}</span></div>`;
  }

  return `<div class="group-subtotal">${rows}</div>`;
}

// ─── ILLUSTRATED (uses shared full-width card) ──────────────────────────
function buildIllustratedBody(sections, opts, normalizePart, pricingMode) {
  let html = "";
  for (const section of sections) {
    if (sections.length > 1) {
      const extra = `Qty ${section.counts.totalQty}`;
      html += renderSectionHeading(section.label, section.counts.total, extra);
    }
    // Required items first
    for (const item of section.requiredItems) {
      html += renderIllustratedCard(normalizePart(item), {
        includeImages: opts.includeImages !== false,
        includeNotes: opts.includeNotes !== false,
        includeSource: opts.includeSource !== false,
        isGroupContext: true,
        pricingMode,
      });
    }
    // Optional divider + items
    if (section.optionalItems.length > 0) {
      html += optionalDividerHTML(section.optionalItems.length);
      for (const item of section.optionalItems) {
        html += renderIllustratedCard(normalizePart(item), {
          includeImages: opts.includeImages !== false,
          includeNotes: opts.includeNotes !== false,
          includeSource: opts.includeSource !== false,
          isGroupContext: true,
          pricingMode,
        });
      }
    }
    // Group subtotal
    if (sections.length > 1) {
      html += groupSubtotalHTML(section, pricingMode);
    }
  }
  return html;
}

// ─── PRICE LIST (uses shared table rows) ────────────────────────────────
function buildPriceListBody(sections, opts, normalizePart, pricingMode) {
  let html = "";
  let globalIdx = 0;
  for (const section of sections) {
    if (sections.length > 1) {
      const extra = `Qty ${section.counts.totalQty}`;
      html += renderSectionHeading(section.label, section.counts.total, extra);
    }
    html += renderPriceListHeader({
      includeImages: !!opts.includeImages,
      isGroupContext: true,
      pricingMode,
    });
    // Required rows
    for (const item of section.requiredItems) {
      globalIdx++;
      html += renderPriceListRow(normalizePart(item), globalIdx, {
        includeImages: !!opts.includeImages,
        includeDescriptions: !!opts.includeDescriptions,
        isGroupContext: true,
        pricingMode,
      });
    }
    // Optional divider row inside table
    if (section.optionalItems.length > 0) {
      const colCount = 3 + (opts.includeImages ? 1 : 0) + (showCost(pricingMode) ? 1 : 0) + (showRetail(pricingMode) ? 1 : 0);
      html += `<tr><td colspan="${colCount}" style="padding:4px 6px;border-bottom:none;">`;
      html += `<div class="optional-divider" style="margin:2px 0;"><span>Optional · ${section.optionalItems.length}</span></div>`;
      html += `</td></tr>`;
      for (const item of section.optionalItems) {
        globalIdx++;
        html += renderPriceListRow(normalizePart(item), globalIdx, {
          includeImages: !!opts.includeImages,
          includeDescriptions: !!opts.includeDescriptions,
          isGroupContext: true,
          pricingMode,
        });
      }
    }
    html += `</tbody></table>`;
    // Group subtotal
    if (sections.length > 1) {
      html += groupSubtotalHTML(section, pricingMode);
    }
  }
  return html;
}

// ─── SUMMARY (uses shared table rows) ───────────────────────────────────
function buildSummaryBody(sections, opts, normalizePart, groupReportBy, pricingMode) {
  let html = "";
  let globalIdx = 0;
  const showCategory = groupReportBy !== "category";

  for (const section of sections) {
    if (sections.length > 1) {
      html += `<div class="subcategory-group">`;
      const extra = `Qty ${section.counts.totalQty}`;
      html += renderSectionHeading(section.label, section.counts.total, extra);
    }

    html += renderSummaryHeader({
      includeSource: opts.includeSource !== false,
      includeStock: opts.includeStock !== false,
      includeDemand: opts.includeDemand !== false,
      includeNotes: opts.includeNotes !== false,
      isGroupContext: true,
      showCategory,
      pricingMode,
    });

    // Required rows
    for (const item of section.requiredItems) {
      globalIdx++;
      html += renderSummaryRow(normalizePart(item), globalIdx, {
        includeSource: opts.includeSource !== false,
        includeStock: opts.includeStock !== false,
        includeDemand: opts.includeDemand !== false,
        includeNotes: opts.includeNotes !== false,
        isGroupContext: true,
        pricingMode,
      });
    }

    // Optional divider row inside table
    if (section.optionalItems.length > 0) {
      const colCount = 3 + (showCategory ? 1 : 0) + (opts.includeSource !== false ? 1 : 0)
        + (showCost(pricingMode) ? 2 : 0) + (showRetail(pricingMode) ? 2 : 0)
        + (opts.includeDemand !== false ? 1 : 0) + (opts.includeStock !== false ? 1 : 0)
        + (opts.includeNotes !== false ? 1 : 0);
      html += `<tr><td colspan="${colCount}" style="padding:4px 5px;border-bottom:none;">`;
      html += `<div class="optional-divider" style="margin:2px 0;"><span>Optional · ${section.optionalItems.length}</span></div>`;
      html += `</td></tr>`;
      for (const item of section.optionalItems) {
        globalIdx++;
        html += renderSummaryRow(normalizePart(item), globalIdx, {
          includeSource: opts.includeSource !== false,
          includeStock: opts.includeStock !== false,
          includeDemand: opts.includeDemand !== false,
          includeNotes: opts.includeNotes !== false,
          isGroupContext: true,
          pricingMode,
        });
      }
    }

    html += `</tbody></table>`;

    // Group subtotal
    if (sections.length > 1) {
      html += groupSubtotalHTML(section, pricingMode);
      html += `</div>`;
    }
  }
  return html;
}

// ─── COMPACT LIST (group-specific, no catalog equivalent) ───────────────
function buildCompactBody(sections, opts, catLookups, pricingMode) {
  const hasCost = showCost(pricingMode);
  const hasRetail = showRetail(pricingMode);

  let html = "";
  let globalIdx = 0;
  for (const section of sections) {
    if (sections.length > 1) {
      html += renderSectionHeading(section.label, section.counts.total);
    }
    html += `<table class="parts-table compact-table"><thead><tr>
      <th class="col-num">#</th>
      <th>Part Name</th>
      ${opts.includePartNumber !== false ? '<th>Part #</th>' : ''}
      ${opts.includeCategory !== false ? '<th>Category</th>' : ''}
      <th style="text-align:center">Qty</th>
      <th>Req/Opt</th>
      ${hasCost ? '<th style="text-align:right">Cost</th>' : ''}
      ${hasCost ? '<th style="text-align:right">Ext Cost</th>' : ''}
      ${hasRetail ? '<th style="text-align:right">Retail</th>' : ''}
      ${hasRetail ? '<th style="text-align:right">Ext Retail</th>' : ''}
    </tr></thead><tbody>`;

    const renderCompactRow = (item) => {
      globalIdx++;
      const { part } = item;
      const catPath = opts.includeCategory !== false && part.part_category_id && catLookups?.byId?.[part.part_category_id]
        ? getCategoryPathLabel(part.part_category_id, catLookups.byId) : "";
      const unitCost = item.unitCost || 0;
      const unitRetail = part.retail_override || part.retail_matrix_price || 0;
      const qty = item.quantity || 1;
      return `<tr class="${globalIdx % 2 === 0 ? "even" : "odd"}">
        <td class="num">${globalIdx}</td>
        <td><div class="part-name">${esc(part.part_name)}</div></td>
        ${opts.includePartNumber !== false ? `<td class="part-num">${part.vendor_part_number ? esc(part.vendor_part_number) : "—"}</td>` : ''}
        ${opts.includeCategory !== false ? `<td class="small" style="max-width:160px;word-wrap:break-word;">${catPath ? esc(catPath) : "—"}</td>` : ''}
        <td class="center qty">${qty}</td>
        <td class="small">${item.is_optional ? '<span style="color:#b45309;">Optional</span>' : "Required"}</td>
        ${hasCost ? `<td class="money">${formatCurrency(unitCost)}</td>` : ''}
        ${hasCost ? `<td class="money" style="font-weight:600;">${formatCurrency(unitCost * qty)}</td>` : ''}
        ${hasRetail ? `<td class="money">${formatCurrency(unitRetail)}</td>` : ''}
        ${hasRetail ? `<td class="money" style="font-weight:600;">${formatCurrency(unitRetail * qty)}</td>` : ''}
      </tr>`;
    };

    // Required rows
    for (const item of section.requiredItems) {
      html += renderCompactRow(item);
    }

    // Optional divider row inside table
    if (section.optionalItems.length > 0) {
      const colCount = 4 + (opts.includePartNumber !== false ? 1 : 0)
        + (opts.includeCategory !== false ? 1 : 0)
        + (hasCost ? 2 : 0) + (hasRetail ? 2 : 0);
      html += `<tr><td colspan="${colCount}" style="padding:4px 5px;border-bottom:none;">`;
      html += `<div class="optional-divider" style="margin:2px 0;"><span>Optional · ${section.optionalItems.length}</span></div>`;
      html += `</td></tr>`;
      for (const item of section.optionalItems) {
        html += renderCompactRow(item);
      }
    }

    html += `</tbody></table>`;
    // Group subtotal
    if (sections.length > 1) {
      html += groupSubtotalHTML(section, pricingMode);
    }
  }
  return html;
}