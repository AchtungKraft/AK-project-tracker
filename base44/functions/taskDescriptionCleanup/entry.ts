import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Admin-only cleanup of the legacy auto-generated scope block appended to converted Task descriptions
// ("From scope review: …", Category / Group, costs, labor, total, notes, reference image URLs).
// preview   read-only: exact before/after per task, only where the block is positively identified.
// apply     ONE task per call, explicit confirm, hash-checked against the preview; original text preserved
//           in TaskDescriptionCleanupLog. Only Task.description changes.
// self_test in-memory fixtures; no database access.

const err = (status, error, extra = {}) => Response.json({ error, ...extra }, { status });
const isId = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(v);
const HEADER = 'From scope review: ';
const MONEY = /^(TBD|Not estimated|—|\$0|(From |Up to )?\$[\d,]+(\.\d+)?(–\$[\d,]+(\.\d+)?)?)$/;
const BULLET = /^ {2}• .+: .+ @ \$[\d.,]+\/hr$/;
const LABOR = /^AK labor: .+ \(.+\)$/;
const URL_LINE = /^https:\/\/\S+$/;

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Consume `${prefix}${note}` (note may span lines) at lines[j]; returns lines consumed or 0.
function matchNote(lines, j, prefix, notes) {
  for (const n of notes) {
    if (!n) continue;
    const want = `${prefix}${n}`.split('\n');
    if (want.every((w, k) => lines[j + k] === w)) return want.length;
  }
  return 0;
}

// Parse a generated block that starts at lines[i] and runs to the end. Returns true only if every line is accounted for.
function parseBlockFrom(lines, i, ctx) {
  let j = i;
  const title = lines[j].slice(HEADER.length);
  if (!ctx.titles.includes(title)) return false;
  j++;
  if (!(lines[j] || '').startsWith('Category / Group: ')) return false;
  j++;
  const cost = lines[j] || '';
  const costVal = cost.startsWith('Budget: ') ? cost.slice(8) : cost.startsWith('Hard cost / parts: ') ? cost.slice(19) : null;
  if (costVal == null || !MONEY.test(costVal)) return false;
  j++;
  if ((lines[j] || '').startsWith('Hard cost note: ')) { const n = matchNote(lines, j, 'Hard cost note: ', ctx.hardCostNotes); if (!n) return false; j += n; }
  if (LABOR.test(lines[j] || '')) { j++; while (BULLET.test(lines[j] || '')) j++; }
  if ((lines[j] || '').startsWith('Total estimate: ')) { if (!MONEY.test(lines[j].slice(16))) return false; j++; }
  if ((lines[j] || '').startsWith('Note: ')) { const n = matchNote(lines, j, 'Note: ', ctx.budgetNotes); if (!n) return false; j += n; }
  if (lines[j] === '' && lines[j + 1] === 'Reference images:') { j += 2; while (URL_LINE.test(lines[j] || '')) j++; }
  while (j < lines.length && lines[j].trim() === '') j++;
  return j === lines.length;
}

// Pure classifier. ctx: { titles, hardCostNotes, budgetNotes, sourceDescription }
export function classifyDescription(description, ctx) {
  const before = description || '';
  const lines = before.split('\n');
  const titles = [...new Set([...(ctx.titles || []).filter(Boolean), 'Scope Review'])];
  const c = { ...ctx, titles, hardCostNotes: ctx.hardCostNotes || [], budgetNotes: ctx.budgetNotes || [] };
  let sawHeader = false;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(HEADER)) continue;
    sawHeader = true;
    if (i > 0 && lines[i - 1] !== '') continue;
    if (!parseBlockFrom(lines, i, c)) continue;
    const after = (i === 0 ? '' : lines.slice(0, i - 1).join('\n')).replace(/\n+$/, '');
    const removed = lines.slice(i).join('\n');
    const source = (ctx.sourceDescription || '').trim();
    return { status: after === source ? 'ready' : 'narrative_edited', before, after, removed_block: removed };
  }
  return { status: sawHeader ? 'unrecognized' : 'no_block', before, after: null, removed_block: null };
}

async function listAll(E, query) {
  const out = [];
  let cursor;
  do {
    const page = await E.filter(query, { limit: 500, cursor });
    out.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return out;
}

async function loadCandidates(db, requestId) {
  const request = isId(requestId) ? (await db.ClientFeedbackRequest.filter({ id: requestId }, { limit: 1 })).items[0] : null;
  if (!request || request.request_type !== 'client_scope_review') return { error: err(404, 'Scope review not found.') };
  const [items, baselines] = await Promise.all([listAll(db.ScopeItem, { request_id: request.id }), listAll(db.ScopeEstimateBaseline, { request_id: request.id })]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const pairs = new Map();
  for (const b of baselines) if (b.task_id) pairs.set(b.task_id, { item: itemById.get(b.scope_item_id) || null, baseline: b });
  for (const i of items) for (const t of i.linked_task_ids || []) if (!pairs.has(t)) pairs.set(t, { item: i, baseline: null });
  const ids = [...pairs.keys()];
  const tasks = [];
  for (let k = 0; k < ids.length; k += 100) tasks.push(...(await listAll(db.Task, { id: { $in: ids.slice(k, k + 100) } })));
  return { request, rows: tasks.map((t) => ({ task: t, ...pairs.get(t.id) })) };
}

const ctxFor = (request, item, baseline) => ({
  titles: [request.title, baseline?.request_title],
  hardCostNotes: [baseline?.hard_cost_note, item?.hard_cost_note],
  budgetNotes: [baseline?.budget_note, item?.budget_note],
  sourceDescription: baseline?.description_snapshot ?? item?.description ?? '',
});

async function describeRow(request, { task, item, baseline }) {
  const c = ctxFor(request, item, baseline);
  const r = classifyDescription(task.description, c);
  // Never drop image links: every URL in the removed block must already be on Task.reference_images.
  const attached = new Set((task.reference_images || []).map((x) => x?.url));
  const missing_images = (r.removed_block || '').split('\n').filter((l) => URL_LINE.test(l) && !attached.has(l));
  if (missing_images.length) r.status = 'images_not_attached';
  return {
    missing_images,
    task_id: task.id, task_name: task.name, project_id: task.project_id,
    scope_item_id: item?.id || baseline?.scope_item_id || null, scope_item_title: item?.title || baseline?.title || null,
    source_description: c.sourceDescription, status: r.status,
    before: r.before, after: r.after, removed_block: r.removed_block, before_hash: await sha256(r.before),
  };
}

function selfTest() {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, pass: !!ok, ...(ok ? {} : { detail }) });
  const ctx = { titles: ['1975 Ice Green 911 Scope Review'], hardCostNotes: ['Misc Parts'], budgetNotes: ['Misc Parts'],
    sourceDescription: 'Review, replace and or recover any parts inside to ensure overall freshness: Knee pad, Door toppers \nKnobs change to matching, Fix any Misc Issues' };
  const interior = ctx.sourceDescription + '\n\nFrom scope review: 1975 Ice Green 911 Scope Review\nCategory / Group: CRITICAL FIXES / INTERIOR\nHard cost / parts: $200–$300\nHard cost note: Misc Parts\nAK labor: 4–12 hrs ($500–$1,500)\n  • UPHOLSTERY: 4–12 hrs @ $125/hr\nTotal estimate: $700–$1,800\nNote: Misc Parts';
  const r1 = classifyDescription(interior, ctx);
  check('Interior Updates // Fixes → ready, narrative restored exactly (multiline, inner trailing space kept)', r1.status === 'ready' && r1.after === ctx.sourceDescription, r1);
  check('idempotent: cleaned text has no block', classifyDescription(r1.after, ctx).status === 'no_block');
  const legit = 'Check labor estimate with Bob.\nTotal estimate is rough.\nNote: labor may vary';
  check('user text mentioning labor / estimate / Note: untouched', classifyDescription(legit, { ...ctx, sourceDescription: legit }).status === 'no_block');
  const uni = 'Sitzbezüge erneuern — Ölwanne prüfen 🚗\n日本語メモ';
  const uniBlock = `${uni}\n\nFrom scope review: 1975 Ice Green 911 Scope Review\nCategory / Group: INTÉRIEUR / SITZE\nHard cost / parts: TBD`;
  const r3 = classifyDescription(uniBlock, { ...ctx, sourceDescription: uni });
  check('Unicode narrative and category preserved', r3.status === 'ready' && r3.after === uni, r3);
  check('no generated block → no_block', classifyDescription('Just a task description', ctx).status === 'no_block');
  check('empty description → no_block', classifyDescription('', ctx).status === 'no_block');
  const editedBlock = interior.replace('Total estimate: $700–$1,800', 'Total estimate: $700–$1,800 (client asked to cap)');
  check('edited block line → unrecognized (not removable)', classifyDescription(editedBlock, ctx).status === 'unrecognized');
  check('user text appended after block → unrecognized', classifyDescription(interior + '\n\nTech note: knobs ordered', ctx).status === 'unrecognized');
  const editedNarr = interior.replace('Fix any Misc Issues', 'Fix any Misc Issues + new shift boot');
  const r4 = classifyDescription(editedNarr, ctx);
  check('edited narrative → narrative_edited, edited narrative kept', r4.status === 'narrative_edited' && r4.after.endsWith('+ new shift boot'), r4);
  check('wrong review title → not positively identified', classifyDescription(interior.replace('1975 Ice Green 911 Scope Review', 'Other Review'), ctx).status === 'unrecognized');
  check('note text not matching source → unrecognized', classifyDescription(interior, { ...ctx, budgetNotes: ['Different'], hardCostNotes: ['Misc Parts'] }).status === 'unrecognized');
  const mlNote = 'Line A\nLine B';
  const ml = `Desc\n\nFrom scope review: Scope Review\nCategory / Group: A / B\nHard cost / parts: $0\nNote: ${mlNote}`;
  check('multiline note consumed exactly', classifyDescription(ml, { titles: [], budgetNotes: [mlNote], sourceDescription: 'Desc' }).after === 'Desc');
  const legacy = 'Desc\n\nFrom scope review: Scope Review\nCategory / Group: A\nBudget: From $500\n\nReference images:\nhttps://x.example/a.png\nhttps://x.example/b.png';
  check('legacy budget + reference image URL block', classifyDescription(legacy, { titles: [], sourceDescription: 'Desc' }).status === 'ready');
  check('block-only description → empty after', classifyDescription('From scope review: Scope Review\nCategory / Group: A\nHard cost / parts: Not estimated', { titles: [], sourceDescription: '' }).after === '');
  check('header without blank separator mid-text → not removed', classifyDescription('Desc\nFrom scope review: Scope Review\nCategory / Group: A\nHard cost / parts: $0', { titles: [], sourceDescription: 'Desc' }).status === 'unrecognized');
  return { pass: results.every((r) => r.pass), passed: results.filter((r) => r.pass).length, total: results.length, results };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return err(401, 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'Admin only.');
    const body = await req.json().catch(() => ({}));
    if (body.action === 'self_test') return Response.json(selfTest());
    const db = base44.asServiceRole.entities;

    if (body.action === 'preview') {
      const { request, rows, error } = await loadCandidates(db, body.requestId);
      if (error) return error;
      const out = await Promise.all(rows.map((r) => describeRow(request, r)));
      return Response.json({ read_only: true, rows: out.sort((a, b) => (a.task_name || '').localeCompare(b.task_name || '')) });
    }

    if (body.action === 'apply') {
      if (body.confirm !== true) return err(400, 'Explicit confirm required.');
      if (!isId(body.taskId) || typeof body.expectedHash !== 'string') return err(400, 'taskId and expectedHash are required.');
      const { request, rows, error } = await loadCandidates(db, body.requestId);
      if (error) return error;
      const row = rows.find((r) => r.task.id === body.taskId);
      if (!row) return err(404, 'Task is not a converted task of this scope review.');
      const d = await describeRow(request, row);
      if (d.status === 'no_block') {
        const prior = (await db.TaskDescriptionCleanupLog.filter({ task_id: d.task_id, status: 'applied' }, { limit: 1 })).items[0];
        return Response.json({ success: true, already_clean: true, log_id: prior?.id || null });
      }
      if (d.before_hash !== body.expectedHash) return err(409, 'Task description changed since preview. Refresh and review again.');
      if (d.status === 'unrecognized') return err(400, 'Generated block could not be positively identified; not changed.');
      if (d.status === 'images_not_attached') return err(400, 'The block lists image links not yet attached to the task. Run the task image backfill first.');
      if (d.status === 'narrative_edited' && body.acknowledgeEdited !== true) return err(400, 'Narrative was edited after conversion; acknowledge to keep the edited text and remove only the generated block.');
      const log = await db.TaskDescriptionCleanupLog.create({
        task_id: d.task_id, project_id: d.project_id, scope_item_id: d.scope_item_id || '', request_id: request.id,
        classification: d.status, status: 'pending', description_before: d.before, description_after: d.after,
        removed_block: d.removed_block, before_hash: d.before_hash, after_hash: await sha256(d.after), applied_by_email: user.email,
      });
      // Compare-and-set: only updates if the description is still exactly the previewed text.
      await db.Task.updateMany({ id: d.task_id, description: d.before }, { $set: { description: d.after } });
      const now = (await db.Task.filter({ id: d.task_id }, { limit: 1 })).items[0];
      const ok = now?.description === d.after;
      await db.TaskDescriptionCleanupLog.update(log.id, ok ? { status: 'applied', applied_at: new Date().toISOString() } : { status: 'failed', error: 'Description changed concurrently; not applied.' });
      if (!ok) return err(409, 'Task description changed concurrently; not applied.');
      return Response.json({ success: true, task_id: d.task_id, log_id: log.id, after: d.after });
    }
    return err(400, 'Unknown action.');
  } catch (e) {
    return err(500, e?.message || 'Unexpected error');
  }
});