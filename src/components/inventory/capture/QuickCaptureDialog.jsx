import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Camera, Images, Loader2 } from "lucide-react";
import { toast } from "@/lib/notify";
import { useQuickCapture } from "./useQuickCapture";
import CaptureThumb from "./CaptureThumb";

/** Photo-first capture: photos are saved straight to the box as unsorted photos. */
export default function QuickCaptureDialog({ container, onClose, onSaved, subtitle }) {
  const qc = useQueryClient();
  const { items, saving, unsaved, addFiles, remove, saveAll } = useQuickCapture(container.id);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const failedCount = items.filter(i => i.status === 'failed').length;
  const doneCount = items.filter(i => i.status === 'saved').length;

  useEffect(() => {
    if (!unsaved) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const pick = (e) => { addFiles(e.target.files); e.target.value = ''; };

  const run = async (keepOpen) => {
    const { saved, failed, ids } = await saveAll();
    if (ids?.length) onSaved?.(ids);
    if (saved) {
      qc.invalidateQueries({ queryKey: ['storageUnsortedPhotos', container.id] });
      qc.invalidateQueries({ queryKey: ['storagePhotoGrid', container.id] });
    }
    if (failed) toast.error(`${failed} photo${failed === 1 ? '' : 's'} failed. ${saved} saved. Tap Retry Failed to try again.`);
    else if (saved) toast.success(`${saved} photo${saved === 1 ? '' : 's'} saved to ${container.short_code || container.name}`);
    if (!failed && !keepOpen) onClose();
  };

  const cancel = () => {
    if (saving) return;
    if (unsaved && !window.confirm(`Discard ${unsaved} unsaved photo${unsaved === 1 ? '' : 's'}?`)) return;
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-lg w-[calc(100vw-1rem)] max-h-[95vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-left">Capture Photos</DialogTitle>
          <p className="text-xs text-gray-400 text-left">{subtitle || `${container.short_code || container.name} · no details needed`}</p>
        </DialogHeader>

        <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={pick} />
        <input ref={libraryRef} hidden type="file" accept="image/*" multiple onChange={pick} />

        <Button onClick={() => cameraRef.current?.click()} disabled={saving}
          className="w-full h-20 text-lg gap-3 bg-red-600 hover:bg-red-700">
          <Camera className="w-7 h-7" /> Take Photo
        </Button>
        <Button variant="outline" onClick={() => libraryRef.current?.click()} disabled={saving}
          className="w-full h-12 gap-2 border-gray-700 text-gray-200">
          <Images className="w-5 h-5" /> Add From Library
        </Button>

        {items.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map(i => <CaptureThumb key={i.key} item={i} onRemove={remove} disabled={saving} />)}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4 border border-dashed border-gray-800 rounded-lg">No photos yet. Take a photo or add from the library.</p>
        )}

        {saving && (
          <div className="space-y-1">
            <Progress value={items.length ? (doneCount / items.length) * 100 : 0} className="h-2" />
            <p className="text-xs text-gray-400">Saving {doneCount} of {items.length}…</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button onClick={() => run(false)} disabled={saving || !unsaved} className="h-12 bg-green-700 hover:bg-green-600 gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {failedCount && !saving ? 'Retry Failed' : `Save All${unsaved ? ` (${unsaved})` : ''}`}
          </Button>
          <Button onClick={() => run(true)} disabled={saving || !unsaved} variant="outline" className="h-12 border-gray-700 text-gray-200">
            Save & Capture More
          </Button>
        </div>
        <Button variant="ghost" onClick={cancel} disabled={saving} className="w-full text-gray-400">Cancel</Button>
      </DialogContent>
    </Dialog>
  );
}