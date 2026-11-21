import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToteLabelPreview from "@/components/inventory/labels/ToteLabelPreview";
import PrintStatusPanel from "@/components/storageMobile/print/PrintStatusPanel";
import { paginate } from "@/components/inventory/labels/toteLabelDocument";
import { loadPrintJob, labelSheetsHtml, printOnlyCss, PRINT_ROOT_ID, mobilePreviewScale } from "@/lib/mobileLabelPrint";
import { buildStickerPdf, shareOrDownloadPdf } from "@/lib/stickerPdf";

/**
 * Full-page sticker print screen for Storage Mobile (no dialog, no pop-up window). Print is a direct
 * tap on window.print() of this top-level page; the canonical label sheets are the only thing on paper.
 * If the print menu does not open within 2 s, the page says so and offers the PDF route.
 */
export default function StorageStickerPrint() {
  const navigate = useNavigate();
  const [job] = useState(loadPrintJob);
  const [status, setStatus] = useState('idle'); // idle | opening | opened | failed
  const [pdf, setPdf] = useState({ loading: true });
  const [pdfResult, setPdfResult] = useState(null);
  const printing = useRef(false);
  const labels = job?.labels || [];
  const sheets = useMemo(() => labelSheetsHtml(labels), [labels]);
  const pages = paginate(labels).length;

  useEffect(() => {
    const opened = () => { if (printing.current) setStatus('opened'); };
    const media = window.matchMedia('print');
    const onMedia = (e) => e.matches && opened();
    window.addEventListener('beforeprint', opened);
    media.addEventListener?.('change', onMedia);
    return () => { window.removeEventListener('beforeprint', opened); media.removeEventListener?.('change', onMedia); };
  }, []);

  useEffect(() => {
    if (!labels.length) return;
    buildStickerPdf(labels, `AK-stickers-${labels[0].short_code}.pdf`)
      .then((file) => setPdf({ file }))
      .catch((e) => setPdf({ error: e.message }));
  }, [labels]);

  const print = () => {
    printing.current = true;
    setStatus('opening');
    try { window.print(); } catch { setStatus('failed'); return; }
    setTimeout(() => setStatus((s) => (s === 'opening' ? 'failed' : s)), 2000);
  };
  const sharePdf = async () => setPdfResult(await shareOrDownloadPdf(pdf.file));
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
          <Button onClick={print} disabled={status === 'opening'} className="w-full h-14 gap-2 text-lg">
            <Printer className="w-5 h-5" /> {status === 'opening' ? 'Opening print menu…' : 'Print'}
          </Button>
          <PrintStatusPanel status={status} pdf={pdf} onPdf={sharePdf} pdfResult={pdfResult} />
          <ToteLabelPreview labels={labels} scale={mobilePreviewScale()} />
        </div>
      )}
      {labels.length > 0 && createPortal(
        <><style>{printOnlyCss()}</style><div id={PRINT_ROOT_ID} dangerouslySetInnerHTML={{ __html: sheets }} /></>,
        document.body,
      )}
    </div>
  );
}