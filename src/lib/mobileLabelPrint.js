import { paginate, renderToteLabel, TOTE_LABEL_CSS } from "@/components/inventory/labels/toteLabelDocument";

/**
 * Storage Mobile sticker printing, built on the canonical Tote Label V2 document (same labels,
 * same QR, same 8 × 3.25 in size, same US Letter page). The labels to print are handed to the
 * dedicated print page (/storage/print) through sessionStorage, so a reload or a return trip keeps
 * them. Printing and retries never create or change records: only already-issued identifiers are used.
 */
const JOB_KEY = 'ak_sticker_print_job';
export const PRINT_ROOT_ID = 'ak-print-root';

export function assertPrintable(labels) {
  if (!labels?.length || labels.some((l) => !l.qr_code_value || !l.short_code)) {
    throw new Error('Every label needs a permanent tote number and QR identity');
  }
}

export function savePrintJob(job) {
  assertPrintable(job.labels);
  sessionStorage.setItem(JOB_KEY, JSON.stringify(job));
}

export function loadPrintJob() {
  try { return JSON.parse(sessionStorage.getItem(JOB_KEY)); } catch { return null; }
}

/** Same sheets as buildToteLabelDocument's body. */
export const labelSheetsHtml = (labels) =>
  paginate(labels).map((p) => `<div class="sheet">${p.map(renderToteLabel).join('')}</div>`).join('');

/** On paper only the print root shows, styled by the canonical label CSS. Hidden on screen. */
export const printOnlyCss = () => `
  #${PRINT_ROOT_ID}{display:none}
  @media print{
    body > *:not(#${PRINT_ROOT_ID}){display:none !important}
    #${PRINT_ROOT_ID}{display:block !important}
    html,body{overflow:visible !important;height:auto !important;min-height:0 !important;padding:0 !important;background:#fff !important}
    ${TOTE_LABEL_CSS}
  }`;

/** Fit the 8.5 in preview page to the phone width. */
export const mobilePreviewScale = () => Math.min(0.62, Math.max(0.3, (window.innerWidth - 56) / 842));