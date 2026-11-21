import { useState } from "react";
import { Loader2 } from "lucide-react";
import ToteLabelStudio from "@/components/inventory/labels/ToteLabelStudio";
import { draftFromContainer } from "@/components/inventory/labels/labelDrafts";
import { useStorageCategories } from "@/components/inventory/labels/useStorageCategories";
import { printToteLabelsMobile, mobilePreviewScale } from "@/lib/mobileLabelPrint";

/** Reprint one existing tote's sticker: same number, same QR, no new records. */
export default function TotePrintStudio({ tote }) {
  const { data: categories = [], isLoading } = useStorageCategories();
  const [drafts, setDrafts] = useState(() => [draftFromContainer(tote)]);
  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  return (
    <ToteLabelStudio drafts={drafts} onChange={setDrafts} categories={categories}
      printLetter={printToteLabelsMobile} previewScale={mobilePreviewScale()} />
  );
}