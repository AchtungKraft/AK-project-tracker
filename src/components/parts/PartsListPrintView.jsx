import { formatCurrency, getPartRetailEffectiveSafe } from "@/components/supply/pricingHelpers";

/**
 * Builds a printable HTML document for the current parts list.
 * Shows full detail: category, vendor, vehicle, costs, inventory stats, and locations.
 */
export function buildPartsListPrintHTML({
  parts,
  categories,
  vendors,
  makes,
  models,
  years,
  inventoryViewMap,
  title = "Parts Catalog",
  categoryLabel = null,
}) {
  const catMap = new Map(categories.map(c => [c.id, c]));
  const vendorMap = new Map(vendors.map(v => [v.id, v]));
  const makeMap = new Map(makes.map(m => [m.id, m]));
  const modelMap = new Map(models.map(m => [m.id, m]));
  const yearMap = new Map(years.map(y => [y.id, y]));

  const getCategoryPath = (catId) => {
    if (!catId) return "—";
    const cat = catMap.get(catId);
    if (!cat) return "—";
    if (cat.parent_id) {
      const parent = catMap.get(cat.parent_id);
      if (parent) return `${parent.name} › ${cat.name}`;
    }
    return cat.name;
  };

  const getVehicle = (part) => {
    const segs = [];
    const make = makeMap.get(part.car_make_id);
    const model = modelMap.get(part.car_model_id);
    const year = yearMap.get(part.car_year_id);
    if (year?.year) segs.push(year.year);
    if (make?.name) segs.push(make.name);
    if (model?.name) segs.push(model.name);
    return segs.length > 0 ? segs.join(" ") : "—";
  };

  const partTypeLabels = {
    PURCHASED_VENDOR: "Vendor",
    AK_MANUFACTURED: "AK Mfg",
    CLIENT_SUPPLIED: "Client",
    TAKE_OFF: "Take-Off",
    STOCK_AK: "AK Stock",
    WARRANTY_REPLACEMENT: "Warranty",
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  // Summary stats
  const totalCost = parts.reduce((s, p) => s + (p.cost || 0), 0);
  const totalRetail = parts.reduce((s, p) => {
    const { value } = getPartRetailEffectiveSafe(p);
    return s + value;
  }, 0);

  const rows = parts.map((part, idx) => {
    const vendor = vendorMap.get(part.default_vendor_id);
    const inv = inventoryViewMap?.get(part.id);
    const { value: retail } = getPartRetailEffectiveSafe(part);
    const pricingMode = part.pricing_mode === "manual" ? "Manual" : "Matrix";

    return `
      <tr class="${idx % 2 === 0 ? "even" : "odd"}">
        <td class="num">${idx + 1}</td>
        <td>
          <div class="part-name">${esc(part.part_name)}</div>
          ${part.vendor_part_number ? `<div class="part-num">${esc(part.vendor_part_number)}</div>` : ""}
          ${part.part_type && part.part_type !== "PURCHASED_VENDOR" ? `<div class="part-type">${partTypeLabels[part.part_type] || part.part_type}</div>` : ""}
        </td>
        <td class="small">${esc(getCategoryPath(part.part_category_id))}</td>
        <td class="small">${vendor ? esc(vendor.vendor_name) : "—"}</td>
        <td class="small">${esc(getVehicle(part))}</td>
        <td class="money">${formatCurrency(part.cost || 0)}</td>
        <td class="money">${formatCurrency(retail)}<div class="pricing-mode">${pricingMode}</div></td>
        <td class="center">${inv?.physical_stock ?? "—"}</td>
        <td class="center">${inv?.available ?? "—"}</td>
        <td class="center">${inv?.required_total ?? "—"}</td>
        <td class="center">${inv?.on_order ?? "—"}</td>
        <td class="center">${inv?.to_order ?? "—"}</td>
      </tr>`;
  }).join("");

  const subtitle = categoryLabel ? `Category: ${categoryLabel}` : "All Categories";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: landscape; margin: 0.4in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 9pt; color: #1a1a1a; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #dc2626; padding-bottom: 8px; margin-bottom: 12px; }
  .header h1 { font-size: 18pt; font-weight: 800; color: #111; letter-spacing: 0.5px; }
  .header .meta { text-align: right; font-size: 8pt; color: #666; }
  .subtitle { font-size: 10pt; color: #555; margin-bottom: 4px; }
  .summary { display: flex; gap: 24px; margin-bottom: 12px; padding: 8px 12px; background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px; }
  .summary .stat { font-size: 9pt; }
  .summary .stat strong { font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  th { background: #1a1a1a; color: #fff; padding: 6px 5px; text-align: left; font-weight: 600; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
  td { padding: 5px 5px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  tr.even td { background: #fafafa; }
  tr.odd td { background: #fff; }
  .num { width: 24px; text-align: center; color: #999; font-size: 7pt; }
  .part-name { font-weight: 600; font-size: 8.5pt; color: #111; }
  .part-num { font-family: 'SF Mono', 'Courier New', monospace; font-size: 7pt; color: #666; margin-top: 1px; }
  .part-type { font-size: 7pt; color: #dc2626; font-weight: 500; margin-top: 1px; }
  .small { font-size: 7.5pt; color: #444; }
  .money { text-align: right; font-family: 'SF Mono', 'Courier New', monospace; font-size: 8pt; white-space: nowrap; }
  .center { text-align: center; font-weight: 500; }
  .pricing-mode { font-size: 6.5pt; color: #888; text-align: right; }
  .footer { margin-top: 12px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 7pt; color: #999; display: flex; justify-content: space-between; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>ÄCHTUNG KRAFT — ${esc(title)}</h1>
      <div class="subtitle">${esc(subtitle)} · ${parts.length} parts</div>
    </div>
    <div class="meta">
      ${esc(dateStr)}<br/>${esc(timeStr)}
    </div>
  </div>

  <div class="summary">
    <div class="stat">Parts: <strong>${parts.length}</strong></div>
    <div class="stat">Total Cost: <strong>${formatCurrency(totalCost)}</strong></div>
    <div class="stat">Total Retail: <strong>${formatCurrency(totalRetail)}</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Part Name / Part #</th>
        <th>Category</th>
        <th>Vendor</th>
        <th>Vehicle</th>
        <th style="text-align:right">Cost</th>
        <th style="text-align:right">Retail</th>
        <th style="text-align:center">Stock</th>
        <th style="text-align:center">Avail</th>
        <th style="text-align:center">Demand</th>
        <th style="text-align:center">On Order</th>
        <th style="text-align:center">To Order</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    <span>Ächtung Kraft — Parts Report</span>
    <span>Generated ${esc(dateStr)} ${esc(timeStr)}</span>
  </div>
</body>
</html>`;
}

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Opens the print dialog for a parts list.
 */
export function printPartsList(options) {
  const html = buildPartsListPrintHTML(options);
  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}