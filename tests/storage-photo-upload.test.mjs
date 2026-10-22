import assert from 'node:assert/strict';
import { test } from 'node:test';
import {uploadAndRegisterPropertyPhoto,responseData,uploadErrorDetail} from '../src/lib/storagePhotoUpload.js';

const input={file:{name:'seat.jpg'},containerId:'container123',propertyId:'property123',captureBatchId:'intake123'};

test('private file upload followed by successful backend record registration',async()=>{
 let count=0;const seen=[];
 const result=await uploadAndRegisterPropertyPhoto({...input,
   uploadPrivate:async()=>{count++;return {file_uri:'private/user123/seat.jpg'}},
   invokeProperty:async data=>{assert.equal(data.file_uri,'private/user123/seat.jpg');return {data:{success:true,photo:{id:'photo1'}}};},
   onStage:stage=>seen.push(stage),
 });
 assert.equal(count,1);assert.equal(result.uri,'private/user123/seat.jpg');
 assert.deepEqual(seen,['upload','register']);assert.equal(result.photo.id,'photo1');
});

test('register-only retry reuses prior private file URI',async()=>{
 let uploads=0;const registered=[];
 const result=await uploadAndRegisterPropertyPhoto({...input,
   existingUri:'private/user123/existing.jpg',
   uploadPrivate:async()=>{uploads++;throw Error('should not upload again')},
   invokeProperty:async payload=>{registered.push(payload);return {success:true,idempotent_hit:true}},
 });
 assert.equal(uploads,0);assert.equal(registered.length,1);
 assert.equal(result.idempotent_hit,true);
});

test('Core response may be nested; still read private URI',async()=>{
 assert.equal(responseData({data:{file_uri:'private/file.jpeg'}}).file_uri,'private/file.jpeg');
 assert.equal(responseData({data:{data:{file_uri:'private/file.jpeg'}}}).file_uri,'private/file.jpeg');
 const result=await uploadAndRegisterPropertyPhoto({...input,
   uploadPrivate:async()=>({data:{file_uri:'private/file.jpeg'}}),
   invokeProperty:async()=>({data:{success:true}}),
 });
 assert.equal(result.uri,'private/file.jpeg');
});

test('upload failure identifies correct stage and status without calling registration',async()=>{
 let attempts=0;
 await assert.rejects(()=>uploadAndRegisterPropertyPhoto({...input,
   uploadPrivate:async()=>{const e=new Error('Entity too large');e.status=413;throw e},
   invokeProperty:async()=>{attempts++;},
 }),err=>{assert.equal(err.stage,'upload');assert.equal(err.status,413);return true});
 assert.equal(attempts,0);
});

test('backend registration failure preserves upload URI for retry',async()=>{
 let uri;let uploads=0;
 await assert.rejects(()=>uploadAndRegisterPropertyPhoto({...input,
   uploadPrivate:async()=>{uploads++;return {file_uri:'private/a/seat.jpg'}},
   onUploaded:v=>{uri=v},
   invokeProperty:async()=>({data:{success:false,error:'Registration unavailable'}}),
 }),err=>{assert.equal(err.stage,'register');assert.match(err.message,/Registration unavailable/);return true});
 assert.equal(uri,'private/a/seat.jpg');
 const retry=await uploadAndRegisterPropertyPhoto({...input,existingUri:uri,
   uploadPrivate:async()=>{uploads++;throw Error('second upload forbidden')},
   invokeProperty:async()=>({success:true}),
 });
 assert.equal(uploads,1);assert.equal(retry.uri,uri);
});

test('errors redact private file paths and public URLs',()=>{
 const info=uploadErrorDetail({message:'failed private/user123/secret-file.jpg at https://example.org?token=x'},'register');
 assert.ok(!info.message.includes('secret-file'));assert.ok(!info.message.includes('token=x'));
});
