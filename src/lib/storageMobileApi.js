import { base44 } from "@/api/base44Client";

/** Staff-only, read-only Storage Mobile service. Throws with the server's message. */
export async function storageMobile(action, params = {}) {
  let res;
  try {
    res = await base44.functions.invoke('storageMobile', { action, ...params });
  } catch (e) {
    throw new Error(e?.response?.data?.error || e?.message || 'Storage is unavailable');
  }
  if (res?.data?.error) throw new Error(res.data.error);
  return res.data;
}

/** Recent totes live on the signed-in user's own record (private to them). */
export async function rememberTote(containerId) {
  const me = await base44.auth.me();
  const prev = Array.isArray(me?.storage_recent_containers) ? me.storage_recent_containers : [];
  if (prev[0] === containerId) return false;
  await base44.auth.updateMe({ storage_recent_containers: [containerId, ...prev.filter((id) => id !== containerId)].slice(0, 8) });
  return true;
}

export const toteUrl = (id, act) => `/storage/tote?id=${encodeURIComponent(id)}${act ? `&do=${act}` : ''}`;
export const findUrl = (act) => `/storage/find${act ? `?do=${act}` : ''}`;