import { generateQRMatrix } from "@/components/inventory/QRCodeSVG";
import { inkFor, PANEL_MIN_CONTRAST, QR_MIN_CONTRAST } from "@/components/inventory/labels/labelColors";
import { nameFontPt, numberFontPt } from "@/components/inventory/labels/toteLabelDocument";
import { toteQrPayload } from "@/lib/toteQrUrl";

/**
 * Draws one canonical tote label (same geometry as TOTE_LABEL_CSS, in inches) straight into a
 * jsPDF page with vector text and a vector QR. No screenshot step, so text cannot shift or clip.
 * (x, y) = label's top-left corner. Fonts: PDF built-ins Helvetica-Bold and Courier-Bold.
 */
const PT = 1 / 72, PX = 1 / 96;
const W = 8, H = 3.25, HEAD = 0.34, WRITE = 0.85, QR_COL = 2, PAD_X = 0.18;
const clean = (s) => String(s ?? '').normalize('NFKC').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');

function fitText(pdf, text, maxW) {
  if (pdf.getTextWidth(text) <= maxW) return text;
  while (text.length > 1 && pdf.getTextWidth(text + '...') > maxW) text = text.slice(0, -1);
  return text.trimEnd() + '...';
}

function drawQr(pdf, value, x, y, size, ink) {
  const { matrix, size: n } = generateQRMatrix(value);
  const cell = size / (n + 8);
  pdf.setFillColor(ink);
  matrix.forEach((row, r) => row.forEach((on, c) => {
    if (on) pdf.rect(x + (c + 4) * cell, y + (r + 4) * cell, cell + 0.001, cell + 0.001, 'F');
  }));
}

export function drawLabel(pdf, label, x, y) {
  const panel = inkFor(label.category.color, PANEL_MIN_CONTRAST);
  const qrInk = inkFor(label.category.color, QR_MIN_CONTRAST);
  const code = String(label.short_code || '');
  const raw = String(label.name || '').trim();
  const name = raw === code ? '' : clean(raw).toUpperCase();

  // Header band
  pdf.setFillColor(panel);
  pdf.rect(x, y, W, HEAD, 'F');
  pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor('#ffffff');
  const head = fitText(pdf, `ÄCHTUNG KRAFT  |  STORAGE - ${clean(label.category.name).toUpperCase()}`, W - 0.4);
  pdf.text(head, x + 0.16, y + HEAD / 2 + 0.36 * 12 * PT, { charSpace: PX });

  // Body: white QR column + colored identity panel
  const bodyTop = y + HEAD, bodyH = H - HEAD - WRITE;
  pdf.rect(x + QR_COL, bodyTop, W - QR_COL, bodyH, 'F');
  drawQr(pdf, toteQrPayload(label.qr_code_value), x + 0.06, bodyTop + (bodyH - 1.88) / 2, 1.88, qrInk);

  const innerW = W - QR_COL - PAD_X * 2, left = x + QR_COL + PAD_X, gap = 0.06;
  const nameSize = name ? nameFontPt(name) : 14;
  pdf.setFont('helvetica', 'bold').setFontSize(nameSize);
  let lines = name ? pdf.splitTextToSize(name, innerW) : [];
  if (lines.length > 3) lines = [...lines.slice(0, 2), fitText(pdf, lines.slice(2).join(' '), innerW)];
  const nameLh = nameSize * 1.05 * PT;
  const nameH = name ? lines.length * nameLh : 0.36;
  const numSize = numberFontPt(code);
  const numH = numSize * 1.3 * PT + 0.08;
  const scanH = 9 * 1.15 * PT;
  let cy = bodyTop + (bodyH - (nameH + numH + scanH + gap * 2)) / 2;

  pdf.setTextColor('#ffffff');
  if (name) {
    lines.forEach((line, i) => pdf.text(line, left, cy + i * nameLh + (nameLh + 0.72 * nameSize * PT) / 2));
  } else {
    pdf.text('NAME:', left, cy + nameH - 0.05);
    const lx = left + pdf.getTextWidth('NAME:') + 0.1;
    pdf.setDrawColor('#ffffff').setLineWidth(2 * PX).line(lx, cy + nameH, left + innerW, cy + nameH);
  }
  cy += nameH + gap;

  // Identifier: exact stored characters, Courier-Bold (fixed width), on a white box with padding
  pdf.setFont('courier', 'bold').setFontSize(numSize);
  const boxW = Math.min(innerW, pdf.getTextWidth(code) + 0.28);
  pdf.setFillColor('#ffffff').roundedRect(left, cy, boxW, numH, 3 * PX, 3 * PX, 'F');
  pdf.setTextColor(panel).text(code, left + 0.14, cy + 0.04 + numSize * PT * 0.95);
  cy += numH + gap;

  pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor('#ffffff');
  pdf.text('SCAN TO DOCUMENT CONTENTS', left, cy + scanH * 0.8, { charSpace: 0.8 * PX });

  // Write-in fields
  const wTop = y + H - WRITE;
  pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor('#000000').setDrawColor('#000000').setLineWidth(PX);
  ['CLIENT:', 'PROJECT:'].forEach((f, i) => {
    const bottom = wTop + 0.04 + 0.0275 + 0.3 + i * 0.355;
    pdf.text(f, x + PAD_X, bottom - 0.04);
    pdf.line(x + PAD_X + 1.05, bottom, x + W - PAD_X, bottom);
  });

  // Borders last so fills never cover them
  pdf.setDrawColor(panel).setLineWidth(1.5 * PX);
  pdf.line(x, wTop, x + W, wTop);
  pdf.rect(x, y, W, H, 'S');
}