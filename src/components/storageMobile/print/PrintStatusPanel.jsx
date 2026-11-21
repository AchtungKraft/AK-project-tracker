import { AlertTriangle, CheckCircle2, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Print outcome + the PDF route (share sheet → Print), which works when the print menu cannot open. */
export default function PrintStatusPanel({ status, pdf, onPdf, pdfResult }) {
  return (
    <div className="space-y-2">
      {status === 'failed' && (
        <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200 flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold">The print menu did not open.</p>
            <p className="text-amber-200/80 text-xs mt-1">This happens when the app runs from the Home Screen icon or inside another app. Use the PDF below and choose Print in the share menu, or open this app in Safari and tap Print again. Your stickers keep the same numbers.</p>
          </div>
        </div>
      )}
      {status === 'opened' && (
        <p className="text-sm text-green-300 flex gap-2 items-center"><CheckCircle2 className="w-4 h-4" /> Print menu opened. Set scale to 100% if your printer offers it.</p>
      )}
      <Button variant={status === 'failed' ? 'default' : 'outline'} onClick={onPdf} disabled={!pdf.file} className="w-full h-12 gap-2 text-base">
        {pdf.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
        {pdf.loading ? 'Preparing PDF…' : 'Share or Print PDF'}
      </Button>
      {pdf.error && <p className="text-xs text-red-400">PDF could not be prepared: {pdf.error}</p>}
      {pdfResult === 'downloaded' && <p className="text-xs text-gray-400">PDF downloaded. Open it and use Share → Print.</p>}
    </div>
  );
}