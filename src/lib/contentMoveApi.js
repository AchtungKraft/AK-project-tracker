import { base44 } from "@/api/base44Client";

/** Moves individual contents between totes (not the whole tote). Throws with the server's message. */
const call = async (payload) => {
  try {
    const res = await base44.functions.invoke('storageContentMove', payload);
    const data = res?.data || res;
    if (!data?.success) throw new Error(data?.error || 'Move service unavailable');
    return data;
  } catch (e) {
    const err = new Error(e?.response?.data?.error || e.message);
    err.code = e?.response?.data?.code || null;
    throw err;
  }
};

export const moveContents = ({ opKey, sourceId, destinationId, entryIds, photoIds }) =>
  call({ action: 'move', op_key: opKey, source_container_id: sourceId, destination_container_id: destinationId, entry_ids: entryIds, photo_ids: photoIds });

export const fetchContentMoves = async (containerId) =>
  (await call({ action: 'history', container_id: containerId })).moves;