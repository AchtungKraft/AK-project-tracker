import { base44 } from "@/api/base44Client";

/** Tote photo organizing. Only content relationships change; files and inventory are never touched. */
const call = async (fn, payload) => {
  try {
    const res = await base44.functions.invoke(fn, payload);
    const data = res?.data || res;
    if (!data?.success) throw new Error(data?.error || 'Organizing service unavailable');
    return data;
  } catch (e) {
    throw new Error(e?.response?.data?.error || e.message);
  }
};

/** One key per user intent: a retried request resumes instead of repeating. */
export const newOpKey = () => `op${crypto.randomUUID().replace(/-/g, '')}`;

export const organizePhotos = (containerId, payload) =>
  call('storagePhotoOrganize', { action: 'organize', container_id: containerId, ...payload });

export const undoOrganize = (containerId, eventId) =>
  call('storagePhotoOrganize', { action: 'undo', container_id: containerId, event_id: eventId });

export const fetchLastOrganize = async (containerId) =>
  (await call('storagePhotoOrganize', { action: 'last_operation', container_id: containerId })).operation;

export const searchCatalogParts = async (query) =>
  (await call('storagePhotoOrganize', { action: 'search_parts', query })).parts;

/** Canonical content entry update (details or catalog identification). */
export const updateEntry = (containerId, propertyId, patch) =>
  call('storageProperty', { action: 'update_group', container_id: containerId, property_id: propertyId, ...patch });