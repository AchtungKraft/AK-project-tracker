import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function materialHash(item) {
  return JSON.stringify({
    title: item.title || '',
    description: item.description || '',
    budget_min: item.budget_min ?? null,
    budget_max: item.budget_max ?? null,
    budget_note: item.budget_note || '',
    images: (item.images || []).slice().sort(),
  });
}

async function resolveAccess(base44, request, token, slug) {
  let clientContactId = null;
  let clientContact = null;
  if (slug) {
    const contacts = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug, active: true });
    if (!contacts[0]) return null;
    clientContactId = contacts[0].id;
    clientContact = contacts[0];
  }

  const filter = { project_id: request.project_id, access_status: 'active' };
  if (token) filter.share_token = token;
  if (clientContactId) filter.client_contact_id = clientContactId;

  const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter(filter);
  const access = accesses[0] || null;
  if (access && !clientContact && access.client_contact_id) {
    const c = await base44.asServiceRole.entities.ClientContact.filter({ id: access.client_contact_id });
    clientContact = c[0] || null;
  }
  return { access, clientContact };
}

/**
 * Operational side effects for client scope activity.
 * Mirrors existing behavior from publicAddClientComment / publicClientDecision:
 *   - Clear review_state if 'in_review' (new client activity supersedes stale review)
 *   - Auto-resume if queue_hidden (client activity brings request back to queue)
 * Fire-and-forget — never blocks the client response.
 */
async function applyScopeOperationalSideEffects(base44, request) {
  try {
    const updates: Record<string, any> = {};
    
    // Clear stale review state — new client activity supersedes internal review
    if (request.review_state === 'in_review') {
      updates.review_state = 'none';
      updates.review_started_at = null;
    }
    
    // Auto-resume hidden requests — client activity brings them back
    if (request.queue_hidden) {
      updates.queue_hidden = false;
      updates.queue_hidden_at = null;
      updates.queue_resume_date = null;
    }
    
    if (Object.keys(updates).length > 0) {
      await base44.asServiceRole.entities.ClientFeedbackRequest.update(request.id, updates);
      console.log('[publicManageScopeReview] operational side effects applied:', Object.keys(updates));
    }
  } catch (e) {
    console.error('[publicManageScopeReview] operational side effects failed (non-blocking):', e.message);
  }
}

/** Fire-and-forget notification — never blocks the client response */
async function notifyScopeActivity(base44, { requestId, projectId, clientName, actionType, comment }) {
  try {
    await base44.asServiceRole.functions.invoke('sendClientActivityNotification', {
      requestId,
      projectId,
      clientName,
      actionType,
      comment: comment || null,
    });
  } catch (e) {
    console.error('[publicManageScopeReview] notification failed (non-blocking):', e.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => null);
    if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS });

    const { token, slug, requestId, action, itemId, decision, comment } = body;
    if ((!token && !slug) || !requestId || !action) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400, headers: CORS });
    }

    const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
    const request = requests[0];
    if (!request || request.request_type !== 'client_scope_review') {
      return Response.json({ error: 'Invalid scope review request' }, { status: 404, headers: CORS });
    }

    const { access, clientContact } = await resolveAccess(base44, request, token, slug);
    if (!access) return Response.json({ error: 'Invalid access' }, { status: 403, headers: CORS });

    const actorId = access.client_contact_id;
    const actorName = clientContact?.name || 'Client';

    const now = new Date().toISOString();

    if (action === 'decision') {
      if (access.access_role !== 'approver') {
        return Response.json({ error: 'Approval permission required' }, { status: 403, headers: CORS });
      }
      const allowed = ['needs_review', 'approved', 'request_changes', 'not_now'];
      if (!itemId || !allowed.includes(decision)) {
        return Response.json({ error: 'Invalid decision' }, { status: 400, headers: CORS });
      }

      const items = await base44.asServiceRole.entities.ScopeItem.filter({ id: itemId });
      const item = items[0];
      if (!item || item.request_id !== requestId) {
        return Response.json({ error: 'Scope item not found' }, { status: 404, headers: CORS });
      }

      const previous = item.decision_status || 'needs_review';
      const update = {
        decision_status: decision,
        decision_at: now,
        decision_actor_type: 'client_contact',
        decision_actor_id: actorId,
      };
      if (decision === 'approved') update.material_hash = materialHash(item);

      const updatedItem = await base44.asServiceRole.entities.ScopeItem.update(itemId, update);
      const history = await base44.asServiceRole.entities.ScopeItemHistory.create({
        scope_item_id: itemId,
        request_id: requestId,
        event_type: 'decision',
        decision,
        previous_decision: previous,
        actor_type: 'client_contact',
        actor_id: actorId,
        actor_name: actorName,
        recorded_at: now,
      });

      // Operational side effects — clear review_state, auto-resume queue
      applyScopeOperationalSideEffects(base44, request);

      // Notify — map scope decision to notification action type
      const notifType = decision === 'approved' ? 'APPROVED'
        : decision === 'request_changes' ? 'REVISION_REQUESTED'
        : decision === 'not_now' ? 'REVISION_REQUESTED'
        : null;
      if (notifType) {
        notifyScopeActivity(base44, {
          requestId, projectId: request.project_id, clientName: actorName,
          actionType: notifType,
          comment: `Scope item "${item.title}" — ${decision.replace(/_/g, ' ')}`,
        });
      }

      return Response.json({ success: true, item: updatedItem, history }, { headers: CORS });
    }

    if (action === 'comment') {
      if (!itemId || !comment?.trim()) {
        return Response.json({ error: 'Item and comment are required' }, { status: 400, headers: CORS });
      }
      const items = await base44.asServiceRole.entities.ScopeItem.filter({ id: itemId });
      const item = items[0];
      if (!item || item.request_id !== requestId) {
        return Response.json({ error: 'Scope item not found' }, { status: 404, headers: CORS });
      }

      const created = await base44.asServiceRole.entities.ScopeItemComment.create({
        scope_item_id: itemId,
        request_id: requestId,
        author_type: 'client_contact',
        author_id: actorId,
        author_name: actorName,
        body: comment.trim(),
        posted_at: now,
      });

      // Operational side effects — clear review_state, auto-resume queue
      applyScopeOperationalSideEffects(base44, request);

      notifyScopeActivity(base44, {
        requestId, projectId: request.project_id, clientName: actorName,
        actionType: 'COMMENT',
        comment: `Comment on scope item "${item.title}": ${comment.trim().slice(0, 200)}`,
      });

      return Response.json({ success: true, comment: created }, { headers: CORS });
    }

    if (action === 'confirm') {
      if (access.access_role !== 'approver') {
        return Response.json({ error: 'Approval permission required' }, { status: 403, headers: CORS });
      }

      const items = await base44.asServiceRole.entities.ScopeItem.filter({ request_id: requestId });
      const unresolved = items.filter(i => ['needs_review', 'reapproval_required'].includes(i.decision_status || 'needs_review'));
      if (unresolved.length > 0) {
        return Response.json({ error: 'All scope items must be reviewed before confirmation' }, { status: 409, headers: CORS });
      }
      const approved = items.filter(i => i.decision_status === 'approved');
      if (approved.length === 0) {
        return Response.json({ error: 'At least one approved item is required' }, { status: 409, headers: CORS });
      }

      const existing = await base44.asServiceRole.entities.ScopeConfirmation.filter({ request_id: requestId });
      const latestRevision = existing.reduce((m, c) => Math.max(m, c.revision || 0), 0);
      const budgetMin = approved.reduce((sum, i) => sum + (i.budget_tbd ? 0 : (i.budget_min || 0)), 0);
      const budgetMax = approved.reduce((sum, i) => sum + (i.budget_tbd ? 0 : (i.budget_max || 0)), 0);
      const summary = {
        total: items.length,
        approved: approved.length,
        request_changes: items.filter(i => i.decision_status === 'request_changes').length,
        not_now: items.filter(i => i.decision_status === 'not_now').length,
      };

      const confirmation = await base44.asServiceRole.entities.ScopeConfirmation.create({
        request_id: requestId,
        confirmed_at: now,
        confirmed_by_type: 'client_contact',
        confirmed_by_id: actorId,
        confirmed_by_name: actorName,
        approved_item_ids: approved.map(i => i.id),
        approved_budget_min: budgetMin,
        approved_budget_max: budgetMax,
        total_items: items.length,
        revision: latestRevision + 1,
        summary_snapshot: summary,
      });

      await base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, {
        scope_confirmed_at: now,
        scope_confirmed_by_name: actorName,
      });

      // Operational side effects — clear review_state, auto-resume queue
      applyScopeOperationalSideEffects(base44, request);

      notifyScopeActivity(base44, {
        requestId, projectId: request.project_id, clientName: actorName,
        actionType: 'APPROVED',
        comment: `Scope confirmed — revision ${latestRevision + 1}: ${approved.length} approved items, budget $${budgetMin.toLocaleString()}–$${budgetMax.toLocaleString()}`,
      });

      return Response.json({ success: true, confirmation }, { headers: CORS });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400, headers: CORS });
  } catch (error) {
    console.error('publicManageScopeReview error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }
});