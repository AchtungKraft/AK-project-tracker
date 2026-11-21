import { jsPDF } from "jspdf";
import { paginate } from "@/components/inventory/labels/toteLabelDocument";
import { drawLabel } from "@/lib/stickerPdfLabel";

/**
 * PDF copy of the canonical label sheets: US Letter, .25 in margins, three 8 × 3.25 in labels per
 * page with .3 in gaps. Drawn directly as vector text and shapes (no screenshot of the page), so
 * the text prints exactly where the preview shows it.
 */
export async function buildStickerPdf(labels, fileName) {
  const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
  paginate(labels).forEach((page, p) => {
    if (p) pdf.addPage('letter', 'portrait');
    page.forEach((label, i) => drawLabel(pdf, label, 0.25, 0.25 + i * (3.25 + 0.3)));
  });
  return new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
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