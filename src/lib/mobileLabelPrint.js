/**
 * Storage Mobile sticker print jobs. Paper output is the canonical vector PDF (lib/stickerPdf),
 * drawn with the same measurements, colors and font-size rules as the Tote Label V2 preview. The labels to print are handed to the
 * dedicated print page (/storage/print) through sessionStorage, so a reload or a return trip keeps
 * them. Printing and retries never create or change records: only already-issued identifiers are used.
 */
const JOB_KEY = 'ak_sticker_print_job';

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


/** Fit the 8.5 in preview page to the phone width. */
export const mobilePreviewScale = () => Math.min(0.62, Math.max(0.3, (window.innerWidth - 56) / 842));