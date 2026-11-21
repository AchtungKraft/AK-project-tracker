import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToteLabelPreview from "@/components/inventory/labels/ToteLabelPreview";
import PrintStatusPanel from "@/components/storageMobile/print/PrintStatusPanel";
import { paginate } from "@/components/inventory/labels/toteLabelDocument";
import { loadPrintJob, mobilePreviewScale } from "@/lib/mobileLabelPrint";
import { buildStickerPdf, printStickerPdf, shareOrDownloadPdf } from "@/lib/stickerPdf";

/**
 * Full-page sticker print screen for Storage Mobile. Both Print and Share/Print PDF use the same
 * canonical vector PDF (built from the stored labels on load), so paper never depends on the
 * browser keeping CSS backgrounds. Printing never creates or changes records.
 */
export default function StorageStickerPrint() {
  const navigate = useNavigate();
  const [job] = useState(loadPrintJob);
  const [pdf, setPdf] = useState({ loading: true });
  const [result, setResult] = useState(null);
  const labels = job?.labels || [];
  const pages = paginate(labels).length;

  useEffect(() => {
    if (!labels.length) return;
    buildStickerPdf(labels, `AK-stickers-${labels[0].short_code}.pdf`)
      .then((file) => setPdf({ file }))
      .catch((e) => setPdf({ error: e.message }));
  }, [labels]);

  const print = async () => setResult(await printStickerPdf(pdf.file));
  const sharePdf = async () => setResult(await shareOrDownloadPdf(pdf.file));
  const back = () => navigate(job?.returnTo || '/storage');

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-800 bg-gray-950/95 px-3 py-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={back} className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-300 active:bg-gray-800">
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <h1 className="flex-1 truncate text-base font-semibold">{job?.title || 'Print Stickers'}</h1>
      </div>
      {!labels.length ? (
        <div className="p-6 text-center space-y-3">
          <p className="text-gray-400">Nothing to print. Choose stickers in Storage first.</p>
          <Link to="/storage" className="text-sm underline text-gray-300">Back to Storage</Link>
        </div>
      ) : (
        <div className="mx-auto max-w-xl space-y-3 p-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <p className="text-sm text-gray-400">{labels.length} sticker{labels.length === 1 ? '' : 's'} · {pages} US Letter page{pages === 1 ? '' : 's'} · <span className="font-mono">{labels.map((l) => l.short_code).join(', ')}</span></p>
          <Button onClick={print} disabled={!pdf.file} className="w-full h-14 gap-2 text-lg">
            {pdf.loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
            {pdf.loading ? 'Preparing stickers…' : 'Print'}
          </Button>
          <PrintStatusPanel pdf={pdf} onPdf={sharePdf} result={result} />
          <ToteLabelPreview labels={labels} scale={mobilePreviewScale()} />
        </div>
      )}
    </div>
  );
}