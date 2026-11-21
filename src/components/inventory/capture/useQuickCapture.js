import { useCallback, useEffect, useRef, useState } from "react";
import { saveQuickCapturePhoto, saveCapturedItem, uploadCaptureFiles } from "@/lib/quickCaptureUpload";

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, '');
const CONCURRENCY = 3;
const UNSAVED = ['pending', 'failed', 'uploaded'];

/** Runs `fn` over `list` with a few uploads in flight at once. */
async function pool(list, fn) {
  const queue = [...list];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

/**
 * Local capture queue for one tote. Saved photos leave the queue; failed ones stay for retry.
 * Finished uploads are cached per photo, so a retry only redoes what actually failed.
 */
export function useQuickCapture(containerId) {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const caches = useRef(new Map());
  const batchId = useRef(newKey());
  const itemKey = useRef(newKey());
  const savingRef = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach(i => URL.revokeObjectURL(i.preview)), []);

  const patch = (key, p) => setItems(list => list.map(i => i.key === key ? { ...i, ...p } : i));
  const cacheFor = (key) => { if (!caches.current.has(key)) caches.current.set(key, {}); return caches.current.get(key); };

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
      if (!it || !UNSAVED.includes(it.status)) return list;
      URL.revokeObjectURL(it.preview);
      caches.current.delete(key);
      return list.filter(i => i.key !== key);
    });
  }, []);

  const clearSaved = () => setItems(list => list.filter(i => {
    if (i.status !== 'saved') return true;
    URL.revokeObjectURL(i.preview); caches.current.delete(i.key); return false;
  }));

  const guard = async (fn) => {
    if (savingRef.current) return null;
    savingRef.current = true; setSaving(true);
    try { return await fn(); } finally { savingRef.current = false; setSaving(false); }
  };

  /** Quick Photos: each photo is saved to the tote on its own as soon as it uploads. */
  const saveAll = useCallback(() => guard(async () => {
    const queue = itemsRef.current.filter(i => UNSAVED.includes(i.status));
    let saved = 0, failed = 0;
    const ids = [];
    await pool(queue, async (item) => {
      patch(item.key, { status: 'uploading', error: null });
      try {
        const photo = await saveQuickCapturePhoto({ item, cache: cacheFor(item.key), containerId, onStage: s => patch(item.key, { status: s }) });
        if (photo?.id) ids.push(photo.id);
        patch(item.key, { status: 'saved' }); saved++;
      } catch (e) {
        patch(item.key, { status: 'failed', error: e.message }); failed++;
      }
    });
    clearSaved();
    batchId.current = newKey();
    return { saved, failed, ids };
  }), [containerId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * New Item / Add to Item: uploads every photo, then one server step creates the item and
   * attaches them all. Nothing is attached until every photo has uploaded; a retry reuses the
   * same item key and finished uploads.
   */
  const saveItem = useCallback(({ name, propertyId } = {}) => guard(async () => {
    const queue = itemsRef.current.filter(i => UNSAVED.includes(i.status));
    if (!queue.length) return { saved: 0, failed: 0 };
    const uploads = [];
    let failed = 0;
    await pool(queue, async (item) => {
      patch(item.key, { status: 'uploading', error: null });
      try {
        uploads.push({ item, files: await uploadCaptureFiles({ item, cache: cacheFor(item.key) }) });
        patch(item.key, { status: 'uploaded' });
      } catch (e) {
        patch(item.key, { status: 'failed', error: e.message }); failed++;
      }
    });
    if (failed) return { saved: 0, failed, stage: 'upload' };
    queue.forEach(i => patch(i.key, { status: 'saving' }));
    try {
      const order = new Map(queue.map((i, n) => [i.key, n]));
      uploads.sort((a, b) => order.get(a.item.key) - order.get(b.item.key));
      const result = await saveCapturedItem({ containerId, itemKey: itemKey.current, propertyId, name, batchId: batchId.current, uploads });
      queue.forEach(i => patch(i.key, { status: 'saved' }));
      clearSaved();
      itemKey.current = newKey(); batchId.current = newKey();
      return { saved: queue.length, failed: 0, item: result.item };
    } catch (e) {
      queue.forEach(i => patch(i.key, { status: 'failed', error: e.message }));
      return { saved: 0, failed: queue.length, stage: 'register', error: e.message };
    }
  }), [containerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const unsaved = items.filter(i => i.status !== 'saved').length;
  return { items, saving, unsaved, addFiles, remove, saveAll, saveItem };
}