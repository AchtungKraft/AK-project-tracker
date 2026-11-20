import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Printer } from "lucide-react";
import { printContainerQRLabel } from "../containerQRLabel";
import { draftFromContainer } from "./labelDrafts";
import { useStorageCategories } from "./useStorageCategories";
import ToteLabelStudio from "./ToteLabelStudio";

export default function ToteLabelPrintDialog({ container, locations = [], onClose }) {
  const { data: categories = [], isLoading } = useStorageCategories();
  const [drafts, setDrafts] = useState(() => [draftFromContainer(container)]);
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white w-[calc(100vw-20px)] max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle className="flex gap-2 items-center"><Printer className="w-5 h-5" /> Print Tote Label</DialogTitle></DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0 pr-1">
          {isLoading ? <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div> :
            <ToteLabelStudio drafts={drafts} onChange={setDrafts} categories={categories}
              onThermal={() => printContainerQRLabel({ ...container, name: drafts[0].name || container.name }, { locations })} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}