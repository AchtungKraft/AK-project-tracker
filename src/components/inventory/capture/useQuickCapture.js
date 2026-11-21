import { useCallback, useEffect, useRef, useState } from "react";
import { saveQuickCapturePhoto } from "@/lib/quickCaptureUpload";

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, '');
const CONCURRENCY = 2;

/** Local capture queue. Saved photos leave the queue; failed ones stay for retry. */
export function useQuickCapture(containerId) {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const caches = useRef(new Map());
  const batchId = useRef(newKey());
  const savingRef = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach(i => URL.revokeObjectURL(i.preview)), []);

  const patch = (key, p) => setItems(list => list.map(i => i.key === key ? { ...i, ...p } : i));

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter(f => f.type?.startsWith('image/') || /\.(heic|heif)$/i.test(f.name || ''));
    if (!files.length) return;
    setItems(list => [...list, ...files.map(file => ({
      key: newKey(), batchId: batchId.current, file, preview: URL.createObjectURL(file), status: 'pending', error: null,
    }))]);
  }, []);

  const remove = useCallback((key) => {
    setItems(list => {
      const it = list.find(i => i.key === key);
      if (!it || !['pending', 'failed'].includes(it.status)) return list;
      URL.revokeObjectURL(it.preview);
      caches.current.delete(key);
      return list.filter(i => i.key !== key);
    });
  }, []);

  /** Saves every unsaved photo. Resolves to {saved, failed}. Saved photos are cleared from the queue. */
  const saveAll = useCallback(async () => {
    if (savingRef.current) return { saved: 0, failed: 0 };
    savingRef.current = true; setSaving(true);
    const queue = itemsRef.current.filter(i => i.status === 'pending' || i.status === 'failed');
    let saved = 0, failed = 0;
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!caches.current.has(item.key)) caches.current.set(item.key, {});
        patch(item.key, { status: 'uploading', error: null });
        try {
          await saveQuickCapturePhoto({ item, cache: caches.current.get(item.key), containerId, onStage: s => patch(item.key, { status: s }) });
          patch(item.key, { status: 'saved' }); saved++;
        } catch (e) {
          patch(item.key, { status: 'failed', error: e.message }); failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setItems(list => list.filter(i => {
      if (i.status !== 'saved') return true;
      URL.revokeObjectURL(i.preview); caches.current.delete(i.key); return false;
    }));
    batchId.current = newKey();
    savingRef.current = false; setSaving(false);
    return { saved, failed };
  }, [containerId]);

  const unsaved = items.filter(i => i.status !== 'saved').length;
  return { items, saving, unsaved, addFiles, remove, saveAll };
}