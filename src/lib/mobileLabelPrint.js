import { buildToteLabelDocument, TOTE_LABEL_CSS } from "@/components/inventory/labels/toteLabelDocument";

/**
 * Storage Mobile printing for the canonical Tote Label V2 document (same labels, same QR, same size).
 * No pop-up window: the labels are placed in a hidden block on the current page and the native print
 * sheet (AirPrint) prints only that block. Everything else on the page is hidden in print.
 * Printing never creates or changes records.
 */
const ROOT_ID = 'ak-print-root';
const STYLE_ID = 'ak-print-style';

export function clearMobilePrint() {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
}

export function printToteLabelsMobile(labels) {
  if (!labels.length || labels.some((l) => !l.qr_code_value || !l.short_code)) {
    throw new Error('Every label needs a permanent tote number and QR identity');
  }
  clearMobilePrint();
  const doc = buildToteLabelDocument(labels);
  const body = doc.slice(doc.indexOf('<body>') + 6, doc.lastIndexOf('</body>'));

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID}{display:none}
    @media print{
      body > *:not(#${ROOT_ID}){display:none !important}
      #${ROOT_ID}{display:block !important}
      html,body{overflow:visible !important;height:auto !important;min-height:0 !important;padding:0 !important;background:#fff !important}
      ${TOTE_LABEL_CSS}
    }`;
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = body;
  document.head.appendChild(style);
  document.body.appendChild(root);

  window.addEventListener('afterprint', clearMobilePrint, { once: true });
  window.print();
  return true;
}

/** Fit the 8.5 in preview page to the phone width. */
export const mobilePreviewScale = () => Math.min(0.62, Math.max(0.3, (window.innerWidth - 56) / 842));