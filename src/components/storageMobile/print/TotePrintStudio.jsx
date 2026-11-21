import { useState } from "react";
import { Loader2 } from "lucide-react";
import ToteLabelStudio from "@/components/inventory/labels/ToteLabelStudio";
import { draftFromContainer } from "@/components/inventory/labels/labelDrafts";
import { useStorageCategories } from "@/components/inventory/labels/useStorageCategories";
import { mobilePreviewScale } from "@/lib/mobileLabelPrint";
import { useOpenStickerPrint } from "./useOpenStickerPrint";

/** Reprint one existing tote's sticker: same number, same QR, no new records. */
export default function TotePrintStudio({ tote, returnTo }) {
  const { data: categories = [], isLoading } = useStorageCategories();
  const [drafts, setDrafts] = useState(() => [draftFromContainer(tote)]);
  const openPrint = useOpenStickerPrint({ title: `Sticker ${tote.short_code}`, returnTo });
  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  return (
    <ToteLabelStudio drafts={drafts} onChange={setDrafts} categories={categories}
      printLetter={openPrint} previewScale={mobilePreviewScale()} />
  );
}