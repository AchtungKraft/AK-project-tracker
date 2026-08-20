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

// ─── LAYOUT CONSTANTS ───
const MARGIN_LEFT = 18;
const MARGIN_RIGHT = 18;
const MARGIN_TOP = 22;
const MARGIN_BOTTOM = 22;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// Typography scale
const FONT = {
  title: 18,
  projectName: 13,
  categoryHeading: 11,
  tableHeader: 8.5,
  body: 9.5,
  subtotalLabel: 9.5,
  summaryLabel: 11,
  summaryValue: 11,
  balanceDueLabel: 13,
  balanceDueValue: 13,
  footer: 8,
  continuedLabel: 9,
  metaLine: 9,
  clientName: 10,
};

// Spacing
const SPACE = {
  lineHeight: 5.5,        // body text line height
  rowPadding: 3.5,        // vertical padding below each row
  headerRowHeight: 7,     // table header row
  categoryGapBefore: 10,  // space before a new category heading
  categoryGapAfter: 4,    // space after category heading before table header
  subtotalGapAbove: 4,    // space between last row and subtotal rule
  subtotalGapBelow: 12,   // space after subtotal before next category
  summaryGapAbove: 8,     // space above final summary block
};

// Column positions (right-edge positions for right-aligned cols)
const COL = {
  description: MARGIN_LEFT,
  qty: 140,               // right-edge of QTY column
  unitRetail: 168,        // right-edge of Unit Retail column
  retail: PAGE_WIDTH - MARGIN_RIGHT, // right-edge of Retail column
};

const DESC_MAX_WIDTH = COL.qty - COL.description - 8;

// ─── HELPERS ───

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

  const sorted = Object.values(groups).sort((a, b) => {
    const orderA = categoryOrder.get(a.categoryName) ?? 9999;
    const orderB = categoryOrder.get(b.categoryName) ?? 9999;
    if (orderA !== orderB) return orderA - orderB;
    return a.categoryName.localeCompare(b.categoryName);
  });

  for (const group of sorted) {
    group.lines.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  return sorted;
}

/**
 * Check if we have enough space; add page if not. Returns new Y.
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
 * Draw table header row with improved alignment
 */
function drawTableHeader(doc, y) {
  doc.setFontSize(FONT.tableHeader);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);

  doc.text("Description", COL.description, y);
  doc.text("QTY", COL.qty, y, { align: "right" });
  doc.text("Unit Retail", COL.unitRetail, y, { align: "right" });
  doc.text("Retail", COL.retail, y, { align: "right" });

  y += 2.5;
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  doc.setLineWidth(0.2);

  return y + SPACE.lineHeight;
}

/**
 * Draw page footer (called after all content is placed)
 */
function drawFooters(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(FONT.footer);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Page ${i} of ${pageCount}`,
      PAGE_WIDTH / 2,
      pageH - 12,
      { align: "center" }
    );
  }
}

// ─── MAIN EXPORT ───

export function generateClientDetailPDF({ invoice, lines, project, categoryOrder }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN_TOP;

  // ─── PAGE 1 HEADER ───
  doc.setFontSize(FONT.title);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text("INVOICE DETAIL", MARGIN_LEFT, y);
  y += 9;

  // Project name — strongest identifier
  if (project?.name) {
    doc.setFontSize(FONT.projectName);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40, 40, 40);
    doc.text(project.name, MARGIN_LEFT, y);
    y += 7;
  }

  // Client name
  if (project?.client_name) {
    doc.setFontSize(FONT.clientName);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(project.client_name, MARGIN_LEFT, y);
    y += 6;
  }

  // Metadata line: Type · Status · Date
  const metaParts = [];
  const typeLabel = invoice.invoice_type
    ? invoice.invoice_type.charAt(0).toUpperCase() + invoice.invoice_type.slice(1)
    : "";
  if (typeLabel) metaParts.push(typeLabel);
  const statusLabel = invoice.status
    ? invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)
    : "";
  if (statusLabel) metaParts.push(statusLabel);
  if (invoice.qb_invoice_number) metaParts.push(`#${invoice.qb_invoice_number}`);
  if (invoice.issue_date) {
    const d = new Date(invoice.issue_date + "T12:00:00");
    metaParts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
  } else if (invoice.created_date) {
    const d = new Date(invoice.created_date);
    metaParts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
  }

  if (metaParts.length > 0) {
    doc.setFontSize(FONT.metaLine);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(metaParts.join("  ·  "), MARGIN_LEFT, y);
    y += 5;
  }

  // Header separator
  y += 4;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  doc.setLineWidth(0.2);
  y += SPACE.categoryGapBefore;

  // ─── CATEGORY GROUPS ───
  const groups = groupLinesByCategory(lines, categoryOrder);

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];

    // Category heading — ensure space for heading + header + at least 2 rows
    const minSpaceNeeded = SPACE.categoryGapBefore + FONT.categoryHeading + SPACE.categoryGapAfter
      + SPACE.headerRowHeight + (SPACE.lineHeight + SPACE.rowPadding) * 2;
    y = ensureSpace(doc, y, minSpaceNeeded);

    // Extra gap before category (except the first one)
    if (gi > 0) {
      y += SPACE.categoryGapBefore;
      y = ensureSpace(doc, y, minSpaceNeeded);
    }

    // Category heading with subtle background band
    doc.setFillColor(245, 245, 245);
    doc.rect(MARGIN_LEFT, y - 4.5, CONTENT_WIDTH, 7, "F");

    doc.setFontSize(FONT.categoryHeading);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    doc.text(capitalize(group.categoryName), MARGIN_LEFT + 2, y);
    y += SPACE.categoryGapAfter + 2;

    // Table header
    y = drawTableHeader(doc, y);

    // Line items
    doc.setFontSize(FONT.body);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(35, 35, 35);

    for (let li = 0; li < group.lines.length; li++) {
      const line = group.lines[li];
      const descText = line.description || line.part_name || "—";
      const descLines = doc.splitTextToSize(descText, DESC_MAX_WIDTH);
      const rowHeight = Math.max(descLines.length * SPACE.lineHeight, SPACE.lineHeight) + SPACE.rowPadding;

      // Check fit — keep last row + subtotal together when possible
      const isLastRow = li === group.lines.length - 1;
      const neededForRow = isLastRow
        ? rowHeight + SPACE.subtotalGapAbove + 12 // row + subtotal
        : rowHeight + 2;

      const prevY = y;
      y = ensureSpace(doc, y, neededForRow);
      if (y === MARGIN_TOP && prevY !== MARGIN_TOP) {
        // Page break happened — draw continuation header
        doc.setFontSize(FONT.continuedLabel);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 100, 100);
        doc.text(`${capitalize(group.categoryName)} — continued`, MARGIN_LEFT, y);
        y += 6;
        y = drawTableHeader(doc, y);
        doc.setFontSize(FONT.body);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(35, 35, 35);
      }

      // Description (multi-line)
      for (let di = 0; di < descLines.length; di++) {
        doc.text(descLines[di], COL.description, y + (di * SPACE.lineHeight));
      }

      // Numeric columns — aligned to first line of row
      const qtyStr = line.qty != null ? String(line.qty) : "—";
      const unitStr = line.unit_price != null ? formatCurrency(line.unit_price) : "—";
      const totalStr = formatCurrency(line.line_total || 0);

      doc.text(qtyStr, COL.qty, y, { align: "right" });
      doc.text(unitStr, COL.unitRetail, y, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(totalStr, COL.retail, y, { align: "right" });
      doc.setFont("helvetica", "normal");

      y += rowHeight;

      // Light row separator for dense categories
      if (!isLastRow && group.lines.length > 3) {
        doc.setDrawColor(225, 225, 225);
        doc.setLineWidth(0.15);
        doc.line(MARGIN_LEFT, y - 1, PAGE_WIDTH - MARGIN_RIGHT, y - 1);
        doc.setLineWidth(0.2);
      }
    }

    // ─── CATEGORY SUBTOTAL ───
    y += SPACE.subtotalGapAbove;
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.25);
    doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
    doc.setLineWidth(0.2);
    y += 5;

    doc.setFontSize(FONT.subtotalLabel);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    // Simple "Subtotal" label — category heading above provides context
    doc.text("Subtotal", COL.qty - 20, y);
    // Amount right-aligned to Retail column
    doc.setTextColor(20, 20, 20);
    doc.text(formatCurrency(group.subtotal), COL.retail, y, { align: "right" });

    y += SPACE.subtotalGapBelow;
  }

  // ─── INVOICE FINANCIAL SUMMARY ───
  const summaryBlockHeight = 50;
  y = ensureSpace(doc, y, summaryBlockHeight);
  y += SPACE.summaryGapAbove;

  // Double rule above summary
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  doc.setLineWidth(0.2);
  y += 10;

  const labelX = PAGE_WIDTH - MARGIN_RIGHT - 70;
  const valueX = COL.retail;

  // Subtotal
  doc.setFontSize(FONT.summaryLabel);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);
  doc.text("Subtotal", labelX, y);
  doc.setFont("helvetica", "bold");
  doc.text(formatCurrency(invoice.subtotal || 0), valueX, y, { align: "right" });
  y += 8;

  // Credit Applied (only if > 0)
  const effectiveCredit = invoice.credit_applied || invoice.credit_proposed || 0;
  if (effectiveCredit > 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    doc.text("Credit Applied", labelX, y);
    doc.setTextColor(22, 130, 60);
    doc.setFont("helvetica", "bold");
    doc.text(`(${formatCurrency(effectiveCredit)})`, valueX, y, { align: "right" });
    y += 8;
  }

  // Separator before Balance Due
  y += 2;
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  doc.line(labelX, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  doc.setLineWidth(0.2);
  y += 8;

  // Balance Due — largest, boldest financial value
  doc.setFontSize(FONT.balanceDueLabel);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 15, 15);
  doc.text("Balance Due", labelX, y);
  doc.setFontSize(FONT.balanceDueValue);
  doc.text(formatCurrency(invoice.balance_due || 0), valueX, y, { align: "right" });

  // ─── PAGE FOOTERS ───
  drawFooters(doc);

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