import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Admin-only authoring for D&D Retainer Reviews. Never touches RetainerLedgerEntry,
// invoices, charges or TaskTimeEntry. Money = integer cents; hours = integer hundredths.
const err = (status, error) => Response.json({ error }, { status });

async function sha256(obj) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(obj)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashReview(r) {
  return sha256({ rev: r.revision, request_id: r.request_id, title: r.title, scope: r.scope_description, lines: r.lines.map((l) => [l.labor_group_id, l.hours_x100, l.standard_rate_cents, l.negotiated_rate_cents]), tasks: r.task_ids });
}

async function buildContent(db, retainer, input) {
  if (retainer.status !== 'active') throw new Error('Retainer is inactive.');
  if (!retainer.designated_project_id) throw new Error('Set a designated D&D project on the retainer first.');
  const title = String(input.title || '').trim();
  const scope = String(input.scope_description || '').trim();
  if (title.length < 3) throw new Error('Title is required.');
  if (scope.length < 10) throw new Error('Describe the scope (10+ characters).');
  const linesIn = Array.isArray(input.lines) ? input.lines : [];
  if (!linesIn.length || linesIn.length > 20) throw new Error('Add 1–20 labor estimate lines.');
  const seen = new Set();
  const lines = [];
  for (const l of linesIn) {
    if (seen.has(l.labor_group_id)) throw new Error('Each labor group may appear once.');
    seen.add(l.labor_group_id);
    if (!Number.isSafeInteger(l.hours_x100) || l.hours_x100 <= 0 || l.hours_x100 > 1000000) throw new Error('Hours must be a positive number with up to 2 decimals.');
    const rate = (await db.RetainerRate.filter({ retainer_account_id: retainer.id, labor_group_id: l.labor_group_id, is_active: true }, { sort: '-set_at', limit: 1 })).items[0];
    if (!rate) throw new Error('Every labor group needs an active negotiated rate on this retainer.');
    lines.push({
      labor_group_id: l.labor_group_id, labor_group_name: rate.labor_group_name_snapshot, rate_id: rate.id, hours_x100: l.hours_x100,
      standard_rate_cents: rate.standard_rate_cents_snapshot, negotiated_rate_cents: rate.negotiated_rate_cents,
      est_standard_cents: Math.round((l.hours_x100 * rate.standard_rate_cents_snapshot) / 100),
      est_negotiated_cents: Math.round((l.hours_x100 * rate.negotiated_rate_cents) / 100),
    });
  }
  const taskIds = [...new Set(Array.isArray(input.task_ids) ? input.task_ids : [])];
  if (taskIds.length > 50) throw new Error('Link at most 50 tasks.');
  let names = [];
  if (taskIds.length) {
    const tasks = (await db.Task.filter({ id: { $in: taskIds } }, { limit: 50, fields: ['name', 'project_id'] })).items;
    if (tasks.length !== taskIds.length || tasks.some((t) => t.project_id !== retainer.designated_project_id)) throw new Error('All linked tasks must exist in the designated D&D project.');
    const byId = new Map(tasks.map((t) => [t.id, t.name]));
    names = taskIds.map((id) => byId.get(id) || '');
  }
  const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
  return {
    title, scope_description: scope, lines, task_ids: taskIds, task_names_snapshot: names, project_id: retainer.designated_project_id,
    est_hours_x100: sum('hours_x100'), est_standard_cents: sum('est_standard_cents'), est_negotiated_cents: sum('est_negotiated_cents'),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return err(401, 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'Only admins can author retainer reviews.');
    const db = base44.asServiceRole.entities;
    const body = await req.json();
    const now = new Date().toISOString();
    const one = async (E, id) => (typeof id === 'string' && id ? (await db[E].filter({ id }, { limit: 1 })).items[0] : null);

    if (body.action === 'create_draft') {
      const retainer = await one('RetainerAccount', body.retainer_account_id);
      if (!retainer) return err(404, 'Retainer not found.');
      const c = await buildContent(db, retainer, body);
      const request = await db.ClientFeedbackRequest.create({ project_id: c.project_id, title: c.title, body: c.scope_description, request_type: 'retainer_review', status: 'draft', created_by_user_id: user.id });
      const rec = { ...c, request_id: request.id, retainer_account_id: retainer.id, client_account_id: retainer.client_account_id, revision: 1, is_current: true, status: 'draft', authored_by_email: user.email };
      rec.content_hash = await hashReview(rec);
      try {
        return Response.json({ review: await db.RetainerReview.create(rec) });
      } catch (e) {
        await db.ClientFeedbackRequest.delete(request.id); // compensate: no orphan request
        throw e;
      }
    }

    const review = await one('RetainerReview', body.review_id);
    if (!review) return err(404, 'Review not found.');
    if (!review.is_current) return err(409, 'This revision is no longer current.');
    const retainer = await one('RetainerAccount', review.retainer_account_id);

    if (body.action === 'update_draft') {
      if (review.status !== 'draft') return err(409, 'Only drafts can be edited. Use Revise for reviewed scope.');
      const c = await buildContent(db, retainer, body);
      const rec = { ...review, ...c };
      const updated = await db.RetainerReview.update(review.id, { ...c, content_hash: await hashReview(rec) });
      await db.ClientFeedbackRequest.update(review.request_id, { title: c.title, body: c.scope_description, project_id: c.project_id });
      return Response.json({ review: updated });
    }

    if (body.action === 'revise') {
      if (review.status === 'draft') return err(409, 'Already a draft; edit it directly.');
      const c = await buildContent(db, retainer, body);
      const rec = { ...c, request_id: review.request_id, retainer_account_id: review.retainer_account_id, client_account_id: review.client_account_id, revision: review.revision + 1, is_current: true, status: 'draft', authored_by_email: user.email };
      rec.content_hash = await hashReview(rec);
      // Supersede first: if a later step fails, nothing remains approved for changed scope.
      await db.RetainerReview.update(review.id, { is_current: false, status: 'superseded', superseded_at: now });
      const created = await db.RetainerReview.create(rec);
      await db.ClientFeedbackRequest.update(review.request_id, { status: 'draft', title: c.title, body: c.scope_description });
      return Response.json({ review: created });
    }

    if (body.action === 'send_to_client') {
      if (review.status !== 'draft') return err(409, 'Only drafts can be sent.');
      if (retainer.designated_project_id !== review.project_id) return err(409, 'Designated project changed since drafting. Edit the draft.');
      // Stale-rate guard: snapshot must still equal current active rates
      for (const l of review.lines) {
        const rate = (await db.RetainerRate.filter({ retainer_account_id: retainer.id, labor_group_id: l.labor_group_id, is_active: true }, { sort: '-set_at', limit: 1 })).items[0];
        if (!rate || rate.negotiated_rate_cents !== l.negotiated_rate_cents) return err(409, `Rate for ${l.labor_group_name} changed. Edit the draft to refresh rates.`);
      }
      if (await hashReview(review) !== review.content_hash) return err(409, 'Review content integrity check failed.');
      const existing = new Set((await db.ClientFeedbackTaskLink.filter({ feedback_request_id: review.request_id }, { limit: 200, fields: ['task_id'] })).items.map((l) => l.task_id));
      const missing = review.task_ids.filter((t) => !existing.has(t));
      if (missing.length) await db.ClientFeedbackTaskLink.bulkCreate(missing.map((task_id) => ({ project_id: review.project_id, task_id, feedback_request_id: review.request_id, created_by_user_id: user.id })));
      const updated = await db.RetainerReview.update(review.id, { status: 'in_client_review', sent_at: now });
      await db.ClientFeedbackRequest.update(review.request_id, { status: 'posted', posted_at: now, review_state: 'none' });
      return Response.json({ review: updated, links_created: missing.length });
    }

    return err(400, 'Unknown action.');
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.message?.length < 200 ? 400 : 500 });
  }
});