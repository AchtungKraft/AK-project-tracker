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

/**
 * Builds a print-ready HTML report for a single Parts Group.
 * Uses shared renderers from sharedPrintRenderers.js for visual parity with Parts Catalog.
 *
 * PRICING SAFETY: pricingMode controls ALL pricing output.
 * When RETAIL_ONLY, zero cost values appear in the generated HTML.
 */
export function buildPartGroupPrintHTML({
  group, enrichedItems, sections, summary, vendorsMap,
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

  // Build sections from enrichedItems
  const reportSections = buildReportSections(enrichedItems, groupReportBy, catLookups);

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
    reportCSS = illustratedCSS();
    bodyHTML = buildIllustratedBody(reportSections, opts, normalizePart, pricingMode);
  } else if (reportType === "priceList") {
    reportCSS = priceListCSS();
    bodyHTML = buildPriceListBody(reportSections, opts, normalizePart, pricingMode);
  } else if (reportType === "compact") {
    reportCSS = summaryCSS();
    bodyHTML = buildCompactBody(reportSections, opts, catLookups, enrichedItems, pricingMode);
  } else {
    reportCSS = summaryCSS();
    bodyHTML = buildSummaryBody(reportSections, opts, normalizePart, groupReportBy, pricingMode);
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
  const sectionMap = new Map();
  for (const item of enrichedItems) {
    const section = item.section_name || "General Parts";
    if (!sectionMap.has(section)) sectionMap.set(section, []);
    sectionMap.get(section).push(item);
  }
  return Array.from(sectionMap.entries());
}

// ─── ILLUSTRATED (uses shared full-width card) ──────────────────────────
function buildIllustratedBody(sections, opts, normalizePart, pricingMode) {
  let html = "";
  for (const [sectionName, sectionItems] of sections) {
    if (sections.length > 1) {
      html += renderSectionHeading(sectionName, sectionItems.length);
    }
    for (const item of sectionItems) {
      html += renderIllustratedCard(normalizePart(item), {
        includeImages: opts.includeImages !== false,
        includeNotes: opts.includeNotes !== false,
        includeSource: opts.includeSource !== false,
        isGroupContext: true,
        pricingMode,
      });
    }
  }
  return html;
}

// ─── PRICE LIST (uses shared table rows) ────────────────────────────────
function buildPriceListBody(sections, opts, normalizePart, pricingMode) {
  let html = "";
  let globalIdx = 0;
  for (const [sectionName, sectionItems] of sections) {
    if (sections.length > 1) {
      html += renderSectionHeading(sectionName, sectionItems.length);
    }
    html += renderPriceListHeader({
      includeImages: !!opts.includeImages,
      isGroupContext: true,
      pricingMode,
    });
    for (const item of sectionItems) {
      globalIdx++;
      html += renderPriceListRow(normalizePart(item), globalIdx, {
        includeImages: !!opts.includeImages,
        includeDescriptions: !!opts.includeDescriptions,
        isGroupContext: true,
        pricingMode,
      });
    }
    html += `</tbody></table>`;
  }
  return html;
}

// ─── SUMMARY (uses shared table rows) ───────────────────────────────────
function buildSummaryBody(sections, opts, normalizePart, groupReportBy, pricingMode) {
  let html = "";
  let globalIdx = 0;
  const showCategory = groupReportBy !== "category";

  for (const [sectionName, sectionItems] of sections) {
    if (sections.length > 1) {
      html += `<div class="subcategory-group">`;
      // Section heading — show cost or retail subtotal depending on mode
      const hasCost = showCost(pricingMode);
      const hasRetail = showRetail(pricingMode);
      let sectionExtra = "";
      if (hasRetail) {
        const sectionRetail = sectionItems.reduce((s, i) => {
          const r = i.part?.retail_override || i.part?.retail_matrix_price || 0;
          return s + r * (i.quantity || 1);
        }, 0);
        sectionExtra = formatCurrency(sectionRetail);
      } else if (hasCost) {
        const sectionCost = sectionItems.reduce((s, i) => s + (i.extCost || 0), 0);
        sectionExtra = formatCurrency(sectionCost);
      }
      html += renderSectionHeading(sectionName, sectionItems.length, sectionExtra);
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

    for (const item of sectionItems) {
      globalIdx++;
      const p = normalizePart(item);
      if (showCategory) p._showCategory = true;
      html += renderSummaryRow(p, globalIdx, {
        includeSource: opts.includeSource !== false,
        includeStock: opts.includeStock !== false,
        includeDemand: opts.includeDemand !== false,
        includeNotes: opts.includeNotes !== false,
        isGroupContext: true,
        pricingMode,
      });
    }
    html += `</tbody></table>`;
    if (sections.length > 1) html += `</div>`;
  }
  return html;
}

// ─── COMPACT LIST (group-specific, no catalog equivalent) ───────────────
function buildCompactBody(sections, opts, catLookups, enrichedItems, pricingMode) {
  const hasCost = showCost(pricingMode);
  const hasRetail = showRetail(pricingMode);

  let html = "";
  let globalIdx = 0;
  for (const [sectionName, sectionItems] of sections) {
    if (sections.length > 1) {
      html += renderSectionHeading(sectionName, sectionItems.length);
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
    for (const item of sectionItems) {
      globalIdx++;
      const { part } = item;
      const catPath = opts.includeCategory !== false && part.part_category_id && catLookups?.byId?.[part.part_category_id]
        ? getCategoryPathLabel(part.part_category_id, catLookups.byId) : "";
      const unitCost = item.unitCost || 0;
      const unitRetail = part.retail_override || part.retail_matrix_price || 0;
      const qty = item.quantity || 1;
      html += `<tr class="${globalIdx % 2 === 0 ? "even" : "odd"}">
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
    }
    html += `</tbody></table>`;
  }
  return html;
}