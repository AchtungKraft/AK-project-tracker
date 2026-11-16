import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * notifyClientFeedbackContacts — canonical client-facing notification service
 * for Client Feedback activity. Every feedback write path (client portal public
 * endpoints and AK internal endpoints) invokes this AFTER persisting the action.
 *
 * actions:
 *   dispatch { sourceType: 'comment'|'decision'|'scope_confirmation', sourceId }
 *     Everything (event, recipients, content) is derived server-side from the
 *     persisted record. Idempotent per (event, recipient). Only events < 24h old.
 *   overview { requestId }  (admin)  delivery log + read-only recipient preview
 *   retry    { requestId }  (admin)  re-send failed deliveries (still-authorized recipients only)
 */

const PORTAL_URL = 'https://client.achtungkraft.com';
const FROM = 'Achtung Kraft Projects <updates@projects.achtungkraft.com>';
const REPLY_TO = 'sales@achtungkraft.com';
const LOGO = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6913f39cea91db2169cc30c4/7bd203f38_logo.png';
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function fmtTime(iso) {
  return new Date(iso || Date.now()).toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }) + ' CT';
}

const nf = (p) => p.catch((e) => (e?.status === 404 ? null : Promise.reject(e)));

async function sha(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

// ── Recipient resolution (canonical: active ProjectClientAccess → active ClientContact) ──
async function resolveRecipients(db, projectId, excludeContactId) {
  const accesses = await db.ProjectClientAccess.filter({ project_id: projectId, access_status: 'active' });
  const contactIds = [...new Set(accesses.map((a) => a.client_contact_id).filter(Boolean))];
  const contacts = contactIds.length ? await db.ClientContact.filter({ id: { $in: contactIds } }) : [];
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const seen = new Set();
  const recipients = [];
  const excluded = [];
  for (const a of accesses) {
    const c = byId.get(a.client_contact_id);
    if (!c) continue;
    const email = String(c.email || '').trim().toLowerCase();
    const base = { contact_id: c.id, name: c.name || 'Client', email, access_role: a.access_role || 'approver' };
    if (c.active === false) { excluded.push({ ...base, reason: 'Contact inactive' }); continue; }
    if (!EMAIL_RE.test(email)) { excluded.push({ ...base, reason: 'No valid email' }); continue; }
    if (c.notify_email === false) { excluded.push({ ...base, reason: 'Email notifications off' }); continue; }
    if (excludeContactId && c.id === excludeContactId) { excluded.push({ ...base, reason: 'Performed the action' }); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    const slug = c.url_slug || a.url_slug || null;
    const link = slug
      ? `${PORTAL_URL}/ClientFeedbackRequestDetail?id=__RID__&slug=${encodeURIComponent(slug)}`
      : a.share_token ? `${PORTAL_URL}/ClientFeedbackRequestDetail?id=__RID__&token=${encodeURIComponent(a.share_token)}` : PORTAL_URL;
    recipients.push({ ...base, link, slug });
  }
  // A recipient excluded by self-action must also not receive via a second email match
  return { recipients, excluded };
}

// ── Event construction from persisted source records ──
async function buildEvent(db, sourceType, sourceId) {
  if (sourceType === 'comment') {
    const c = await nf(db.ClientFeedbackComment.get(sourceId));
    if (!c) return { skip: 'Comment not found' };
    if (c.visibility === 'internal_only' || c.is_system) return { skip: 'Comment is not client-visible' };
    const isClient = c.author_type === 'client_contact';
    const text = htmlToText(c.content_html) || String(c.content_fallback || c.body || '').trim();
    const attachCount = (Array.isArray(c.photos) ? c.photos.length : 0) + (Array.isArray(c.files) ? c.files.length : 0);
    return {
      event_key: `comment:${c.id}`, event_type: isClient ? 'CLIENT_COMMENT' : 'TEAM_COMMENT',
      source_type: 'comment', source_id: c.id, request_id: c.request_id, created: c.created_date,
      actor_type: isClient ? 'client_contact' : 'internal_user', actor_id: c.author_id, occurred_at: c.posted_at || c.created_date,
      comment_text: text.slice(0, 3000), summary: attachCount ? `${attachCount} attachment${attachCount > 1 ? 's' : ''} included — view in the portal.` : null,
    };
  }
  if (sourceType === 'decision') {
    const d = await nf(db.ClientFeedbackDecision.get(sourceId));
    if (!d) return { skip: 'Decision not found' };
    if (d.decided_by_type !== 'client_contact') return { skip: 'Not a client decision' };
    const type = d.decision === 'approved' ? 'APPROVED' : d.decision === 'changes_requested' ? 'CHANGES_REQUESTED' : null;
    if (!type) return { skip: 'Unsupported decision' };
    // One event per client action (image-level decisions share decided_at)
    const group = d.target_type === 'attachment_image'
      ? (await db.ClientFeedbackDecision.filter({ request_id: d.request_id, decided_by_id: d.decided_by_id, decided_at: d.decided_at })).filter((x) => x.decision === d.decision)
      : [d];
    const images = group.filter((x) => x.target_type === 'attachment_image').length;
    const what = images ? `${images} image${images > 1 ? 's' : ''}` : 'the feedback request';
    return {
      event_key: `decision:${d.request_id}:${d.decided_by_id}:${d.decided_at || d.id}`, event_type: type,
      source_type: 'decision', source_id: d.id, request_id: d.request_id, created: d.created_date,
      actor_type: 'client_contact', actor_id: d.decided_by_id, occurred_at: d.decided_at || d.created_date,
      comment_text: String(d.note || '').trim().slice(0, 3000),
      summary: !images ? null : type === 'APPROVED' ? `Approved ${what}.` : `Changes requested on ${what}.`,
    };
  }
  if (sourceType === 'scope_confirmation') {
    const s = await nf(db.ScopeConfirmation.get(sourceId));
    if (!s) return { skip: 'Scope confirmation not found' };
    if (s.confirmed_by_type !== 'client_contact') return { skip: 'Not a client confirmation' };
    const n = Array.isArray(s.approved_item_ids) ? s.approved_item_ids.length : 0;
    return {
      event_key: `scope_confirmation:${s.id}`, event_type: 'APPROVED',
      source_type: 'scope_confirmation', source_id: s.id, request_id: s.request_id, created: s.created_date,
      actor_type: 'client_contact', actor_id: s.confirmed_by_id, occurred_at: s.confirmed_at || s.created_date,
      comment_text: '', summary: `Project scope confirmed: ${n} of ${s.total_items || n} items approved.`,
    };
  }
  return { skip: 'Unknown source type' };
}

async function loadContext(db, ev) {
  const request = await nf(db.ClientFeedbackRequest.get(ev.request_id));
  if (!request) return { skip: 'Request not found' };
  if (request.status === 'draft') return { skip: 'Request is a draft (not client-visible)' };
  const project = await nf(db.Project.get(request.project_id));
  if (!project) return { skip: 'Project not found' };
  let clientLabel = project.client_name || '';
  if (!clientLabel && project.client_account_id) {
    const acct = await nf(db.ClientAccount.get(project.client_account_id));
    clientLabel = acct?.name || '';
  }
  let actorName = 'Client';
  let actorDisplay = 'Client';
  if (ev.actor_type === 'client_contact') {
    actorName = actorDisplay = (await nf(db.ClientContact.get(ev.actor_id)))?.name || 'Client';
  } else {
    const u = ev.actor_id ? await nf(db.User.get(ev.actor_id)) : null;
    actorName = `${u?.full_name || 'Team'} (Ächtung Kraft)`;
    actorDisplay = u?.full_name || 'The Ächtung Kraft team';
  }
  return { request, project, clientLabel, actorName, actorDisplay };
}

// ── CLIENT-FACING EMAIL TEMPLATE (portal recipients only) ──
// Mirrors the canonical "Review Requested" layout in sendNeedsReviewEmail (buildReviewEmailHtml):
// same container, greeting, PROJECT label, title, section break, red CTA, direct link, portal code and sign-off.
// Backend functions deploy independently, so the shared styles are mirrored here rather than imported.
// Internal activity-monitor emails live in sendClientActivityNotification and are untouched.
const CLIENT_COPY = {
  CLIENT_COMMENT: { subject: 'New comment', intro: () => 'A new comment has been added to a feedback request for your project.', lead: (a) => `${a} commented:`, cta: 'View Project Feedback' },
  TEAM_COMMENT: { subject: 'Project update', intro: () => "We've added an update to a feedback request for your project.", lead: (a) => `${a} commented:`, cta: 'View Project Feedback' },
  APPROVED: { subject: 'Feedback approved', intro: (a) => `${a} has approved the following feedback request for your project.`, lead: () => 'Approval comment:', cta: 'View Approved Feedback' },
  CHANGES_REQUESTED: { subject: 'Changes requested', intro: (a) => `${a} has requested changes to the following feedback request.`, lead: () => 'Requested changes:', cta: 'Review Requested Changes' },
};
const CTA_STYLE = 'display:inline-block;background:#cc0000;color:#fff;padding:12px 20px;border-radius:6px;font-weight:600;font-size:15px;text-decoration:none;';

function renderClientEmail({ copy, greeting, actor, project, request, summary, quote, link, slug }) {
  const intro = copy.intro(actor);
  const body = quote || summary
    ? `<div style="margin-top:28px;border-top:1px solid #e5e5e5;padding-top:20px;">
    ${quote ? `<div style="font-size:18px;font-weight:600;color:#cc0000;margin-bottom:10px;">${esc(copy.lead(actor))}</div>
    <div style="border-top:1px solid #e5e5e5;margin-bottom:14px;"></div>
    <div style="font-size:16px;line-height:1.6;color:#111;"><p style="margin:0;line-height:1.6;white-space:pre-wrap;">${esc(quote)}</p></div>` : ''}
    ${summary ? `<div style="font-size:15px;color:#555;line-height:1.5;${quote ? 'margin-top:12px;' : ''}">${esc(summary)}</div>` : ''}
  </div>`
    : '';
  const html = `<div style="max-width:580px;margin:0 auto;padding:36px 24px;background:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <div style="font-size:15px;color:#333;line-height:1.5;">${esc(greeting)} ${esc(intro)}</div>
  <div style="margin-top:20px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#999;">Project</div>
  <div style="font-size:16px;font-weight:600;color:#111;margin-top:4px;">${esc(project)}</div>
  <div style="font-size:24px;font-weight:700;color:#111;margin-top:16px;line-height:1.3;">${esc(request)}</div>
  ${body}
  <div style="margin-top:28px;"><a href="${esc(link)}" style="${CTA_STYLE}">${esc(copy.cta)}</a></div>
  <div style="font-size:13px;color:#666;margin-top:16px;">Direct link: <a href="${esc(link)}" style="color:#666;text-decoration:underline;word-break:break-all;">${esc(link)}</a></div>
  ${slug ? `<div style="font-size:13px;color:#666;margin-top:12px;">Your portal code: <strong>${esc(slug)}</strong></div>` : ''}
  <div style="margin-top:32px;font-size:13px;color:#666;">— Achtung Kraft Projects<br/>Precision builds. Clear communication.</div>
</div>`;
  const text = [
    `${greeting} ${intro}`, '', `Project: ${project}`, request, '',
    quote ? `${copy.lead(actor)}\n\n${quote}\n` : '', summary ? `${summary}\n` : '',
    `${copy.cta}:`, link, '', slug ? `Your portal code: ${slug}` : '', '',
    '— Achtung Kraft Projects', 'Precision builds. Clear communication.',
  ].filter(Boolean).join('\n');
  return { html, text };
}

function buildEmail(ev, ctx, r) {
  const copy = CLIENT_COPY[ev.event_type];
  const link = r.link.replace('__RID__', encodeURIComponent(ctx.request.id));
  const first = String(r.name || '').trim().split(/\s+/)[0];
  const { html, text } = renderClientEmail({
    copy, greeting: first ? `Hi ${first},` : 'Hi,', actor: ctx.actorDisplay || ctx.actorName,
    project: ctx.project.name, request: ctx.request.title || 'Project feedback',
    summary: ev.summary, quote: ev.comment_text, link, slug: r.slug,
  });
  return { subject: `${copy.subject} — ${ctx.project.name}`, html, text };
}

// Resend batch send. One idempotency key per batch payload → retries of the same batch never double-send.
async function sendBatch(messages, idemKey) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, error: 'RESEND_API_KEY not set' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
      body: JSON.stringify(messages.map((m) => ({ from: FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text, reply_to: [REPLY_TO] }))),
      signal: AbortSignal.timeout(15000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ message: e.message }) }));
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, ids: (body?.data || []).map((d) => d?.id || null) };
    const transient = res.status === 0 || res.status === 429 || res.status >= 500;
    if (!transient || attempt === 1) return { ok: false, error: `${res.status} ${body?.message || body?.name || 'send failed'}`.slice(0, 500) };
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { ok: false, error: 'send failed' };
}

async function deliver(db, ev, ctx, records, recipientsByEmail) {
  if (!records.length) return [];
  const messages = records.map((rec) => ({ rec, ...buildEmail(ev, ctx, recipientsByEmail.get(rec.recipient_email)), to: rec.recipient_email }));
  const attemptNo = Math.max(...records.map((r) => r.attempts || 0)) + 1;
  const idem = `cfn-${await sha(`${ev.event_key}|${records.map((r) => r.dedupe_key).sort().join(',')}|${attemptNo}`)}`;
  const result = await sendBatch(messages, idem);
  const now = new Date().toISOString();
  await Promise.allSettled(records.map((rec, i) => db.ClientFeedbackNotification.update(rec.id, result.ok
    ? { status: 'sent', provider_message_id: result.ids[i] || null, sent_at: now, error: null, attempts: (rec.attempts || 0) + 1 }
    : { status: 'failed', error: result.error, attempts: (rec.attempts || 0) + 1 })));
  return records.map((rec) => ({ email: rec.recipient_email, status: result.ok ? 'sent' : 'failed', error: result.ok ? null : result.error }));
}

async function dispatch(db, sourceType, sourceId) {
  const ev = await buildEvent(db, sourceType, sourceId);
  if (ev.skip) return { skipped: ev.skip };
  if (Date.now() - new Date(ev.created).getTime() > MAX_EVENT_AGE_MS) return { skipped: 'Event too old' };
  const ctx = await loadContext(db, ev);
  if (ctx.skip) return { skipped: ctx.skip };
  const excludeId = ev.actor_type === 'client_contact' ? ev.actor_id : null;
  const { recipients } = await resolveRecipients(db, ctx.request.project_id, excludeId);
  // Never send the actor a self-notification via a duplicate email address
  let actorEmail = null;
  if (excludeId) actorEmail = String((await nf(db.ClientContact.get(excludeId)))?.email || '').trim().toLowerCase();
  const targets = recipients.filter((r) => r.email !== actorEmail);
  if (!targets.length) return { skipped: 'No other authorized recipients', event_key: ev.event_key };

  // Claim one record per recipient (idempotent; earliest record wins on concurrent dispatch)
  const existing = await db.ClientFeedbackNotification.filter({ event_key: ev.event_key });
  const have = new Set(existing.map((e) => e.dedupe_key));
  const fresh = targets.filter((r) => !have.has(`${ev.event_key}|${r.email}`));
  if (!fresh.length) return { duplicate: true, event_key: ev.event_key };
  const mine = await db.ClientFeedbackNotification.bulkCreate(fresh.map((r) => ({
    dedupe_key: `${ev.event_key}|${r.email}`, event_key: ev.event_key, event_type: ev.event_type, source_type: ev.source_type, source_id: ev.source_id,
    request_id: ctx.request.id, project_id: ctx.request.project_id, actor_type: ev.actor_type, actor_id: ev.actor_id, actor_name: ctx.actorName,
    recipient_contact_id: r.contact_id, recipient_email: r.email, recipient_name: r.name, status: 'pending', attempts: 0,
  })));
  // Concurrent dispatch guard: earliest record per dedupe_key wins; losers are removed
  const all = (await db.ClientFeedbackNotification.filter({ event_key: ev.event_key }))
    .sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)) || String(a.id).localeCompare(String(b.id)));
  const winner = new Map();
  all.forEach((r) => { if (!winner.has(r.dedupe_key)) winner.set(r.dedupe_key, r.id); });
  const claimed = mine.filter((r) => winner.get(r.dedupe_key) === r.id);
  const losers = mine.filter((r) => winner.get(r.dedupe_key) !== r.id);
  await Promise.allSettled(losers.map((r) => db.ClientFeedbackNotification.delete(r.id)));
  if (!claimed.length) return { duplicate: true, event_key: ev.event_key };
  const results = await deliver(db, ev, ctx, claimed, new Map(targets.map((r) => [r.email, r])));
  return { event_key: ev.event_key, results };
}

async function retryFailed(db, requestId) {
  const failed = (await db.ClientFeedbackNotification.filter({ request_id: requestId, status: 'failed' })).filter((r) => (r.attempts || 0) < MAX_ATTEMPTS);
  const byEvent = new Map();
  failed.forEach((r) => { if (!byEvent.has(r.event_key)) byEvent.set(r.event_key, []); byEvent.get(r.event_key).push(r); });
  const out = [];
  for (const recs of byEvent.values()) {
    const ev = await buildEvent(db, recs[0].source_type, recs[0].source_id);
    if (ev.skip) { out.push({ event_key: recs[0].event_key, skipped: ev.skip }); continue; }
    const ctx = await loadContext(db, ev);
    if (ctx.skip) { out.push({ event_key: ev.event_key, skipped: ctx.skip }); continue; }
    const { recipients } = await resolveRecipients(db, ctx.request.project_id, ev.actor_type === 'client_contact' ? ev.actor_id : null);
    const map = new Map(recipients.map((r) => [r.email, r]));
    const allowed = recs.filter((r) => map.has(r.recipient_email));
    const revoked = recs.filter((r) => !map.has(r.recipient_email));
    await Promise.allSettled(revoked.map((r) => db.ClientFeedbackNotification.update(r.id, { error: 'Not retried: recipient no longer authorized', attempts: MAX_ATTEMPTS })));
    out.push({ event_key: ev.event_key, results: await deliver(db, ev, ctx, allowed, map) });
  }
  return { retried: failed.length, out };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const { action, sourceType, sourceId, requestId } = await req.json().catch(() => ({}));

    if (action === 'dispatch') {
      if (!sourceType || !sourceId) return Response.json({ error: 'sourceType and sourceId are required' }, { status: 400 });
      const result = await dispatch(db, sourceType, String(sourceId));
      console.log(JSON.stringify({ event: 'CLIENT_FEEDBACK_NOTIFY', sourceType, sourceId, ...result }));
      return Response.json({ success: true, ...result });
    }

    if (action === 'overview' || action === 'retry') {
      const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!requestId) return Response.json({ error: 'requestId is required' }, { status: 400 });
      if (action === 'retry') return Response.json({ success: true, ...(await retryFailed(db, requestId)) });
      const request = await nf(db.ClientFeedbackRequest.get(requestId));
      if (!request) return Response.json({ error: 'Request not found' }, { status: 404 });
      const [records, preview] = await Promise.all([
        db.ClientFeedbackNotification.filter({ request_id: requestId }, '-created_date', 100),
        resolveRecipients(db, request.project_id, null),
      ]);
      return Response.json({
        records: records.map((r) => ({
          id: r.id, event_type: r.event_type, actor_name: r.actor_name, recipient_name: r.recipient_name, recipient_email: r.recipient_email,
          status: r.status, error: r.error || null, attempts: r.attempts || 0, sent_at: r.sent_at || null, created_date: r.created_date,
        })),
        recipients: preview.recipients.map(({ name, email, access_role }) => ({ name, email, access_role })),
        excluded: preview.excluded.map(({ name, email, reason }) => ({ name, email, reason })),
        is_draft: request.status === 'draft',
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('notifyClientFeedbackContacts error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});