import { base44 } from "@/api/base44Client";

/** Tote photo grid API. Every image is private; URLs are short-lived signed links. */
const call = async (payload) => {
  const res = await base44.functions.invoke('storageProperty', payload);
  const data = res?.data || res;
  if (!data?.success) throw new Error(data?.error || 'Photo service unavailable');
  return data;
};

export const PHOTO_PAGE_SIZE = 30;

export const fetchTotePhotoPage = ({ containerId, filter, cursor }) =>
  call({ action: 'list_photos', container_id: containerId, filter, cursor, limit: PHOTO_PAGE_SIZE });

export const fetchPhotoOriginal = async (photoId) =>
  (await call({ action: 'photo_original', photo_id: photoId })).signed_url;

/* Missing previews are built on the server, two at a time, once per photo per session. */
const previewCache = new Map();
const queue = [];
let running = 0;
const pump = () => {
  while (running < 2 && queue.length) {
    const { id, resolve } = queue.shift();
    running++;
    call({ action: 'make_preview', photo_id: id })
      .then((d) => resolve(d.thumb_url || null))
      .catch(() => resolve(null))
      .finally(() => { running--; pump(); });
  }
};

export function requestPreview(photoId) {
  if (!previewCache.has(photoId)) {
    previewCache.set(photoId, new Promise((resolve) => { queue.push({ id: photoId, resolve }); pump(); }));
  }
  return previewCache.get(photoId);
}