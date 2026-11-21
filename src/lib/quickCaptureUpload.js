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
 * Saves one quick-capture photo as an unsorted photo on the container.
 * `cache` holds finished steps ({uri, thumbUri}) so a retry never re-uploads the original.
 * The original file is uploaded unchanged; the preview is a separate file.
 */
export async function saveQuickCapturePhoto({ item, cache, containerId, onStage }) {
  if (!cache.uri) {
    onStage('uploading');
    try { cache.uri = await uploadPrivate(item.file); }
    catch (e) { throw new StoragePhotoStageError('upload', e); }
  }
  if (cache.thumbUri === undefined) {
    onStage('preview');
    const thumb = await makeStorageThumbnail(item.file);
    cache.thumbUri = thumb ? await uploadPrivate(thumb).catch(() => null) : null;
  }
  onStage('saving');
  try {
    const data = responseData(await base44.functions.invoke('storageProperty', {
      action: 'add_unsorted_photo', container_id: containerId,
      capture_key: item.key, capture_batch_id: item.batchId,
      file_uri: cache.uri, thumbnail_uri: cache.thumbUri || undefined,
      original_file_name: item.file.name, original_mime_type: item.file.type, original_size_bytes: item.file.size,
    }));
    if (!data?.success) throw new Error(data?.error || 'Photo was not confirmed by the server');
    return data.photo;
  } catch (e) {
    throw new StoragePhotoStageError('register', e);
  }
}