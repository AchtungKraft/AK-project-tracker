/**
 * ClientDetailPDFExport — Generates a clean client-facing PDF of invoice line items
 * grouped by category, using ONLY saved ProjectInvoiceLine data (financial snapshot).
 * 
 * ARCHITECTURE:
 * - Source: ProjectInvoice + ProjectInvoiceLine records ONLY
 * - Category: line.category_name (snapshot field) for parts, line.type for services/manual
 * - NO live Part/Service/Commitment lookups
 * - NO cost/margin/vendor data exposed
 */
import { jsPDF } from "jspdf";

const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 25;
const LINE_HEIGHT = 6;
const HEADER_ROW_HEIGHT = 7;
const ROW_PADDING = 2;

// Column positions (from left margin)
const COL = {
  description: MARGIN_LEFT,
  qty: 145,
  unitRetail: 160,
  retail: 185,
};

const PAGE_WIDTH = 210; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function capitalize(str) {
  if (!str) return "";
  return str.toUpperCase();
}

/**
 * Group lines by category, resolving category name from saved snapshot data.
 * Returns array of { categoryName, lines[], subtotal }
 */
function groupLinesByCategory(lines, categoryOrder) {
  const groups = {};

  for (const line of lines) {
    let categoryName;

    if (line.type === "part" || line.type === "outside_cost") {
      categoryName = line.category_name || "UNCATEGORIZED";
    } else if (line.type === "service") {
      categoryName = "SERVICES";
    } else if (line.type === "manual") {
      categoryName = "ADDITIONAL ITEMS";
    } else if (line.type === "credit_adjustment") {
      // Skip credit adjustment lines — these are handled in totals
      continue;
    } else {
      categoryName = "OTHER";
    }

    if (!groups[categoryName]) {
      groups[categoryName] = { categoryName, lines: [], subtotal: 0 };
    }
    groups[categoryName].lines.push(line);
    groups[categoryName].subtotal += (line.line_total || 0);
  }

  // Sort groups: use categoryOrder map if available, then alphabetical
  const sorted = Object.values(groups).sort((a, b) => {
    const orderA = categoryOrder.get(a.categoryName) ?? 9999;
    const orderB = categoryOrder.get(b.categoryName) ?? 9999;
    if (orderA !== orderB) return orderA - orderB;
    // Alphabetical fallback
    return a.categoryName.localeCompare(b.categoryName);
  });

  // Within each group, preserve saved line order (sort_order field)
  for (const group of sorted) {
    group.lines.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  return sorted;
}

/**
 * Wrap text into lines that fit within maxWidth
 */
function wrapText(doc, text, maxWidth) {
  if (!text) return [""];
  return doc.splitTextToSize(text, maxWidth);
}

/**
 * Check if we have enough space on the page, add new page if not
 * Returns current Y position (possibly reset to top of new page)
 */
function ensureSpace(doc, y, needed) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - MARGIN_BOTTOM) {
    doc.addPage();
    return MARGIN_TOP;
  }
  return y;
}

/**
 * Draw table header row
 */
function drawTableHeader(doc, y) {
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 100, 100);

  doc.text("Description", COL.description, y);
  doc.text("QTY", COL.qty, y, { align: "right" });
  doc.text("Unit Retail", COL.unitRetail + 15, y, { align: "right" });
  doc.text("Retail", PAGE_WIDTH - MARGIN_RIGHT, y, { align: "right" });

  y += 2;
  doc.setDrawColor(180, 180, 180);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);

  return y + 4;
}

/**
 * Main export function
 */
export function generateClientDetailPDF({ invoice, lines, project, categoryOrder }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN_TOP;

  // ─── HEADER ───
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("INVOICE DETAIL", MARGIN_LEFT, y);
  y += 10;

  // Project & client info
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);

  if (project?.name) {
    doc.setFont("helvetica", "bold");
    doc.text(project.name, MARGIN_LEFT, y);
    y += 5;
    doc.setFont("helvetica", "normal");
  }

  if (project?.client_name) {
    doc.text(`Client: ${project.client_name}`, MARGIN_LEFT, y);
    y += 5;
  }

  // Invoice metadata line
  const metaParts = [];
  const typeLabel = invoice.invoice_type ? invoice.invoice_type.charAt(0).toUpperCase() + invoice.invoice_type.slice(1) : "";
  if (typeLabel) metaParts.push(`Type: ${typeLabel}`);
  if (invoice.qb_invoice_number) metaParts.push(`Invoice #: ${invoice.qb_invoice_number}`);
  if (invoice.issue_date) {
    const d = new Date(invoice.issue_date + "T12:00:00");
    metaParts.push(`Date: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
  } else if (invoice.created_date) {
    const d = new Date(invoice.created_date);
    metaParts.push(`Date: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
  }
  const statusLabel = invoice.status ? invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1) : "";
  if (statusLabel) metaParts.push(`Status: ${statusLabel}`);

  if (metaParts.length > 0) {
    doc.setFontSize(9);
    doc.text(metaParts.join("   •   "), MARGIN_LEFT, y);
    y += 5;
  }

  // Separator
  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 8;

  // ─── CATEGORY GROUPS ───
  const groups = groupLinesByCategory(lines, categoryOrder);
  const descMaxWidth = COL.qty - COL.description - 5; // space for description column

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];

    // Category heading — ensure space for heading + header + at least 1 row
    const minSpaceForHeading = HEADER_ROW_HEIGHT + HEADER_ROW_HEIGHT + LINE_HEIGHT + 10;
    y = ensureSpace(doc, y, minSpaceForHeading);

    // Category title
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(capitalize(group.categoryName), MARGIN_LEFT, y);
    y += 7;

    // Table header
    y = drawTableHeader(doc, y);

    // Lines
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);

    for (let li = 0; li < group.lines.length; li++) {
      const line = group.lines[li];
      const descLines = wrapText(doc, line.description || line.part_name || "—", descMaxWidth);
      const rowHeight = Math.max(descLines.length * LINE_HEIGHT, LINE_HEIGHT) + ROW_PADDING;

      // Check if this row fits; if not, new page with repeated header
      y = ensureSpace(doc, y, rowHeight + 2);
      if (y === MARGIN_TOP) {
        // We just added a page — re-draw category continuation header
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 100, 100);
        doc.text(`${capitalize(group.categoryName)} (continued)`, MARGIN_LEFT, y);
        y += 6;
        y = drawTableHeader(doc, y);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(40, 40, 40);
      }

      // Description (multi-line)
      for (let di = 0; di < descLines.length; di++) {
        doc.text(descLines[di], COL.description, y + (di * LINE_HEIGHT));
      }

      // Qty, Unit Retail, Retail — aligned to first line
      const qtyStr = line.qty != null ? String(line.qty) : "—";
      const unitStr = line.unit_price != null ? formatCurrency(line.unit_price) : "—";
      const totalStr = formatCurrency(line.line_total || 0);

      doc.text(qtyStr, COL.qty, y, { align: "right" });
      doc.text(unitStr, COL.unitRetail + 15, y, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(totalStr, PAGE_WIDTH - MARGIN_RIGHT, y, { align: "right" });
      doc.setFont("helvetica", "normal");

      y += rowHeight;
    }

    // Category subtotal
    y += 2;
    doc.setDrawColor(180, 180, 180);
    doc.line(COL.unitRetail - 5, y, PAGE_WIDTH - MARGIN_RIGHT, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(
      `${capitalize(group.categoryName)} SUBTOTAL`,
      COL.unitRetail - 5,
      y
    );
    doc.text(
      formatCurrency(group.subtotal),
      PAGE_WIDTH - MARGIN_RIGHT,
      y,
      { align: "right" }
    );
    y += 10;
  }

  // ─── INVOICE SUMMARY ───
  y = ensureSpace(doc, y, 40);
  y += 5;
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  doc.setLineWidth(0.2);
  y += 8;

  const summaryX = PAGE_WIDTH - MARGIN_RIGHT - 60;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);

  // Subtotal
  doc.text("Subtotal:", summaryX, y);
  doc.text(formatCurrency(invoice.subtotal || 0), PAGE_WIDTH - MARGIN_RIGHT, y, { align: "right" });
  y += 7;

  // Credit Applied (use effective credit: credit_applied for sent/paid, credit_proposed for drafts)
  const effectiveCredit = invoice.credit_applied || invoice.credit_proposed || 0;
  if (effectiveCredit > 0) {
    doc.text("Credit Applied:", summaryX, y);
    doc.setTextColor(22, 163, 74); // green
    doc.text(`(${formatCurrency(effectiveCredit)})`, PAGE_WIDTH - MARGIN_RIGHT, y, { align: "right" });
    y += 7;
    doc.setTextColor(60, 60, 60);
  }

  // Balance Due — bold and prominent
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("Balance Due:", summaryX, y);
  doc.text(formatCurrency(invoice.balance_due || 0), PAGE_WIDTH - MARGIN_RIGHT, y, { align: "right" });

  // ─── FOOTER ───
  const pageCount = doc.internal.getNumberOfPages();
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150, 150, 150);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.text(
      `Page ${i} of ${pageCount}`,
      PAGE_WIDTH / 2,
      pageH - 10,
      { align: "center" }
    );
  }

  return doc;
}

/**
 * Trigger PDF download in the browser
 */
export function downloadClientDetailPDF({ invoice, lines, project, categoryOrder }) {
  const doc = generateClientDetailPDF({ invoice, lines, project, categoryOrder });
  const projectSlug = (project?.name || "invoice").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
  const typeLabel = invoice.invoice_type || "invoice";
  const fileName = `${projectSlug}_${typeLabel}_client_detail.pdf`;
  doc.save(fileName);
}