import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/notify";
import { useLocalPreference } from "@/components/inventory/photos/useLocalPreference";
import { useQuickCapture } from "./useQuickCapture";
import CaptureModeTabs from "./CaptureModeTabs";
import CaptureSourceButtons from "./CaptureSourceButtons";
import CaptureQueue from "./CaptureQueue";
import CaptureFooter from "./CaptureFooter";

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Camera-first capture for one tote.
 * Quick Photos: saved as unsorted photos. New Item: saved together as one item (Save Item & Next keeps going).
 * With `target` ({id, name}) the photos are added to that existing item in one step.
 */
export default function QuickCaptureDialog({ container, onClose, target }) {
  const qc = useQueryClient();
  const { items, saving, unsaved, addFiles, remove, saveAll, saveItem } = useQuickCapture(container.id);
  const [pref, setPref] = useLocalPreference('ak_capture_mode', 'quick', ['quick', 'item']);
  const mode = target ? 'existing' : pref;
  const [name, setName] = useState('');
  const [sessionItems, setSessionItems] = useState(0);
  const failed = items.filter(i => i.status === 'failed').length;
  const tote = container.short_code || container.name;

  useEffect(() => {
    if (!unsaved) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // Refresh in the background so the next capture never waits on it.
  const refresh = () => {
    ['storagePhotoGrid', 'storageUnsortedPhotos', 'storedPropertyContainer', 'storageMobileContainer', 'storageLastOrganize']
      .forEach((k) => qc.invalidateQueries({ queryKey: [k, container.id] }));
    qc.invalidateQueries({ queryKey: ['storageMobileSearch'] });
  };

  const run = async (keepOpen) => {
    if (mode === 'quick') {
      const r = await saveAll();
      if (!r) return;
      if (r.saved) refresh();
      if (r.failed) return toast.error(`${r.failed} photo${r.failed === 1 ? '' : 's'} failed. ${r.saved} saved. Tap Retry Failed to try again.`);
      if (r.saved) toast.success(`${plural(r.saved, 'photo')} saved to ${tote}`);
      if (!keepOpen) onClose();
      return;
    }
    const r = await saveItem({ name: mode === 'item' ? name.trim() : undefined, propertyId: target?.id });
    if (!r) return;
    if (r.failed) {
      return toast.error(r.stage === 'upload'
        ? `${plural(r.failed, 'photo')} did not upload. Nothing was saved yet. Tap Retry.`
        : `Item was not saved: ${r.error}. Tap Retry. Photos will not be duplicated.`);
    }
    refresh();
    if (mode === 'existing') { toast.success(`Added ${plural(r.saved, 'photo')} to ${target.name}`); return onClose(); }
    toast.success(`Saved ${r.item?.name || 'item'} · ${plural(r.saved, 'photo')}`);
    setSessionItems((n) => n + 1);
    setName('');
    if (!keepOpen) onClose();
  };

  const cancel = () => {
    if (saving) return;
    if (unsaved && !window.confirm(`Discard ${unsaved} unsaved photo${unsaved === 1 ? '' : 's'}?`)) return;
    onClose();
  };

  const title = mode === 'existing' ? 'Add Photos' : 'Capture';
  const subtitle = mode === 'existing' ? `Adding to ${target.name}` : mode === 'item' ? `${tote} · photos of one item, saved together` : `${tote} · saved as unsorted, no details needed`;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-lg w-[calc(100vw-1rem)] max-h-[95vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-left">{title}</DialogTitle>
          <p className="text-xs text-gray-400 text-left">{subtitle}</p>
        </DialogHeader>
        {!target && <CaptureModeTabs mode={mode} onChange={setPref} disabled={saving || items.length > 0} />}
        {mode === 'item' && (
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} maxLength={150}
            placeholder="Item name (optional)" enterKeyHint="done" className="h-12 bg-gray-900 border-gray-700 text-base" />
        )}
        <CaptureSourceButtons onFiles={addFiles} disabled={saving}
          takeLabel={mode === 'item' && items.length ? 'Take Another Photo' : 'Take Photo'} />
        <CaptureQueue items={items} saving={saving} onRemove={remove}
          emptyText={mode === 'item' ? 'Take one or more photos of this item.' : 'No photos yet. Take a photo or add from the library.'} />
        <CaptureFooter mode={mode} saving={saving} unsaved={unsaved} failed={failed} onSave={run} onCancel={cancel} sessionCount={sessionItems} />
      </DialogContent>
    </Dialog>
  );
}