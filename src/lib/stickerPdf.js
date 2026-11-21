import { jsPDF } from "jspdf";
import { paginate } from "@/components/inventory/labels/toteLabelDocument";
import { drawLabel } from "@/lib/stickerPdfLabel";

/** Shown on the print page so a cached older app version is visible at a glance. */
export const STICKER_PRINT_VERSION = 'PDF-v3 · 2026-11-21';

/**
 * PDF copy of the canonical label sheets: US Letter, .25 in margins, three 8 × 3.25 in labels per
 * page with .3 in gaps. Drawn directly as vector text and shapes (no screenshot of the page), so
 * the text prints exactly where the preview shows it. Built once per print page; Print, Share and
 * Save all hand iOS this same File object (same bytes).
 */
export async function buildStickerPdf(labels, fileName) {
  const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
  pdf.setProperties({ title: fileName, creator: `AK Projects ${STICKER_PRINT_VERSION}` });
  paginate(labels).forEach((page, p) => {
    if (p) pdf.addPage('letter', 'portrait');
    page.forEach((label, i) => drawLabel(pdf, label, 0.25, 0.25 + i * (3.25 + 0.3)));
  });
  return new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
}

/** SHA-256 of the exact bytes (first 12 hex chars) so the printed and saved files can be compared. */
export async function pdfFingerprint(file) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Print the canonical PDF (never the HTML page, whose purple fills iOS AirPrint drops).
 * iPhone/iPad: share sheet, where Print sends the PDF's artwork as-is. Desktop: the browser's
 * PDF viewer prints it from a hidden frame; if that is blocked, the PDF opens in a new tab.
 */
export async function printStickerPdf(file) {
  if (isIOS()) return shareOrDownloadPdf(file);
  const url = URL.createObjectURL(file);
  document.getElementById('ak-pdf-print-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'ak-pdf-print-frame';
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  frame.src = url;
  await new Promise((resolve) => { frame.onload = resolve; document.body.appendChild(frame); });
  try {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    return 'opened';
  } catch {
    window.open(url, '_blank');
    return 'tab';
  }
}

/** Must run from a tap. iPhone: share sheet (includes Print). Elsewhere: download. */
export async function shareOrDownloadPdf(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  return downloadPdf(file);
}

/** Saves the exact File (no regeneration). On iPhone this opens the PDF; use Share > Save to Files. */
export function downloadPdf(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}