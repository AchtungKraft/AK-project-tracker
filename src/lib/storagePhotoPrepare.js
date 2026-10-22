/**
 * Client-side optimization for unusually large camera files, keeping shop detail
 * adequate for identification. Normal-sized photos are untouched.
 * This is best-effort: decode/compress failures fall back to the original File.
 */
const MAX_DIRECT_BYTES = 6 * 1024 * 1024;
const MAX_EDGE = 2600;
export async function prepareStoragePhotoFile(file) {
  if (!file || file.size <= MAX_DIRECT_BYTES || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type||'')) {
    return file;
  }
  if (typeof document === 'undefined' || typeof File === 'undefined') return file;
  try {
    let bitmap;
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(file);
    let width=bitmap?.width, height=bitmap?.height;
    let image;
    let objectUrl;
    if (!bitmap) {
      objectUrl=URL.createObjectURL(file);
      image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=objectUrl;});
      width=image.naturalWidth;height=image.naturalHeight;
    }
    if (!(width>0 && height>0)) return file;
    const scale=Math.min(1,MAX_EDGE/Math.max(width,height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));
    canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap||image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));
    bitmap?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    canvas.width=0;canvas.height=0;
    if (!blob || blob.size>=file.size) return file;
    const basename=file.name?.replace(/\.[^.]+$/,'')||'stored-property';
    return new File([blob],basename+'.jpg',{type:'image/jpeg',lastModified:file.lastModified||Date.now()});
  } catch (_err) {
    return file; // do not lose the customer's original photograph
  }
}
