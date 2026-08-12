import {
  esc, getTimestamp, baseStyles, headerHTML, footerHTML, formatCurrency,
} from "@/components/parts/print/printHelpers";
import { getCategoryPathLabel } from "@/lib/categoryTreeHelpers";

/**
 * Builds a print-ready HTML report for a single Parts Group.
 * Reuses the Ächtung Kraft print architecture.
 */
export function buildPartGroupPrintHTML({ group, enrichedItems, sections, summary, vendorsMap, inventoryViewMap, catLookups }) {
  const ts = getTimestamp();

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

  // Description
  const descHTML = group.description
    ? `<div style="margin-bottom:12px;font-size:9pt;color:#444;max-width:80ch;">${esc(group.description)}</div>`
    : "";

  // Instructions
  const instrHTML = group.instructions
    ? `<div style="margin-bottom:12px;padding:8px;background:#f0f7ff;border:1px solid #c8ddf5;border-radius:4px;font-size:8.5pt;color:#333;"><strong>Instructions:</strong> ${esc(group.instructions)}</div>`
    : "";

  // Build sections
  let sectionsHTML = "";
  let globalIdx = 0;

  for (const [sectionName, sectionItems] of sections) {
    const sectionCost = sectionItems.reduce((s, i) => s + i.extCost, 0);
    const showSectionHeading = sections.length > 1;

    if (showSectionHeading) {
      sectionsHTML += `<div class="subcategory-group"><h3 class="subcat-heading">${esc(sectionName.toUpperCase())} <span class="part-count">· ${sectionItems.length} Part${sectionItems.length !== 1 ? "s" : ""} · ${formatCurrency(sectionCost)}</span></h3>`;
    }

    sectionsHTML += `<table class="parts-table"><thead><tr>
      <th class="col-num">#</th>
      <th>Part</th>
      <th>Category</th>
      <th style="text-align:center">Qty</th>
      <th>Req/Opt</th>
      <th>Source</th>
      <th style="text-align:right">Unit Cost</th>
      <th style="text-align:right">Ext Cost</th>
      <th style="text-align:center">Stock</th>
      <th style="text-align:center">Demand</th>
      <th>Notes</th>
    </tr></thead><tbody>`;

    for (const item of sectionItems) {
      globalIdx++;
      const { part, inv, unitCost, extCost } = item;
      const vendor = vendorsMap?.[part.default_vendor_id];
      const onHand = inv?.physical_stock ?? "—";
      const demand = inv?.required_total ?? "—";

      const catPath = part.part_category_id && catLookups?.byId?.[part.part_category_id]
        ? getCategoryPathLabel(part.part_category_id, catLookups.byId) : "";

      sectionsHTML += `<tr class="${globalIdx % 2 === 0 ? "even" : "odd"}">
        <td class="num">${globalIdx}</td>
        <td>
          <div class="part-name">${esc(part.part_name)}</div>
          ${part.vendor_part_number ? `<div class="part-num">${esc(part.vendor_part_number)}</div>` : ""}
        </td>
        <td class="small" style="max-width:160px;word-wrap:break-word;">${catPath ? esc(catPath) : "—"}</td>
        <td class="center qty">${item.quantity || 1}</td>
        <td class="small">${item.is_optional ? '<span style="color:#b45309;">Optional</span>' : "Required"}</td>
        <td class="small">${vendor ? esc(vendor.vendor_name) : "—"}</td>
        <td class="money">${formatCurrency(unitCost)}</td>
        <td class="money" style="font-weight:600;">${formatCurrency(extCost)}</td>
        <td class="center qty">${onHand}</td>
        <td class="center qty">${demand}</td>
        <td class="small" style="max-width:120px;word-wrap:break-word;">${item.notes ? esc(item.notes) : ""}</td>
      </tr>`;
    }

    sectionsHTML += `</tbody></table>`;
    if (showSectionHeading) sectionsHTML += `</div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(group.name)} — Parts Group</title>
<style>
  ${baseStyles()}
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
  @media print {
    .parts-table tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .subcat-heading { break-after: avoid; }
  }
</style>
</head><body>
  ${headerHTML("Parts Group", subtitle, null, ts)}
  ${descHTML}
  ${instrHTML}
  ${stripHTML}
  ${sectionsHTML}
  <div class="estimate-note">* Estimated costs based on current Parts Tracker cost data. Actual costs may vary.</div>
  ${footerHTML(ts)}
</body></html>`;
}