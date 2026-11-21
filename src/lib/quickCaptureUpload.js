import { base44 } from "@/api/base44Client";
import { responseData, isPrivateStorageUri, StoragePhotoStageError } from "@/lib/storagePhotoUpload";
import { makeStorageThumbnail } from "@/lib/storageThumbnail";

async function uploadPrivate(file) {
  const uri = responseData(await base44.integrations.Core.UploadPrivateFile({ file }))?.file_uri;
  if (!isPrivateStorageUri(uri)) {
    const err = new Error('Private storage returned an unexpected response');
    err.code = 'INVALID_UPLOAD_RESPONSE';
    throw err;
  }
  return uri;
}

export async function fetchUnsortedPhotoCount(containerId) {
  const data = responseData(await base44.functions.invoke('storageProperty', { action: 'unsorted_summary', container_id: containerId }));
  if (!data?.success) throw new Error(data?.error || 'Unsorted photos unavailable');
  return data.count;
}

/**
 * Uploads one photo's original (unchanged) and its small preview at the same time.
 * `cache` keeps finished steps ({uri, thumbUri}) so a retry never re-uploads either file.
 * A failed preview never blocks the original; the server builds one later.
 */
export async function uploadCaptureFiles({ item, cache }) {
  const original = cache.uri ? Promise.resolve(cache.uri)
    : uploadPrivate(item.file).then((u) => (cache.uri = u)).catch((e) => { throw new StoragePhotoStageError('upload', e); });
  const preview = cache.thumbUri !== undefined ? Promise.resolve(cache.thumbUri)
    : makeStorageThumbnail(item.file).then((t) => (t ? uploadPrivate(t).catch(() => null) : null)).then((u) => (cache.thumbUri = u));
  const [uri, thumbUri] = await Promise.all([original, preview]);
  return { uri, thumbUri };
}

const filePayload = (item, files) => ({
  capture_key: item.key, file_uri: files.uri, thumbnail_uri: files.thumbUri || undefined,
  original_file_name: item.file.name, original_mime_type: item.file.type, original_size_bytes: item.file.size,
});

/** Quick Photos: saves one photo straight to the tote as an unsorted photo. */
export async function saveQuickCapturePhoto({ item, cache, containerId, onStage }) {
  onStage('uploading');
  const files = await uploadCaptureFiles({ item, cache });
  onStage('saving');
  try {
    const data = responseData(await base44.functions.invoke('storageProperty', {
      action: 'add_unsorted_photo', container_id: containerId, capture_batch_id: item.batchId, ...filePayload(item, files),
    }));
    if (!data?.success) throw new Error(data?.error || 'Photo was not confirmed by the server');
    return data.photo;
  } catch (e) {
    throw new StoragePhotoStageError('register', e);
  }
}

/**
 * One step: creates the item (or uses propertyId) and attaches every uploaded photo.
 * Retrying with the same itemKey and capture keys never creates duplicates.
 */
export async function saveCapturedItem({ containerId, itemKey, propertyId, name, batchId, uploads }) {
  try {
    const res = await base44.functions.invoke('storageProperty', {
      action: 'save_item', container_id: containerId, item_key: itemKey, property_id: propertyId || undefined,
      name: name || undefined, capture_batch_id: batchId,
      photos: uploads.map(({ item, files }) => filePayload(item, files)),
    });
    const data = responseData(res);
    if (!data?.success) throw new Error(data?.error || 'Item was not confirmed by the server');
    return data;
  } catch (e) {
    throw new StoragePhotoStageError('register', e);
  }
}