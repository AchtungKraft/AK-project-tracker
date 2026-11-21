import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { Image } from 'npm:imagescript@1.3.0';

/* ── Phase C read model: one unified, paged photo collection per tote ──
   Unsorted photos (no content entry) + photos of the tote's active content entries.
   Only the requested page is signed; originals are signed only on demand. */
const GRID_FILTERS = new Set(['all','unsorted','identified']);
const sortKey = (p) => `${p.captured_at || p.created_date || ''}|${p.id}`;

/** Active entries + every active photo of this tote, each photo exactly once, newest first. */
async function loadTote(db, container) {
  const groups = (await db.entities.StoredProperty.filter({ container_id: container.id }, '-created_date', 500))
    .filter((g) => g.status === 'in_storage');
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const [boxRows, groupRows] = await Promise.all([
    db.entities.StoredPropertyPhoto.filter({ container_id: container.id, archived: false }, '-created_date', 5000),
    groups.length ? db.entities.StoredPropertyPhoto.filter({ stored_property_id: { $in: [...groupById.keys()] }, archived: false }, '-created_date', 5000) : [],
  ]);
  // Exactly once: dedupe by id; photos of inactive entries are excluded.
  const byId = new Map();
  for (const p of [...boxRows, ...groupRows]) {
    if (p.archived) continue;
    if (p.stored_property_id && !groupById.has(p.stored_property_id)) continue;
    byId.set(p.id, p);
  }
  const all = [...byId.values()].sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));
  const perGroup = new Map();
  for (const p of all) if (p.stored_property_id) {
    if (!perGroup.has(p.stored_property_id)) perGroup.set(p.stored_property_id, []);
    perGroup.get(p.stored_property_id).push(p);
  }
  const groupPos = new Map();
  for (const list of perGroup.values()) {
    list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.created_date).localeCompare(String(b.created_date)));
    list.forEach((p, i) => groupPos.set(p.id, [i + 1, list.length]));
  }
  const isIdentified = (p) => !!groupById.get(p.stored_property_id)?.catalog_part_id;
  const counts = {
    photos: all.length, unsorted_photos: all.filter((p) => !p.stored_property_id).length,
    identified_photos: all.filter(isIdentified).length,
    entries: groups.length, identified_entries: groups.filter((g) => g.catalog_part_id).length,
  };
  counts.items = counts.entries + counts.unsorted_photos;
  return { groups, groupById, all, perGroup, groupPos, isIdentified, counts };
}

async function partNames(db, groups) {
  const ids = [...new Set(groups.map((g) => g?.catalog_part_id).filter(Boolean))];
  const parts = ids.length ? await db.entities.Part.filter({ id: { $in: ids } }) : [];
  return new Map(parts.map((p) => [p.id, p.part_name || p.vendor_part_number || null]));
}

async function signThumbs(db, photos) {
  const sign = async (p) => {
    if (!p?.thumbnail_uri) return null;
    try { return (await db.integrations.Core.CreateFileSignedUrl({ file_uri: p.thumbnail_uri, expires_in: 3600 })).signed_url; } catch (_) { return null; }
  };
  const out = [];
  for (let i = 0; i < photos.length; i += 6) out.push(...await Promise.all(photos.slice(i, i + 6).map(sign)));
  return out;
}

function formatPhoto(p, t, partName, thumb) {
  const g = t.groupById.get(p.stored_property_id);
  const [idx, size] = t.groupPos.get(p.id) || [null, null];
  return {
    id: p.id, group_id: g?.id || null, group_name: g?.name || null,
    group_quantity: g?.quantity_known ? g.quantity : null, group_description: g?.description || null,
    identified: !!g?.catalog_part_id, part_name: g?.catalog_part_id ? partName.get(g.catalog_part_id) || null : null,
    inventory_linked: !!g?.converted_inventory_item_id,
    group_index: idx, group_size: size, caption: p.caption || null,
    captured_at: p.captured_at || p.created_date || null, thumb_url: thumb,
    needs_preview: !p.thumbnail_uri && !p.thumbnail_unavailable, preview_unavailable: !!p.thumbnail_unavailable,
  };
}

async function listTotePhotos(db, container, body) {
  const t = await loadTote(db, container);
  // One item's photos, in item order (used by the item detail screen).
  if (body.filter === 'entry') {
    if (!idOk(body.entry_id) || !t.groupById.has(body.entry_id)) return { success: false, error: 'That item is no longer in this tote', status: 404 };
    const page = (t.perGroup.get(body.entry_id) || []).slice(0, 200);
    const [names, thumbs] = await Promise.all([partNames(db, [t.groupById.get(body.entry_id)]), signThumbs(db, page)]);
    return { success: true, filter: 'entry', photos: page.map((p, i) => formatPhoto(p, t, names, thumbs[i])), next_cursor: null, filtered_total: page.length, counts: t.counts };
  }
  const filter = GRID_FILTERS.has(body.filter) ? body.filter : 'all';
  const limit = Math.min(Math.max(parseInt(body.limit) || 30, 1), 60);
  const cursor = typeof body.cursor === 'string' ? body.cursor.slice(0, 200) : null;
  const matches = filter === 'unsorted' ? t.all.filter((p) => !p.stored_property_id)
    : filter === 'identified' ? t.all.filter(t.isIdentified) : t.all;
  const start = cursor ? matches.findIndex((p) => sortKey(p) < cursor) : 0;
  const page = start < 0 ? [] : matches.slice(start, start + limit);
  const [names, thumbs] = await Promise.all([partNames(db, page.map((p) => t.groupById.get(p.stored_property_id))), signThumbs(db, page)]);
  const photos = page.map((p, i) => formatPhoto(p, t, names, thumbs[i]));
  const last = page[page.length - 1];
  const more = start >= 0 && start + limit < matches.length;
  return { success: true, filter, photos, next_cursor: more && last ? sortKey(last) : null, filtered_total: matches.length, counts: t.counts };
}

/* ── Phase E.1 contents read model: one entry per physical thing in the tote ──
   Each active content entry is ONE item (cover = its first photo); each unsorted photo is one item. */
async function listToteContents(db, container, body) {
  const t = await loadTote(db, container);
  const limit = Math.min(Math.max(parseInt(body.limit) || 30, 1), 60);
  const cursor = typeof body.cursor === 'string' ? body.cursor.slice(0, 200) : null;
  const items = [
    ...t.groups.map((g) => {
      const photos = t.perGroup.get(g.id) || [];
      const newest = photos.reduce((m, p) => { const k = p.captured_at || p.created_date || ''; return k > m ? k : m; }, g.created_date || '');
      return { kind: 'entry', id: g.id, g, cover: photos[0] || null, photo_count: photos.length, key: `${newest}|${g.id}` };
    }),
    ...t.all.filter((p) => !p.stored_property_id).map((p) => ({ kind: 'photo', id: p.id, cover: p, photo_count: 1, key: sortKey(p) })),
  ].sort((a, b) => (a.key < b.key ? 1 : -1));
  const start = cursor ? items.findIndex((i) => i.key < cursor) : 0;
  const page = start < 0 ? [] : items.slice(start, start + limit);
  const [names, thumbs] = await Promise.all([partNames(db, page.map((i) => i.g)), signThumbs(db, page.map((i) => i.cover))]);
  const out = page.map((i, n) => {
    const cover = i.cover ? formatPhoto(i.cover, t, names, thumbs[n]) : null;
    if (i.kind === 'photo') return { kind: 'photo', id: i.id, photo_count: 1, cover };
    const g = i.g;
    return {
      kind: 'entry', id: g.id, name: g.name, photo_count: i.photo_count, cover,
      quantity: g.quantity_known ? g.quantity : null, description: g.description || null, notes: g.notes || null,
      identified: !!g.catalog_part_id, part_name: g.catalog_part_id ? names.get(g.catalog_part_id) || 'Catalog part' : null,
      inventory_linked: !!g.converted_inventory_item_id,
    };
  });
  const last = page[page.length - 1];
  const more = start >= 0 && start + limit < items.length;
  return { success: true, items: out, next_cursor: more && last ? last.key : null, total: items.length, counts: t.counts };
}

/** Reads the EXIF orientation tag of a JPEG (1 when absent). */
function exifOrientation(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let o = 2;
  while (o + 10 < b.length) {
    if (b[o] !== 0xff) return 1;
    const marker = b[o + 1], len = (b[o + 2] << 8) | b[o + 3];
    if (marker === 0xe1 && b[o + 4] === 0x45 && b[o + 5] === 0x78 && b[o + 6] === 0x69 && b[o + 7] === 0x66) {
      const t = o + 10, le = b[t] === 0x49;
      const u16 = (p) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
      const u32 = (p) => (le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === 0x0112) return u16(e + 8); }
      return 1;
    }
    if (marker === 0xda) return 1;
    o += 2 + len;
  }
  return 1;
}

/** Pixel-exact rotation for EXIF orientations 3, 6, 8. */
function orient(img, o) {
  if (![3, 6, 8].includes(o)) return img;
  const w = img.width, h = img.height;
  const out = o === 3 ? new Image(w, h) : new Image(h, w);
  const s = img.bitmap, d = out.bitmap, W = out.width;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = o === 3 ? w - 1 - x : o === 6 ? h - 1 - y : y;
    const dy = o === 3 ? h - 1 - y : o === 6 ? x : w - 1 - x;
    const si = (y * w + x) * 4, di = (dy * W + dx) * 4;
    d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
  }
  return out;
}

/** HEIF/HEIC brands in the ISO-BMFF ftyp box. */
function isHeic(b) {
  if (b.length < 12 || String.fromCharCode(b[4], b[5], b[6], b[7]) !== 'ftyp') return false;
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(String.fromCharCode(b[8], b[9], b[10], b[11]));
}

/** Decodes HEIC with libheif (loaded only when a HEIC original is seen). */
async function decodeHeic(bytes) {
  const { default: decode } = await import('npm:heic-decode@2.0.0');
  const { width, height, data } = await decode({ buffer: bytes });
  const img = new Image(width, height);
  img.bitmap.set(data);
  return img;
}

/** Builds a missing ~480px preview from the original. The original is never modified. */
async function makePreview(db, req, photo) {
  const sign = async (uri, s) => (await db.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: s })).signed_url;
  if (photo.thumbnail_uri) return { success: true, thumb_url: await sign(photo.thumbnail_uri, 3600) };
  if (photo.thumbnail_unavailable) return { success: true, unavailable: true };
  // Bounded retries: transient failures are counted; after 3 the placeholder becomes permanent.
  const transient = async (error) => {
    const attempts = (photo.preview_attempts || 0) + 1;
    await db.entities.StoredPropertyPhoto.update(photo.id, attempts >= 3 ? { preview_attempts: attempts, thumbnail_unavailable: true } : { preview_attempts: attempts });
    return attempts >= 3 ? { success: true, unavailable: true } : { success: false, error };
  };
  let bytes;
  try {
    const res = await fetch(await sign(photo.file_uri, 120), { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return await transient('Original unavailable');
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (_e) { return await transient('Original could not be read'); }
  let thumb;
  try {
    if (bytes.length > 30 * 1024 * 1024) throw new Error('too large');
    let img, rotate = true;
    try { img = await Image.decode(bytes); } catch (e) {
      if (!isHeic(bytes)) throw e;
      img = await decodeHeic(bytes);  // libheif already applies the stored rotation
      rotate = false;
    }
    const scale = Math.min(1, 480 / Math.max(img.width, img.height));
    img = img.resize(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
    thumb = await (rotate ? orient(img, exifOrientation(bytes)) : img).encodeJPEG(75);
  } catch (_e) {
    await db.entities.StoredPropertyPhoto.update(photo.id, { thumbnail_unavailable: true });
    return { success: true, unavailable: true };
  }
  const base = (photo.original_file_name || 'photo').replace(/\.[^.]+$/, '').slice(0, 80);
  // Platform limitation: the SDK's server-side file upload leaves the worker unable to make
  // further calls, so the same private upload endpoint is called directly with fetch.
  const uri = await uploadPrivateDirect(req, new File([thumb], `${base}-thumb.jpg`, { type: 'image/jpeg' })).catch(() => null);
  if (!uri) return await transient('Preview upload failed');
  await db.entities.StoredPropertyPhoto.update(photo.id, { thumbnail_uri: uri });
  return { success: true, generated: true, thumb_url: await sign(uri, 3600) };
}

async function uploadPrivateDirect(req, file) {
  const h = (n) => req.headers.get(n);
  const api = h('Base44-Api-Url') || 'https://base44.app', appId = h('Base44-App-Id');
  const headers = { 'X-App-Id': appId, Authorization: h('Base44-Service-Authorization') };
  if (h('Authorization')) headers['on-behalf-of'] = h('Authorization');
  if (h('Base44-State')) headers['Base44-State'] = h('Base44-State');
  if (['dev', 'prod'].includes(h('X-Data-Env'))) headers['X-Data-Env'] = h('X-Data-Env');
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch(`${api}/api/apps/${appId}/integration-endpoints/Core/UploadPrivateFile`, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(30000) });
  const data = await res.json().catch(() => null);
  return res.ok ? data?.file_uri || null : null;
}

/**
 * Photo-first physical property: intentionally separate from Part / InventoryItem.
 * Staff-only signed-photo reads; client/public views are NOT supported here.
 * All ownership, container and project values are taken from DB, never caller-controlled.
 */
const respond = (data, status=200) => Response.json(data, {status});
const TYPES = new Set(['unidentified','miscellaneous','take_off','client_supplied','spare','other']);
const CONDITIONS = new Set(['unknown','new','used','damaged','mixed']);
const safeText=(s,n)=>typeof s==='string' ? s.trim().slice(0,n) : '';
const idOk=(s)=>typeof s==='string'&&/^[a-zA-Z0-9_-]{12,120}$/.test(s);
// Base44 UploadPrivateFile can return opaque relative object identifiers in
// addition to gs:// and private/ URIs. A syntax check alone does NOT prove privacy.
// Every new URI is verified using the private CreateFileSignedUrl integration
// below, before saving a StoredPropertyPhoto record.
const photoUri=(s)=>{
  if(typeof s!=='string'||s.length<3||s.length>2048||
     /[?#\\\u0000-\u001f]/.test(s)||s.includes('..')||s.startsWith('//'))return false;
  if(/^gs:\/\/[a-zA-Z0-9][a-zA-Z0-9._-]{1,220}\/[^/].+/.test(s))return true;
  if(/^[a-z][a-z\d+.-]*:/i.test(s))return false;
  return /^\/?[a-zA-Z0-9][a-zA-Z0-9_./% +@=-]*$/.test(s);
};
const trimPhoto=(p)=>({id:p.id,stored_property_id:p.stored_property_id??null,container_id:p.container_id,capture_key:p.capture_key||null,has_thumbnail:!!p.thumbnail_uri,sort_order:p.sort_order,caption:p.caption,captured_at:p.captured_at});

Deno.serve(async (req)=>{
  try {
    if(req.method!=='POST') return respond({error:'Method not allowed'},405);
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(!user) return respond({error:'Unauthenticated'},401);
    const db=base44.asServiceRole;
    let staff=user.role==='admin';
    if(!staff){
      const members=await db.entities.TeamMember.filter({user_id:user.id});
      staff=members.some(m=>m.is_achtung_kraft_member===true&&m.active!==false);
    }
    if(!staff) return respond({error:'AK staff only'},403);
    const body=await req.json();
    const action=body?.action;
    if(!['list_container','create_group','add_photo','get_photos','update_group','find_by_part','add_unsorted_photo','unsorted_summary','list_photos','list_contents','photo_original','make_preview'].includes(action)){
      return respond({error:'Unsupported storage property operation'},400);
    }

    if(action==='photo_original'||action==='make_preview'){
      if(!idOk(body.photo_id)) return respond({error:'Valid photo_id required'},400);
      const [photo]=await db.entities.StoredPropertyPhoto.filter({id:body.photo_id});
      if(!photo||photo.archived) return respond({error:'Photo not found'},404);
      if(action==='make_preview') return respond(await makePreview(db,req,photo));
      const signed=await db.integrations.Core.CreateFileSignedUrl({file_uri:photo.file_uri,expires_in:900});
      return respond({success:true,photo_id:photo.id,signed_url:signed.signed_url});
    }

    if(action==='find_by_part'){
      const id=body.part_id;
      if(!idOk(id)) return respond({error:'Invalid part ID'},400);
      const items=await db.entities.StoredProperty.filter({catalog_part_id:id,status:'in_storage'},'-created_date',100);
      // Location is derived from the CURRENT container location.
      const containerIds=[...new Set(items.map(i=>i.container_id).filter(Boolean))];
      const containers=await Promise.all(containerIds.map(async cid=>(await db.entities.StorageContainer.filter({id:cid}))[0]));
      const byId=new Map(containers.filter(Boolean).map(c=>[c.id,c]));
      const idsFor=(field)=>[...new Set(items.map(i=>i[field]).filter(Boolean))];
      let projects=[],clients=[];
      try{
        const results=await Promise.all([
          idsFor('project_id').length?db.entities.Project.filter({id:{$in:idsFor('project_id')}}):[],
          idsFor('client_account_id').length?db.entities.ClientAccount.filter({id:{$in:idsFor('client_account_id')}}):[],
        ]);
        projects=results[0]||[];
        clients=results[1]||[];
      }catch(_){ /* preserve successful property lookup even if display-name enrichment fails */ }
      const projectNames=new Map(projects.map(p=>[p.id,p.name]));
      const clientNames=new Map(clients.map(c=>[c.id,c.name]));
      return respond({success:true,items:items.map(i=>({
        id:i.id,name:i.name,property_type:i.property_type,condition:i.condition,
        quantity_known:i.quantity_known,quantity:i.quantity,ownership_type:i.ownership_type,
        client_account_id:i.client_account_id,client_name:clientNames.get(i.client_account_id)||null,
        project_id:i.project_id,project_name:projectNames.get(i.project_id)||null,
        container_id:i.container_id,container_name:byId.get(i.container_id)?.name,
        container_code:byId.get(i.container_id)?.short_code,
        location_id:byId.get(i.container_id)?.location_id||i.location_id||null,
      }))});
    }

    const containerId=body.container_id;
    const propertyId=body.property_id;
    if(action==='get_photos'){
      if(!idOk(propertyId)) return respond({error:'Valid property_id required'},400);
      const [item]=await db.entities.StoredProperty.filter({id:propertyId});
      if(!item) return respond({error:'Property not found'},404);
      const all=await db.entities.StoredPropertyPhoto.filter({stored_property_id:propertyId,archived:false},'sort_order',100);
      const results=[];
      for(const p of all){
        try{
          const signed=await db.integrations.Core.CreateFileSignedUrl({file_uri:p.file_uri,expires_in:600});
          results.push({...trimPhoto(p),signed_url:signed.signed_url});
        }catch(_e){results.push({...trimPhoto(p),error:'Image unavailable'})}
      }
      return respond({success:true,photos:results});
    }
    if(!idOk(containerId)) return respond({error:'Valid container_id required'},400);
    const [container]=await db.entities.StorageContainer.filter({id:containerId});
    if(!container||container.active===false||container.status==='archived'||container.status==='reserved'){
      return respond({error:'Active container not found'},404);
    }

    if(action==='list_photos'){ const r=await listTotePhotos(db,container,body); return respond(r,r.status||200); }
    if(action==='list_contents') return respond(await listToteContents(db,container,body));

    if(action==='unsorted_summary'){
      const rows=await db.entities.StoredPropertyPhoto.filter({container_id:container.id,archived:false},'-created_date',2000);
      return respond({success:true,container_id:container.id,count:rows.filter(r=>!r.stored_property_id).length});
    }

    if(action==='add_unsorted_photo'){
      // Quick capture: one photo saved directly to the box, no content entry, no inventory.
      const key=body.capture_key;
      if(!idOk(key)) return respond({error:'Stable capture_key required'},400);
      const existingKey=await db.entities.StoredPropertyPhoto.filter({container_id:container.id,capture_key:key},'created_date',5);
      if(existingKey.length) return respond({success:true,idempotent_hit:true,photo:trimPhoto(existingKey[0])});
      const uri=body.file_uri;
      if(!photoUri(uri)) return respond({error:'Invalid private file reference format (public URLs are not accepted)'},400);
      const verified=async(u)=>{
        try{
          const s=await db.integrations.Core.CreateFileSignedUrl({file_uri:u,expires_in:60});
          return typeof s?.signed_url==='string'&&s.signed_url.startsWith('https://');
        }catch(_){return false}
      };
      if(!await verified(uri)) return respond({error:'Private storage could not verify this photo reference',code:'PRIVATE_URI_NOT_VERIFIED'},422);
      // Preview is optional: an unverifiable thumbnail is dropped, never blocks the original.
      const thumb=body.thumbnail_uri;
      const thumbnailUri=(photoUri(thumb)&&thumb!==uri&&await verified(thumb))?thumb:null;
      const size=Number(body.original_size_bytes);
      const created=await db.entities.StoredPropertyPhoto.create({
        stored_property_id:null,container_id:container.id,file_uri:uri,thumbnail_uri:thumbnailUri,
        capture_key:key,capture_batch_id:safeText(body.capture_batch_id,100)||key,
        original_file_name:safeText(body.original_file_name,200)||null,
        original_mime_type:safeText(body.original_mime_type,100)||null,
        original_size_bytes:Number.isFinite(size)&&size>0?size:null,
        sort_order:0,captured_by:user.id,captured_at:new Date().toISOString(),archived:false,
      });
      // No unique constraint is available: detect a concurrent retry and keep only the oldest record.
      const same=await db.entities.StoredPropertyPhoto.filter({container_id:container.id,capture_key:key},'created_date',10);
      if(same.length>1&&same[0].id!==created.id){
        await db.entities.StoredPropertyPhoto.delete(created.id);
        return respond({success:true,idempotent_hit:true,photo:trimPhoto(same[0])});
      }
      return respond({success:true,photo:trimPhoto(created)});
    }

    if(action==='list_container'){
      const items=await db.entities.StoredProperty.filter({container_id:container.id},'-created_date',150);
      const photoRows=await db.entities.StoredPropertyPhoto.filter({container_id:container.id,archived:false},'-created_date',500);
      const counts={};
      for(const photo of photoRows) counts[photo.stored_property_id]=(counts[photo.stored_property_id]||0)+1;
      return respond({success:true,container_id:container.id,
        items:items.map(item=>({...item,photo_count:counts[item.id]||0})),
      });
    }

    if(action==='create_group'){
      const name=safeText(body.name,150)||'Unidentified contents';
      const intakeKey=body.intake_key;
      if(!idOk(intakeKey)) return respond({error:'Stable intake_key required'},400);
      const prior=await db.entities.StoredProperty.filter({intake_key:intakeKey,container_id:container.id});
      if(prior.length) return respond({success:true,idempotent_hit:true,item:prior[0]});
      const propertyType=TYPES.has(body.property_type)?body.property_type:'unidentified';
      const condition=CONDITIONS.has(body.condition)?body.condition:'unknown';
      const q=body.quantity;
      const qtyKnown=body.quantity_known===true;
      if(qtyKnown&&(!Number.isFinite(q)||q<=0||q>99999)) return respond({error:'Quantity must be positive'},400);
      const record=await db.entities.StoredProperty.create({
        intake_key:intakeKey,name,property_type:propertyType,
        ownership_type:container.client_account_id?'client':'unknown',
        client_account_id:container.client_account_id||null,
        project_id:container.project_id||null,
        container_id:container.id,location_id:null,
        quantity_known:qtyKnown,quantity:qtyKnown?q:null,condition,
        status:'in_storage',description:safeText(body.description,1200),
        notes:safeText(body.notes,1200),created_by:user.id,last_updated_by:user.id,
      });
      try {
        await db.entities.StorageCustodyEvent.create({
          action_key:'property_intake_'+record.id,event_type:'intake',
          stored_property_id:record.id,container_id:container.id,
          to_location_id:container.location_id||null,
          client_account_id:container.client_account_id||null,project_id:container.project_id||null,
          performed_by:user.id,performed_at:new Date().toISOString(),
          notes:'Recorded client property without an inventory mutation',
        });
      }catch(_err){ /* Item is persisted; a future audit can reconcile missing event */ }
      return respond({success:true,item:record});
    }

    if(action==='add_photo'){
      if(!idOk(propertyId)) return respond({error:'property_id required'},400);
      const [item]=await db.entities.StoredProperty.filter({id:propertyId,container_id:container.id});
      if(!item||item.status!=='in_storage') return respond({error:'Property is not in this box'},409);
      const uri=body.file_uri;
      if(!photoUri(uri)) return respond({error:'Invalid private file reference format (public URLs are not accepted)'},400);
      const existing=await db.entities.StoredPropertyPhoto.filter({stored_property_id:item.id,file_uri:uri});
      if(existing.length) return respond({success:true,idempotent_hit:true,photo:trimPhoto(existing[0])});
      // Critical privacy boundary: never assume a relative URI proves a file
      // is private. Only persist a file that Base44 can sign as private.
      try {
        const signed=await db.integrations.Core.CreateFileSignedUrl({file_uri:uri,expires_in:60});
        if(typeof signed?.signed_url!=='string'||!signed.signed_url.startsWith('https://')){
          return respond({error:'Private storage could not verify this photo reference',code:'PRIVATE_URI_NOT_VERIFIED'},422);
        }
      }catch(_error){
        return respond({error:'Private storage could not verify this photo reference',code:'PRIVATE_URI_NOT_VERIFIED'},422);
      }
      const total=await db.entities.StoredPropertyPhoto.filter({stored_property_id:item.id},'-created_date',100);
      if(total.length>=100) return respond({error:'100 photo limit for a group'},409);
      const photo=await db.entities.StoredPropertyPhoto.create({
        stored_property_id:item.id,container_id:container.id,
        file_uri:uri,capture_batch_id:safeText(body.capture_batch_id,100)||item.intake_key,
        sort_order:total.length,caption:safeText(body.caption,200),
        captured_by:user.id,captured_at:new Date().toISOString(),archived:false,
      });
      return respond({success:true,photo:trimPhoto(photo)});
    }

    if(action==='update_group'){
      if(!idOk(propertyId)) return respond({error:'property_id required'},400);
      const [item]=await db.entities.StoredProperty.filter({id:propertyId,container_id:container.id});
      if(!item||item.status!=='in_storage') return respond({error:'Property is not available in this container'},409);
      const patch={last_updated_by:user.id};
      if(body.name!==undefined){
        const name=safeText(body.name,150);
        if(!name) return respond({error:'Name required'},400);
        patch.name=name;
      }
      if(body.description!==undefined)patch.description=safeText(body.description,1200);
      if(body.notes!==undefined)patch.notes=safeText(body.notes,1200);
      if(body.condition!==undefined){
        if(!CONDITIONS.has(body.condition))return respond({error:'Invalid condition'},400);
        patch.condition=body.condition;
      }
      if(body.quantity_known!==undefined){
        if(typeof body.quantity_known!=='boolean')return respond({error:'Invalid quantity_known'},400);
        if(body.quantity_known){
          if(!Number.isFinite(body.quantity)||body.quantity<=0||body.quantity>99999){
            return respond({error:'Quantity must be a positive number'},400);
          }
          patch.quantity_known=true;patch.quantity=body.quantity;
        }else{
          patch.quantity_known=false;patch.quantity=null;
        }
      }
      if(body.property_type!==undefined){
        if(!TYPES.has(body.property_type))return respond({error:'Invalid type'},400);
        patch.property_type=body.property_type;
      }
      if(body.catalog_part_id!==undefined){
        if(body.catalog_part_id===null||body.catalog_part_id===''){
          patch.catalog_part_id=null;
        }else{
          if(!idOk(body.catalog_part_id))return respond({error:'Invalid Part ID'},400);
          const [part]=await db.entities.Part.filter({id:body.catalog_part_id});
          if(!part) return respond({error:'Catalog Part not found'},404);
          patch.catalog_part_id=part.id;
        }
      }
      const updated=await db.entities.StoredProperty.update(item.id,patch);
      if(body.catalog_part_id!==undefined&&item.catalog_part_id!==updated.catalog_part_id){
        try{
          await db.entities.StorageCustodyEvent.create({
            event_type:updated.catalog_part_id?'link_catalog':'unlink_catalog',
            stored_property_id:item.id,container_id:container.id,
            project_id:container.project_id||null,
            client_account_id:container.client_account_id||null,
            performed_by:user.id,performed_at:new Date().toISOString(),
            action_key:'property_link_'+item.id+'_'+Date.now(),
            details:{before:item.catalog_part_id||null,after:updated.catalog_part_id||null},
          });
        }catch(_){}
      }
      return respond({success:true,item:updated});
    }
    return respond({error:'Unsupported operation'},400);
  }catch(error){
    return respond({error:error?.message||'Property storage service error'},500);
  }
});