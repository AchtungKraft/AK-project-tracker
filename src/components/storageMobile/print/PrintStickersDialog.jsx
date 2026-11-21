import { useEffect, useState } from "react";
import { clearMobilePrint } from "@/lib/mobileLabelPrint";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsAdmin } from "@/lib/clientAccounts";
import NewStickersPanel from "./NewStickersPanel";
import ReprintStickerPanel from "./ReprintStickerPanel";
import TotePrintStudio from "./TotePrintStudio";
import { cn } from "@/lib/utils";

/** Storage Mobile sticker printing. With `tote`, opens straight to that tote's sticker. */
export default function PrintStickersDialog({ tote, onClose }) {
  const isAdmin = useIsAdmin();
  const [mode, setMode] = useState('new');
  useEffect(() => clearMobilePrint, []); // never leave print-only labels behind
  const tab = (m, label) => (
    <button type="button" onClick={() => setMode(m)}
      className={cn("flex-1 rounded-lg py-2.5 text-sm font-semibold", mode === m ? "bg-red-600 text-white" : "text-gray-300")}>{label}</button>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white w-[calc(100vw-16px)] max-w-lg max-h-[92dvh] flex flex-col overflow-hidden p-4">
        <DialogHeader><DialogTitle className="flex gap-2 items-center"><Printer className="w-5 h-5" /> {tote ? 'Print Label' : 'Print Stickers'}</DialogTitle></DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0 space-y-3 pr-1">
          {tote ? <TotePrintStudio tote={tote} /> : <>
            <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-950 p-1">
              {tab('new', 'Print New Stickers')}{tab('reprint', 'Reprint Existing')}
            </div>
            {mode === 'reprint' ? <ReprintStickerPanel />
              : isAdmin ? <NewStickersPanel />
              : <p className="text-sm text-amber-300">Reserving new sticker numbers needs an admin account. You can still reprint existing tote stickers.</p>}
          </>}
          <p className="text-[11px] text-gray-500">Prints US Letter sheets, three 8 × 3.25 in stickers per page, using your phone's print menu (AirPrint). Set scale to 100% if your printer offers it.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}