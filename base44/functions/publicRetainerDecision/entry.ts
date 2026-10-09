import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Client-portal approve / request-changes for a Retainer Review.
// Uses the SAME project-specific ProjectClientAccess check as publicClientDecision,
// writes the canonical ClientFeedbackDecision, plus an immutable RetainerApprovalSnapshot.
// NEVER touches RetainerLedgerEntry, invoices, charges or TaskTimeEntry.
const H = { 'Access-Control-Allow-Origin': '*' };
const err = (status, error) => Response.json({ error }, { status, headers: H });

async function hashReview(r) {
  const s = JSON.stringify({ rev: r.revision, request_id: r.request_id, title: r.title, scope: r.scope_description, lines: r.lines.map((l) => [l.labor_group_id, l.hours_x100, l.standard_rate_cents, l.negotiated_rate_cents]), tasks: r.task_ids });
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const { token, slug, requestId, reviewId, contentHash, decision, note } = await req.json();
    if ((!token && !slug) || !requestId || !reviewId || !contentHash) return err(400, 'Missing required parameters');
    if (!['approved', 'changes_requested'].includes(decision)) return err(400, 'Invalid decision');
    const cleanNote = String(note || '').trim().slice(0, 5000);
    if (decision === 'changes_requested' && cleanNote.length < 3) return err(400, 'Please describe the changes needed.');

    const request = (await db.ClientFeedbackRequest.filter({ id: requestId }, { limit: 1 })).items[0];
    if (!request || request.request_type !== 'retainer_review') return err(404, 'Request not found');

    // Same access model as publicClientDecision: project-scoped, active, matching token/slug
    let contactId;
    if (slug) {
      const c = (await db.ClientContact.filter({ url_slug: slug, active: true }, { limit: 1 })).items[0];
      if (!c) return err(403, 'Invalid access');
      contactId = c.id;
    }
    const f = { project_id: request.project_id, access_status: 'active' };
    if (token) f.share_token = token;
    if (contactId) f.client_contact_id = contactId;
    const access = (await db.ProjectClientAccess.filter(f, { limit: 1 })).items[0];
    if (!access) return err(403, 'Invalid access');
    if (access.access_role !== 'approver') return err(403, 'Only approvers can decide on retainer reviews.');

    const review = (await db.RetainerReview.filter({ id: reviewId }, { limit: 1 })).items[0];
    if (!review || review.request_id !== requestId || review.project_id !== request.project_id) return err(404, 'Review not found');
    if (!review.is_current || review.status !== 'in_client_review') return err(409, 'This review is no longer awaiting a decision. Please refresh.');
    if (contentHash !== review.content_hash || (await hashReview(review)) !== review.content_hash) return err(409, 'The review changed since you opened it. Please refresh.');

    const contact = (await db.ClientContact.filter({ id: access.client_contact_id }, { limit: 1 })).items[0];
    const now = new Date().toISOString();
    const snap = await db.RetainerApprovalSnapshot.create({
      review_id: review.id, request_id: requestId, retainer_account_id: review.retainer_account_id, project_id: review.project_id,
      decision, note: cleanNote, revision: review.revision, content_hash: review.content_hash,
      reviewer_type: 'client_contact', reviewer_id: access.client_contact_id, reviewer_name: contact?.name || 'Client', access_id: access.id, decided_at: now,
      title: review.title, scope_description: review.scope_description, lines: review.lines, task_ids: review.task_ids,
      est_hours_x100: review.est_hours_x100, est_standard_cents: review.est_standard_cents, est_negotiated_cents: review.est_negotiated_cents,
    });
    // Race guard: exactly one decision per revision — earliest wins
    const all = (await db.RetainerApprovalSnapshot.filter({ review_id: review.id }, { sort: 'created_date', limit: 5 })).items;
    if (all.length > 1 && all[0].id !== snap.id) {
      await db.RetainerApprovalSnapshot.delete(snap.id);
      return err(409, 'A decision was already recorded for this revision.');
    }

    const dec = await db.ClientFeedbackDecision.create({ request_id: requestId, decided_by_type: 'client_contact', decided_by_id: access.client_contact_id, decision, note: cleanNote || null, target_type: 'request', decided_at: now });
    await db.RetainerApprovalSnapshot.update(snap.id, { decision_id: dec.id });
    await db.RetainerReview.update(review.id, { status: decision, decided_at: now });
    await db.ClientFeedbackRequest.update(requestId, { status: decision, review_state: 'none', queue_hidden: false, queue_hidden_at: null, queue_resume_date: null });

    base44.asServiceRole.functions.invoke('sendClientActivityNotification', {
      projectId: request.project_id, requestId, clientName: contact?.name || 'Client',
      actionType: decision === 'approved' ? 'APPROVED' : 'REVISION_REQUESTED', comment: cleanNote || null,
      previousStatus: request.status, newStatus: decision,
    }).catch((e) => console.error('[NOTIFICATION] Failed:', e.message));

    return Response.json({ success: true, decision, snapshot_id: snap.id }, { headers: H });
  } catch (error) {
    console.error('publicRetainerDecision', error.message);
    return Response.json({ error: error.message }, { status: 500, headers: H });
  }
});