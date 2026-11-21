import { CheckCircle2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const MESSAGES = {
  shared: 'Choose Print in the share menu, then set scale to 100% (Actual Size) if offered.',
  opened: 'Print menu opened. Set scale to 100% (Actual Size) and paper to US Letter.',
  tab: 'The PDF opened in a new tab. Print it from there at 100% scale.',
  downloaded: 'PDF downloaded. Open it and print at 100% scale.',
};

/** Print outcome + the separate share/download route for the same PDF. */
export default function PrintStatusPanel({ pdf, onPdf, result }) {
  return (
    <div className="space-y-2">
      {MESSAGES[result] && (
        <p className="text-sm text-green-300 flex gap-2 items-start"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {MESSAGES[result]}</p>
      )}
      <Button variant="outline" onClick={onPdf} disabled={!pdf.file} className="w-full h-12 gap-2 text-base">
        <FileDown className="w-4 h-4" /> Share or Print PDF
      </Button>
      {pdf.error && <p className="text-xs text-red-400">Stickers could not be prepared: {pdf.error}</p>}
    </div>
  );
}