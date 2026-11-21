/**
 * Builds a small JPEG preview for the photo grid. The original File is never changed.
 * Returns null when the browser cannot decode the image (the original still uploads).
 */
const EDGE = 480;
export async function makeStorageThumbnail(file) {
  if (typeof document === 'undefined' || !file) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!(w > 0 && h > 0)) return null;
    const scale = Math.min(1, EDGE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
    canvas.width = 0; canvas.height = 0;
    if (!blob) return null;
    const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}-thumb.jpg`, { type: 'image/jpeg' });
  } catch (_e) {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}