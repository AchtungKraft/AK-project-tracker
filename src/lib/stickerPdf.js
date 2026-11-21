import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { buildToteLabelDocument } from "@/components/inventory/labels/toteLabelDocument";

/**
 * PDF copy of the canonical label document: each 8.5 × 11 in sheet rendered at 288 dpi onto a
 * US Letter page, so the stickers keep their exact size and margins. The document is laid out in an
 * off-screen frame only to render it; nothing is printed from that frame.
 */
export async function buildStickerPdf(labels, fileName) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:900px;height:${Math.ceil(labels.length / 3) * 1100 + 100}px;border:0`;
  const loaded = new Promise((resolve) => { frame.onload = resolve; });
  frame.srcdoc = buildToteLabelDocument(labels);
  document.body.appendChild(frame);
  try {
    await loaded;
    const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
    const sheets = [...frame.contentDocument.querySelectorAll('.sheet')];
    for (const [i, sheet] of sheets.entries()) {
      const canvas = await html2canvas(sheet, { scale: 3, backgroundColor: '#ffffff', logging: false });
      if (i) pdf.addPage('letter', 'portrait');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 8.5, 11);
    }
    return new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
  } finally {
    frame.remove();
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