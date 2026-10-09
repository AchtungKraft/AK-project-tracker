import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Admin-only. Writes ONLY Project.client_account_id.
// payload: { account_id, changes: [{ project_id, assign: boolean, expected_current: string|null }], confirm_reassign: boolean }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Only admins can manage client projects.' }, { status: 403 });

    const { account_id, changes, confirm_reassign } = await req.json();
    if (!account_id || !Array.isArray(changes) || changes.length === 0 || changes.length > 200) {
      return Response.json({ error: 'Invalid request.' }, { status: 400 });
    }
    const db = base44.asServiceRole.entities;
    const acc = await db.ClientAccount.filter({ id: account_id }, { limit: 1 });
    if (!acc.items?.length) return Response.json({ error: 'Client account not found.' }, { status: 404 });

    const ids = [...new Set(changes.map((c) => c.project_id))];
    const page = await db.Project.filter({ id: { $in: ids } }, { limit: 200, fields: ['name', 'client_account_id', 'is_system_project'] });
    const byId = new Map(page.items.map((p) => [p.id, p]));

    // Validate everything before writing anything.
    const stale = [], reassigns = [], updates = [];
    for (const c of changes) {
      const p = byId.get(c.project_id);
      if (!p || p.is_system_project) return Response.json({ error: `Project ${c.project_id} not found or not assignable.` }, { status: 400 });
      const current = p.client_account_id || null;
      if (current !== (c.expected_current || null)) { stale.push(p.name); continue; }
      if (c.assign) {
        if (current === account_id) continue;
        if (current) reassigns.push({ id: p.id, name: p.name, from: current });
        updates.push({ id: p.id, value: account_id });
      } else {
        if (current !== account_id) continue; // never unlink a project from a different client
        updates.push({ id: p.id, value: null });
      }
    }
    if (stale.length) return Response.json({ error: `These projects changed since you opened the list: ${stale.join(', ')}. Reload and try again.`, code: 'STALE' }, { status: 409 });
    if (reassigns.length && confirm_reassign !== true) return Response.json({ error: 'Reassignment requires confirmation.', code: 'CONFIRM_REQUIRED', reassigns }, { status: 409 });

    const failed = [];
    for (let i = 0; i < updates.length; i += 6) {
      const batch = updates.slice(i, i + 6);
      const res = await Promise.allSettled(batch.map((u) => db.Project.update(u.id, { client_account_id: u.value })));
      res.forEach((r, j) => { if (r.status === 'rejected') failed.push(byId.get(batch[j].id)?.name || batch[j].id); });
    }
    console.log(`setProjectClientAccounts by ${user.email}: account=${account_id} updated=${updates.length - failed.length} failed=${failed.length}`);
    return Response.json({ updated: updates.length - failed.length, failed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});