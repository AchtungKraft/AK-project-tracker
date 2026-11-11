import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Shop Review print — technician-safe, read-only projection of one scope review.
// Returns NO monetary data: no hard cost / budget amounts, totals, rates, labor dollars,
// baselines, commitments or invoices. Free-text fields are scrubbed of currency amounts.
// Access: admins, or internal (Achtung Kraft) team members only.

const CURRENCY_RE = /(?:US\$|USD\s?|\$)\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM]\b)?|\b\d[\d,]*(?:\.\d+)?\s?(?:USD|dollars?|bucks)\b/gi;
const scrub = (s) => {
  if (!s || typeof s !== 'string') return '';
  return s.replace(CURRENCY_RE, '[amount omitted]').replace(/\$/g, '').trim();
};
const BATCH = 6;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const sr = base44.asServiceRole.entities;

    if (user.role !== 'admin') {
      const tms = await sr.TeamMember.filter({ user_id: user.id });
      if (!tms[0] || tms[0].is_achtung_kraft_member !== true) {
        return Response.json({ error: 'Shop Review print is available to internal staff only.' }, { status: 403 });
      }
    }

    const { request_id } = await req.json().catch(() => ({}));
    if (!request_id) return Response.json({ error: 'request_id is required' }, { status: 400 });

    const request = await sr.ClientFeedbackRequest.get(request_id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!request || request.request_type !== 'client_scope_review') {
      return Response.json({ error: 'Scope review not found' }, { status: 404 });
    }

    const [project, categories, groups, items, labor, comments] = await Promise.all([
      request.project_id ? sr.Project.get(request.project_id).catch(() => null) : null,
      sr.ScopeCategory.filter({ request_id }),
      sr.ScopeGroup.filter({ request_id }),
      sr.ScopeItem.filter({ request_id }),
      sr.ScopeItemLaborEstimate.filter({ request_id }),
      sr.ScopeItemComment.filter({ request_id }),
    ]);

    const taskIds = [...new Set(items.flatMap((i) => i.linked_task_ids || []))].filter((id) => /^[0-9a-f]{24}$/i.test(id));
    const tasks = [];
    for (let i = 0; i < taskIds.length; i += 100 * BATCH) {
      const chunks = [];
      for (let j = i; j < Math.min(i + 100 * BATCH, taskIds.length); j += 100) chunks.push(taskIds.slice(j, j + 100));
      const res = await Promise.all(chunks.map((ids) => sr.Task.filter({ id: { $in: ids } })));
      res.forEach((r) => tasks.push(...r));
    }
    const taskById = new Map(tasks.map((t) => [t.id, t]));

    const laborByItem = new Map();
    for (const le of [...labor].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))) {
      if (!laborByItem.has(le.scope_item_id)) laborByItem.set(le.scope_item_id, []);
      laborByItem.get(le.scope_item_id).push({
        activity: scrub(le.labor_group_name_snapshot) || 'Labor',
        hours_min: typeof le.hours_min === 'number' ? le.hours_min : null,
        hours_max: typeof le.hours_max === 'number' ? le.hours_max : null,
      });
    }
    const commentsByItem = new Map();
    for (const c of [...comments].sort((a, b) => String(a.posted_at || a.created_date).localeCompare(String(b.posted_at || b.created_date)))) {
      const body = scrub(c.body);
      if (!body) continue;
      if (!commentsByItem.has(c.scope_item_id)) commentsByItem.set(c.scope_item_id, []);
      commentsByItem.get(c.scope_item_id).push({
        author: scrub(c.author_name) || (c.author_type === 'client_contact' ? 'Client' : 'Team'),
        author_type: c.author_type,
        posted_at: c.posted_at || c.created_date,
        body,
      });
    }

    const projItems = items.map((i) => {
      const linked = (i.linked_task_ids || []).map((id) => taskById.get(id)).filter((t) => t && (!request.project_id || t.project_id === request.project_id));
      const decision = i.decision_status || 'needs_review';
      const conversion = linked.length ? 'converted' : decision === 'approved' ? 'approved_not_converted' : 'not_converted';
      const partsNotes = [];
      if (i.hard_cost_note && scrub(i.hard_cost_note)) partsNotes.push(scrub(i.hard_cost_note));
      if (i.budget_note && scrub(i.budget_note)) partsNotes.push(scrub(i.budget_note));
      return {
        id: i.id,
        category_id: i.category_id,
        group_id: i.group_id,
        sort_order: i.sort_order || 0,
        title: scrub(i.title) || 'Untitled item',
        description: scrub(i.description),
        decision_status: decision,
        decision_at: i.decision_at || null,
        images: (i.images || []).filter((u) => typeof u === 'string' && /^https:\/\//.test(u)),
        parts_notes: partsNotes,
        parts_tbd: i.pricing_model === 'hard_cost_plus_labor' ? !!i.hard_cost_tbd : !!i.budget_tbd,
        labor: laborByItem.get(i.id) || [],
        comments: commentsByItem.get(i.id) || [],
        conversion,
        tasks: linked.map((t) => scrub(t.name)),
      };
    });

    return Response.json({
      request: { id: request.id, title: scrub(request.title), status: request.status },
      project: project ? { id: project.id, name: scrub(project.name), vin: project.vin || '' } : null,
      categories: categories.map((c) => ({ id: c.id, name: scrub(c.name), sort_order: c.sort_order || 0 })),
      groups: groups.map((g) => ({ id: g.id, name: scrub(g.name), sort_order: g.sort_order || 0 })),
      items: projItems,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});