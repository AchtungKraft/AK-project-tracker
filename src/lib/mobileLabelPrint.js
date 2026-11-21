import { buildToteLabelDocument } from "@/components/inventory/labels/toteLabelDocument";

/**
 * Storage Mobile printing for the canonical Tote Label V2 document (same labels, same QR, same size).
 * Opens the document in a new tab (synchronously, inside the tap, so iOS Safari allows it),
 * opens the native print sheet (AirPrint), and keeps an on-screen Print / Close bar
 * that is hidden from the printed output. Printing never creates or changes records.
 */
const BAR_CSS = `
  .ak-bar{position:sticky;top:0;z-index:10;display:flex;gap:12px;justify-content:center;padding:14px;background:#111827}
  .ak-bar button{font:600 28px Arial,sans-serif;padding:14px 36px;border-radius:12px;border:0;background:#dc2626;color:#fff}
  .ak-bar button.close{background:#374151}
  @media print{.ak-bar{display:none !important}}
`;
const BAR = `<div class="ak-bar"><button onclick="window.print()">Print</button><button class="close" onclick="window.close()">Close</button></div>`;

export function printToteLabelsMobile(labels) {
  if (!labels.length || labels.some((l) => !l.qr_code_value || !l.short_code)) {
    throw new Error('Every label needs a permanent tote number and QR identity');
  }
  const w = window.open('', '_blank');
  if (!w) return false;
  const html = buildToteLabelDocument(labels)
    .replace('</head>', `<style>${BAR_CSS}</style></head>`)
    .replace('<body>', `<body>${BAR}`);
  w.document.open();
  w.document.write(html);
  w.document.close();
  let done = false;
  const go = () => { if (done) return; done = true; w.focus(); w.print(); };
  w.onload = go;
  setTimeout(go, 700); // Safari does not always fire load for written documents
  return true;
}

/** Fit the 8.5 in preview page to the phone width. */
export const mobilePreviewScale = () => Math.min(0.62, Math.max(0.3, (window.innerWidth - 56) / 842));