/**
 * One photo, two recoverable steps:
 * 1. UploadPrivateFile; keep the URI in memory after success.
 * 2. Register that same URI against the existing StoredProperty group.
 *
 * SDK Base44 Core integration responses are already data-unwrapped, while backend
 * functions may return an axios response with .data. Handle both.
 * Never silently fall back to public UploadFile for client-owned photos.
 */
/**
 * Base44 Core integration endpoint responses can be direct or wrapped by SDK,
 * including {success:true,data:{file_uri:"gs://..."}}. Seek the actual
 * payload even when an outer wrapper already has a success flag.
 */
export function responseData(response) {
  let data=response;
  for(let i=0;i<5&&data&&typeof data==='object';i++) {
    if(typeof data.file_uri==='string' || (data.error && !data.data)) break;
    if(!('data' in data) || data.data==null)break;
    data=data.data;
  }
  return data;
}

/** Private object identities, never public links or temporary signed URLs. */
export function isPrivateStorageUri(value) {
  if(typeof value!=='string'||value.length<9||value.length>1200
    ||/[?#\\\u0000-\u001f]/.test(value)||value.includes('..'))return false;
  return /^private\/[^/]+\/.+/.test(value)
    || /^gs:\/\/[a-zA-Z0-9][a-zA-Z0-9._-]{1,220}\/[^/].+/.test(value);
}

function describeUploadResponse(raw) {
  const obj=raw && typeof raw==='object'?raw:{};
  const data=responseData(raw);
  const keys=Object.keys(obj).slice(0,10).filter(k=>/^[a-zA-Z0-9_]+$/.test(k)).join(',')||'none';
  const innerKeys=data && typeof data==='object'
    ?Object.keys(data).slice(0,10).filter(k=>/^[a-zA-Z0-9_]+$/.test(k)).join(',')
    :'none';
  const u=data?.file_uri;
  const uriFormat=typeof u==='string'
    ?(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(u)?.[0].slice(0,-1)||'relative')
    :'missing';
  return `Private storage response incompatible (fields: ${keys}; payload: ${innerKeys}; URI format: ${uriFormat})`;
}

const safeText=s=>String(s||'').replace(/https?:\/\/\S+/gi,'[URL omitted]').replace(/private\/\S+/gi,'[private path omitted]').slice(0,240);

export function uploadErrorDetail(error,stage) {
  const data=error?.response?.data||error?.data;
  const status=error?.status||error?.response?.status||error?.statusCode;
  const code=error?.code || data?.code;
  let message=data?.error||data?.message||error?.message||'Unknown upload error';
  if(typeof message!=='string')message='Upload service returned an error';
  if(status===413||/too large|file size|exceeds.*size/i.test(message)){
    message='Image is too large for the storage service. Try a smaller photo.';
  }else if(status===401||status===403){
    message='Private photo storage access denied. Sign in again or ask an administrator to check permissions.';
  }else if(status===429){
    message='Storage service is temporarily rate-limiting uploads. Retry shortly.';
  }
  return {
    stage, status:status||null, code:code||null,
    message:safeText(message)||'Unknown upload error',
  };
}

export class StoragePhotoStageError extends Error {
  constructor(stage,original) {
    const info=uploadErrorDetail(original,stage);
    super(info.message);
    this.name='StoragePhotoStageError';
    this.stage=info.stage; this.status=info.status; this.code=info.code;
  }
}

export async function uploadAndRegisterPropertyPhoto({
  file,existingUri,containerId,propertyId,captureBatchId,
  uploadPrivate,invokeProperty,onUploaded,onStage,
}) {
  let uri=existingUri||null;
  if(!uri){
    onStage?.('upload');
    try{
      const raw=await uploadPrivate({file});
      const data=responseData(raw);
      uri=data?.file_uri;
      if(!isPrivateStorageUri(uri)){
        // Do not treat an unexpected public URL as a private-storage success.
        const err=new Error(describeUploadResponse(raw));
        err.code='INVALID_UPLOAD_RESPONSE';
        throw err;
      }
      onUploaded?.(uri);
    }catch(err){throw new StoragePhotoStageError('upload',err);}
  }
  onStage?.('register');
  try{
    const data=responseData(await invokeProperty({
      action:'add_photo',container_id:containerId,property_id:propertyId,
      file_uri:uri,capture_batch_id:captureBatchId,
    }));
    if(!data?.success){
      const err=new Error(data?.error||'Photo registration did not confirm success');
      err.code=data?.code||'REGISTRATION_FAILED';
      throw err;
    }
    return {uri,photo:data.photo||null,idempotent_hit:!!data.idempotent_hit};
  }catch(err){throw new StoragePhotoStageError('register',err);}
}
