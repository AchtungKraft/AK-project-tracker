import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * cancelProjectInvoice — UNIFIED (admin only)
 *
 * - Draft: nothing was mutated. Proposed credit is only a reservation; cancelling releases it (no ledger change,
 *   nothing to restore, nothing that could be counted twice).
 * - Sent: reverse part/service billing state and return credit applied at send to the ledger rows it came from.
 *   Each returned portion is an 'apply_reversal' deposit-journal entry (application cancel:{invoice}) that reverses
 *   the send-time 'apply' entry (send:{invoice}). No new or general credit is created.
 *   Legacy sends without journal entries are journaled first from the invoice's own deduction record
 *   (credit_application_plan). If the source of applied credit is unknown, cancellation stops for admin review.
 * - Deposit applied after sending (Apply Available Deposit) must be reversed under Project Deposits first.
 * - Paid: cannot cancel.
 * Runs under the shared per-project billing lock with conditional updates. { self_test: true } runs on an in-memory db.
 */

const STALE_MS = 120000;
const cents = (n) => Math.round((Number(n) || 0) * 100);
const fail = (http, code, error, extra = {}) => Object.assign(new Error(error), { http, code, extra });

async function withLock(db, projectId, owner, fn) {
  const token = `${owner}_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  let ok = (await db.projectCas({ id: projectId, billing_lock_token: null }, { billing_lock_token: token, billing_lock_at: now })) === 1;
  if (!ok) {
    const p = await db.getProject(projectId);
    if (p?.billing_lock_token && p.billing_lock_at && Date.now() - new Date(p.billing_lock_at).getTime() > STALE_MS) {
      ok = (await db.projectCas({ id: projectId, billing_lock_token: p.billing_lock_token }, { billing_lock_token: token, billing_lock_at: now })) === 1;
    }
  }
  if (!ok) throw fail(409, 'BILLING_LOCKED', 'Another billing action for this project is in progress. Try again in a moment.');
  try { return await fn(); } finally {
    await db.projectCas({ id: projectId, billing_lock_token: token }, { billing_lock_token: null, billing_lock_at: null }).catch((e) => console.error('[cancelProjectInvoice] lock release failed', e.message));
  }
}

// Send-time applications for this invoice, journaling legacy sends from credit_application_plan when needed.
async function sendPortions(db, inv, actor) {
  const appId = `send:${inv.id}`;
  let rows = await db.findTx({ application_id: appId });
  const plan = inv.credit_plan_state === 'applied' ? (inv.credit_application_plan || []) : [];
  if (!rows.length && plan.length) {
    const out = [];
    for (const [i, e] of plan.entries()) {
      const c = await db.getCredit(e.credit_id);
      out.push({ type: 'apply', project_id: inv.project_id, application_id: appId, idempotency_key: `${appId}:${i}`, credit_ledger_id: e.credit_id,
        source_invoice_id: c?.source_invoice_id || null, target_invoice_id: inv.id, amount_cents: cents(e.amount), ledger_before_cents: cents(e.before), ledger_after_cents: cents(e.after),
        note: 'Applied when the invoice was sent (journaled at cancellation)', actor_email: actor, recorded_at: new Date().toISOString(), transaction_date: inv.issue_date || null });
    }
    await db.createTx(out);
    rows = await db.findTx({ application_id: appId });
  }
  return rows.filter((t) => t.type === 'apply' && cents(t.amount_cents / 100) > 0);
}

async function restoreSendCredit(db, inv, actor, reason) {
  const appliedC = cents(inv.credit_applied);
  if (appliedC < 1) return 0;
  const portions = await sendPortions(db, inv, actor);
  if (!portions.length) throw fail(409, 'CREDIT_SOURCE_UNKNOWN', `This invoice carries ${(appliedC / 100).toFixed(2)} of applied credit with no recorded source deposit. Nothing was changed; an administrator must review it before cancelling.`);
  const sentC = portions.reduce((s, t) => s + t.amount_cents, 0);
  if (Math.abs(sentC - appliedC) > 1) throw fail(409, 'CREDIT_MISMATCH', 'Credit applied on this invoice does not match its send record. Nothing was changed; an administrator must review it.', { applied_cents: appliedC, journaled_cents: sentC });
  const done = new Set((await db.findTx({ application_id: `cancel:${inv.id}` })).map((t) => t.reverses_transaction_id));
  const todo = portions.filter((t) => !done.has(t.id));
  // Validate every row before changing any of them.
  const rows = new Map();
  for (const t of todo) {
    const row = await db.getCredit(t.credit_ledger_id);
    const rk = `cancel:${inv.id}:${t.id}`;
    if (!row) throw fail(409, 'CREDIT_NEEDS_REVIEW', 'A deposit credit behind this invoice no longer exists. Nothing was changed.');
    if (row.credit_idempotency_key !== rk && cents(row.remaining_amount) + t.amount_cents > cents(row.credit_amount) + 1) throw fail(409, 'CREDIT_NEEDS_REVIEW', 'Returning this credit would exceed its original deposit. Nothing was changed; an administrator must review it.');
    rows.set(t.id, row);
  }
  for (const t of todo) {
    const row = rows.get(t.id); const rk = `cancel:${inv.id}:${t.id}`;
    const already = row.credit_idempotency_key === rk; // an earlier attempt restored it but stopped before journaling
    const beforeC = already ? cents(row.remaining_amount) - t.amount_cents : cents(row.remaining_amount);
    if (!already) {
      const won = await db.creditCas({ id: row.id, remaining_amount: row.remaining_amount }, { remaining_amount: (beforeC + t.amount_cents) / 100, credit_idempotency_key: rk });
      if (won !== 1) throw fail(409, 'CREDIT_CHANGED', 'Client credit changed during cancellation. Run the cancellation again; it continues where it stopped.');
    }
    try {
      await db.createTx([{ type: 'apply_reversal', project_id: inv.project_id, application_id: `cancel:${inv.id}`, idempotency_key: rk, reverses_transaction_id: t.id,
        credit_ledger_id: row.id, source_invoice_id: t.source_invoice_id, target_invoice_id: inv.id, amount_cents: t.amount_cents, ledger_before_cents: beforeC,
        ledger_after_cents: beforeC + t.amount_cents, note: reason || 'Invoice cancelled', actor_email: actor, recorded_at: new Date().toISOString(), transaction_date: new Date().toISOString().slice(0, 10) }]);
    } catch (e) {
      if (!already) await db.creditCas({ id: row.id, credit_idempotency_key: rk }, { remaining_amount: row.remaining_amount, credit_idempotency_key: row.credit_idempotency_key ?? null }).catch(() => {});
      throw e;
    }
  }
  return sentC;
}

async function revertSources(db, invoice_id) {
  const commitment_results = []; const service_results = [];
  for (const line of await db.listLines(invoice_id)) {
    if (line.type === 'part') {
      const id = line.source_id || line.part_commitment_id;
      if (!id) continue;
      try {
        const c = await db.getCommitment(id);
        if (!c) { commitment_results.push({ source_id: id, status: 'skipped', reason: 'not_found' }); continue; }
        const qty = Math.max(0, (c.invoiced_qty ?? 0) - (line.qty ?? 0));
        const to = qty <= 0 ? 'unbilled' : 'invoiced';
        await db.updateCommitment(id, { invoiced_qty: qty, invoiced_amount: Math.max(0, (c.invoiced_amount ?? 0) - (line.line_total ?? 0)), billing_status: to });
        commitment_results.push({ source_id: id, status: 'reverted', from: c.billing_status, to });
      } catch (err) { commitment_results.push({ source_id: id, status: 'error', error: err.message }); }
    }
    if (line.type === 'service' && line.source_id) {
      try {
        const sc = await db.getService(line.source_id);
        if (sc?.invoice_id && sc.invoice_id !== invoice_id) { service_results.push({ source_id: line.source_id, status: 'skipped', reason: 'billed_on_other_invoice' }); continue; }
        await db.updateService(line.source_id, { is_billed: false, invoice_id: null, billed_date: null, status: 'completed' });
        service_results.push({ source_id: line.source_id, status: 'reverted' });
      } catch (err) { service_results.push({ source_id: line.source_id, status: 'error', error: err.message }); }
    }
  }
  return { commitment_results, service_results };
}

async function cancelInvoice(db, { invoice_id, reason, user_email }) {
  const invoice = await db.getInvoice(invoice_id);
  if (!invoice) throw fail(404, 'NOT_FOUND', 'Invoice not found');
  if (invoice.status === 'cancelled') return { success: true, idempotent: true, message: 'Already cancelled', invoice_id };
  if (invoice.status === 'paid') throw fail(400, 'PAID', 'Cannot cancel a paid invoice. Use refund flow.');
  if (!['draft', 'sent'].includes(invoice.status)) throw fail(400, 'BAD_STATUS', `Cannot cancel invoice in status: ${invoice.status}`);
  const meta = { cancelled_at: new Date().toISOString(), cancelled_by: user_email };

  if (invoice.status === 'draft') {
    const won = await db.invoiceCas({ id: invoice_id, status: 'draft' }, { status: 'cancelled', ...meta, cancellation_reason: reason || 'Draft cancelled' });
    if (won !== 1) throw fail(409, 'INVOICE_CHANGED', 'Invoice status changed while cancelling. Refresh and try again.');
    return { success: true, invoice_id, previous_status: 'draft', new_status: 'cancelled', source_rollback_needed: false, credit_reversed: 0, credit_reservation_released: cents(invoice.credit_proposed) / 100 };
  }

  return withLock(db, invoice.project_id, `cancel_${invoice_id}`, async () => {
    const fresh = await db.getInvoice(invoice_id);
    if (!fresh || fresh.status !== 'sent') throw fail(409, 'INVOICE_CHANGED', `Invoice is now ${fresh?.status || 'missing'}; nothing was reversed. Refresh and try again.`);
    const txs = await db.findTx({ target_invoice_id: invoice_id });
    const reversed = new Set(txs.filter((t) => t.reverses_transaction_id).map((t) => t.reverses_transaction_id));
    if (txs.some((t) => t.type === 'apply' && !/^send:/.test(t.application_id) && !reversed.has(t.id))) {
      throw fail(409, 'DEPOSIT_APPLIED', 'A project deposit is applied to this invoice. Reverse the deposit application under Project Deposits first, then cancel.');
    }
    const restoredC = await restoreSendCredit(db, fresh, user_email, reason);
    const sources = await revertSources(db, invoice_id);
    const won = await db.invoiceCas({ id: invoice_id, status: 'sent' }, { status: 'cancelled', ...meta, cancellation_reason: reason || null, credit_reversed: restoredC / 100, reversal_idempotency_key: `cancel:${invoice_id}` });
    if (won !== 1) throw fail(409, 'INVOICE_CHANGED', 'Invoice changed during cancellation. Credit was returned to its deposit; run the cancellation again to finish.');
    return { success: true, invoice_id, previous_status: 'sent', new_status: 'cancelled', source_rollback_needed: true, ...sources, credit_reversed: restoredC / 100, credit_returned_to_original_deposit: restoredC > 0 };
  });
}

function realDb(base44) {
  const sr = base44.asServiceRole.entities;
  const first = async (E, id) => (await E.filter({ id }).catch((e) => (/not a valid record id/i.test(e.message) ? [] : Promise.reject(e))))[0] || null;
  return {
    getInvoice: (id) => first(sr.ProjectInvoice, id),
    invoiceCas: async (q, set) => (await sr.ProjectInvoice.updateMany(q, { $set: set })).updated,
    getProject: (id) => first(sr.Project, id),
    projectCas: async (q, set) => (await sr.Project.updateMany(q, { $set: set })).updated,
    listLines: (invoice_id) => sr.ProjectInvoiceLine.filter({ invoice_id }),
    getCommitment: (id) => first(sr.PartCommitment, id),
    updateCommitment: (id, d) => sr.PartCommitment.update(id, d),
    getService: (id) => first(sr.ServiceCommitment, id),
    updateService: (id, d) => sr.ServiceCommitment.update(id, d),
    getCredit: (id) => first(sr.ProjectCreditLedger, id),
    creditCas: async (q, set) => (await sr.ProjectCreditLedger.updateMany(q, { $set: set })).updated,
    findTx: (q) => sr.DepositTransaction.filter(q, 'created_date', 5000),
    createTx: (rows) => sr.DepositTransaction.bulkCreate(rows),
  };
}

// ───────────── In-memory test harness (never touches real records) ─────────────
function mockDb(seed, faults = {}) {
  const T = {};
  for (const k of ['invoices', 'lines', 'commitments', 'services', 'credits', 'projects', 'txs']) T[k] = new Map((seed[k] || []).map((r) => [r.id, structuredClone(r)]));
  let seq = 0; const calls = {};
  const hit = async (n) => { await new Promise((r) => setTimeout(r, 0)); calls[n] = (calls[n] || 0) + 1; if (faults[n]?.includes(calls[n])) throw new Error(`injected ${n} failure`); };
  const match = (r, q) => Object.entries(q).every(([k, v]) => (v === null ? r[k] == null : r[k] === v));
  const find = async (n, m, q) => { await hit(n); return [...m.values()].filter((r) => match(r, q)).map((r) => structuredClone(r)); };
  const cas = async (n, m, q, s) => { await hit(n); let u = 0; for (const r of m.values()) if (match(r, q)) { Object.assign(r, structuredClone(s)); u++; } return u; };
  const one = (n, m) => async (id) => (await find(n, m, { id }))[0] || null;
  return {
    T,
    getInvoice: one('getInvoice', T.invoices), invoiceCas: (q, s) => cas('invoiceCas', T.invoices, q, s),
    getProject: one('getProject', T.projects), projectCas: (q, s) => cas('projectCas', T.projects, q, s),
    listLines: (invoice_id) => find('listLines', T.lines, { invoice_id }),
    getCommitment: one('getCommitment', T.commitments), updateCommitment: async (id, d) => { await hit('updateCommitment'); Object.assign(T.commitments.get(id), d); },
    getService: one('getService', T.services), updateService: async (id, d) => { await hit('updateService'); Object.assign(T.services.get(id), d); },
    getCredit: one('getCredit', T.credits), creditCas: (q, s) => cas('creditCas', T.credits, q, s),
    findTx: (q) => find('findTx', T.txs, q),
    createTx: async (rows) => { await hit('createTx'); for (const r of rows) { const id = `tx${++seq}`; T.txs.set(id, { id, ...structuredClone(r) }); } },
  };
}

async function runSelfTest() {
  // After send: invoice inv1 (1000) took 300 from deposit credit c1 (dep1, 300 → 100 after a 100 earlier... ) and 50 from c2 (dep2).
  const seed = (over = {}, extra = {}) => mockDb({
    invoices: [
      { id: 'inv1', project_id: 'p1', status: 'sent', invoice_type: 'progress', subtotal: 1000, credit_applied: 350, balance_due: 650, credit_plan_state: 'applied',
        credit_application_plan: [{ credit_id: 'c1', amount: 300, before: 300, after: 0 }, { credit_id: 'c2', amount: 50, before: 200, after: 150 }], ...over },
      { id: 'dep1', project_id: 'p1', invoice_type: 'deposit', status: 'paid' }, { id: 'dep2', project_id: 'p1', invoice_type: 'deposit', status: 'paid' },
      ...(extra.invoices || []),
    ],
    lines: [{ id: 'l1', invoice_id: 'inv1', type: 'part', source_id: 'pc1', qty: 2, line_total: 600 }, { id: 'l2', invoice_id: 'inv1', type: 'service', source_id: 'sc1', line_total: 400 }],
    commitments: [{ id: 'pc1', invoiced_qty: 2, invoiced_amount: 600, billing_status: 'invoiced' }],
    services: [{ id: 'sc1', is_billed: true, invoice_id: 'inv1', status: 'billed' }],
    credits: [
      { id: 'c1', project_id: 'p1', source_invoice_id: 'dep1', credit_amount: 300, remaining_amount: 0, credit_idempotency_key: 'inv_sent:inv1' },
      { id: 'c2', project_id: 'p1', source_invoice_id: 'dep2', credit_amount: 200, remaining_amount: 150, credit_idempotency_key: 'inv_sent:inv1' },
      ...(extra.credits || []),
    ],
    projects: [{ id: 'p1', billing_lock_token: extra.lock ?? null, billing_lock_at: extra.lock ? new Date().toISOString() : null }],
    txs: extra.txs || [
      { id: 's1', type: 'apply', project_id: 'p1', application_id: 'send:inv1', credit_ledger_id: 'c1', source_invoice_id: 'dep1', target_invoice_id: 'inv1', amount_cents: 30000 },
      { id: 's2', type: 'apply', project_id: 'p1', application_id: 'send:inv1', credit_ledger_id: 'c2', source_invoice_id: 'dep2', target_invoice_id: 'inv1', amount_cents: 5000 },
    ],
  }, extra.faults);
  const run = (db, id = 'inv1') => cancelInvoice(db, { invoice_id: id, reason: 'test', user_email: 't@x' }).then((r) => [200, r]).catch((e) => [e.http || 500, { code: e.code, error: e.message }]);
  const rem = (db, id) => db.T.credits.get(id).remaining_amount;
  const inv = (db) => db.T.invoices.get('inv1');
  const txs = (db) => [...db.T.txs.values()];
  const unlocked = (db) => db.T.projects.get('p1').billing_lock_token == null;
  const results = [];
  const test = async (name, fn) => { try { const d = await fn(); results.push({ name, pass: !!d.pass, detail: d }); } catch (e) { results.push({ name, pass: false, detail: { error: e.message } }); } };

  await test('cancel sent invoice: credit returned to the original deposits, journaled, no new credit, sources reverted', async () => {
    const db = seed(); const [s, b] = await run(db);
    const rev = txs(db).filter((t) => t.type === 'apply_reversal');
    return { pass: s === 200 && b.credit_reversed === 350 && rem(db, 'c1') === 300 && rem(db, 'c2') === 200 && db.T.credits.size === 2 && rev.length === 2
      && rev.map((t) => t.reverses_transaction_id).sort().join() === 's1,s2' && rev.map((t) => t.source_invoice_id).sort().join() === 'dep1,dep2'
      && inv(db).status === 'cancelled' && db.T.commitments.get('pc1').invoiced_qty === 0 && db.T.commitments.get('pc1').billing_status === 'unbilled' && !db.T.services.get('sc1').is_billed && unlocked(db) };
  });
  await test('cancel retried: nothing restored twice', async () => {
    const db = seed(); await run(db); const [s, b] = await run(db);
    return { pass: s === 200 && b.idempotent && rem(db, 'c1') === 300 && rem(db, 'c2') === 200 && txs(db).filter((t) => t.type === 'apply_reversal').length === 2 };
  });
  await test('journal write fails mid-way: first portion kept, second rolled back; retry finishes without double restore', async () => {
    const db = seed({}, { faults: { createTx: [2] } });
    const [s1] = await run(db); const mid = { c1: rem(db, 'c1'), c2: rem(db, 'c2'), st: inv(db).status, unlocked: unlocked(db) };
    const [s2] = await run(db);
    return { pass: s1 === 500 && mid.c1 === 300 && mid.c2 === 150 && mid.st === 'sent' && mid.unlocked && s2 === 200 && rem(db, 'c1') === 300 && rem(db, 'c2') === 200 && txs(db).filter((t) => t.type === 'apply_reversal').length === 2 && inv(db).status === 'cancelled', mid };
  });
  await test('legacy send without journal: journaled from its deduction record, then returned to source', async () => {
    const db = seed({}, { txs: [] }); const [s] = await run(db);
    const t = txs(db);
    return { pass: s === 200 && t.filter((x) => x.application_id === 'send:inv1').length === 2 && t.filter((x) => x.type === 'apply_reversal').length === 2 && rem(db, 'c1') === 300 && rem(db, 'c2') === 200 && db.T.credits.size === 2 };
  });
  await test('applied credit with no known source: blocked, nothing changed', async () => {
    const db = seed({ credit_plan_state: null, credit_application_plan: [] }, { txs: [] });
    const before = JSON.stringify([...db.T.credits.values(), ...db.T.commitments.values(), inv(db)]);
    const [s, b] = await run(db);
    return { pass: s === 409 && b.code === 'CREDIT_SOURCE_UNKNOWN' && before === JSON.stringify([...db.T.credits.values(), ...db.T.commitments.values(), inv(db)]) && unlocked(db) };
  });
  await test('deposit applied after sending must be reversed first; after that reversal, cancel proceeds', async () => {
    const extraTx = [{ id: 'm1', type: 'apply', project_id: 'p1', application_id: 'MANUAL', credit_ledger_id: 'c2', source_invoice_id: 'dep2', target_invoice_id: 'inv1', amount_cents: 1000 }];
    const db = seed({}, { txs: [...seed().T.txs.values(), ...extraTx] });
    const [s1, b1] = await run(db);
    db.T.txs.set('m1r', { id: 'm1r', type: 'apply_reversal', project_id: 'p1', application_id: 'REV', reverses_transaction_id: 'm1', credit_ledger_id: 'c2', target_invoice_id: 'inv1', amount_cents: 1000 });
    const [s2] = await run(db);
    return { pass: s1 === 409 && b1.code === 'DEPOSIT_APPLIED' && s2 === 200 && rem(db, 'c1') === 300 && rem(db, 'c2') === 200 && inv(db).status === 'cancelled' };
  });
  await test('returning credit would exceed the original deposit: blocked for review', async () => {
    const db = seed(); db.T.credits.get('c1').remaining_amount = 100;
    const [s, b] = await run(db);
    return { pass: s === 409 && b.code === 'CREDIT_NEEDS_REVIEW' && rem(db, 'c1') === 100 && rem(db, 'c2') === 150 && inv(db).status === 'sent' };
  });
  await test('draft with proposed credit: cancelled, reservation released, ledger untouched', async () => {
    const db = seed({ status: 'draft', credit_applied: 0, credit_proposed: 120, credit_plan_state: null, credit_application_plan: [] }, { txs: [] });
    const [s, b] = await run(db);
    return { pass: s === 200 && b.credit_reservation_released === 120 && inv(db).status === 'cancelled' && rem(db, 'c1') === 0 && rem(db, 'c2') === 150 && txs(db).length === 0 };
  });
  await test('billing lock held elsewhere: refused, nothing changed', async () => {
    const db = seed({}, { lock: 'other' }); const [s] = await run(db);
    return { pass: s === 409 && rem(db, 'c1') === 0 && inv(db).status === 'sent' };
  });
  return { function: 'cancelProjectInvoice', mock_only: true, passed: results.filter((r) => r.pass).length, total: results.length, results };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status ?? e.response?.status) || /authentication required/i.test(e.message) ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (body.self_test) return Response.json(await runSelfTest());
    if (!body.invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });
    const out = await cancelInvoice(realDb(base44), { invoice_id: body.invoice_id, reason: body.reason, user_email: user.email })
      .catch((e) => (e.http ? { __err: e } : Promise.reject(e)));
    if (out?.__err) return Response.json({ success: false, code: out.__err.code, error: out.__err.message, ...out.__err.extra }, { status: out.__err.http });
    return Response.json(out);
  } catch (error) {
    console.error('cancelProjectInvoice error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});