/**
 * One photo, two recoverable steps:
 * 1. UploadPrivateFile; keep the URI in memory after success.
 * 2. Register that same URI against the existing StoredProperty group.
 *
 * SDK Base44 Core integration responses are already data-unwrapped, while backend
 * functions may return an axios response with .data. Handle both.
 * Never silently fall back to public UploadFile for client-owned photos.
 */
export function responseData(response) {
  let data=response;
  for(let i=0;i<3&&data&&typeof data==='object'&&'data' in data;i++) {
    if(data.file_uri||data.success!==undefined||data.error!==undefined)break;
    data=data.data;
  }
  return data;
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
      if(typeof uri!=='string'||!uri.startsWith('private/')){
        const err=new Error('Private upload returned no usable private file URI');
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
