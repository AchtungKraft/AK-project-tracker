import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * markInvoiceSent — UNIFIED: Mutate billing state ONLY here
 *
 * RULES (unchanged semantics):
 * 1. Transitions draft → sent ONLY
 * 2. Part lines: PartCommitment.invoiced_qty/invoiced_amount += line, billing_status=invoiced
 * 3. Service lines: ServiceCommitment.is_billed=true, invoice_id
 * 4. Deduct credit (credit_proposed, FIFO over positive balances) HERE — single deduction point
 *
 * IDEMPOTENCY HARDENING:
 * - Per-project compare-and-set billing lock (unchanged) + conditional draft → sent update.
 * - Stable key inv_sent:{id} (was timestamp-based, so it never deduplicated anything).
 * - Before deducting, the planned deductions are journaled on the invoice (credit_application_plan, state 'pending').
 *   Each deduction is a conditional update on the ledger row's current balance, so a balance that changed underneath
 *   is detected instead of overwritten.
 * - Any failure after source/credit mutations rolls everything back (credits, part and service commitments).
 *   If the process dies mid-way, the next attempt reconciles the pending journal (restores what was deducted)
 *   before deducting again; if a ledger row no longer matches the journal it stops for admin review.
 * - { self_test: true } (admin only) runs the scenarios below against an in-memory database. It never touches real records.
 */

const SEND_KEY = (id) => `inv_sent:${id}`;
const STALE_MS = 120000;
const conflict = (message, code) => Object.assign(new Error(message), { code });

async function acquireLock(db, projectId, owner) {
  const token = `${owner}_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  let ok = (await db.projectCas({ id: projectId, billing_lock_token: null }, { billing_lock_token: token, billing_lock_at: now })) === 1;
  if (!ok) {
    const p = await db.getProject(projectId);
    if (p?.billing_lock_token && p.billing_lock_at && Date.now() - new Date(p.billing_lock_at).getTime() > STALE_MS) {
      ok = (await db.projectCas({ id: projectId, billing_lock_token: p.billing_lock_token }, { billing_lock_token: token, billing_lock_at: now })) === 1;
    }
  }
  if (!ok) return null;
  return () => db.projectCas({ id: projectId, billing_lock_token: token }, { billing_lock_token: null, billing_lock_at: null })
    .catch((e) => console.error('[markInvoiceSent] lock release failed', e.message));
}

// Undo deductions made under `key`; only touches rows still exactly as this send left them. Returns ids that couldn't be restored.
async function restoreCredits(db, entries, key) {
  const stuck = [];
  for (const e of entries) {
    const n = await db.creditCas({ id: e.credit_id, remaining_amount: e.after, credit_idempotency_key: key }, {
      remaining_amount: e.before, applied_to_invoice_id: e.prev_applied_to_invoice_id ?? null, credit_idempotency_key: e.prev_credit_idempotency_key ?? null,
    });
    if (n !== 1) {
      const c = await db.getCredit(e.credit_id);
      if (!c || c.remaining_amount !== e.before) stuck.push(e.credit_id);
    }
  }
  return stuck;
}

// A previous attempt died with a pending journal: restore what it deducted so this attempt starts clean.
async function reconcilePendingPlan(db, inv, key) {
  const plan = inv.credit_application_plan || [];
  if (inv.credit_plan_state !== 'pending' || plan.length === 0) return false;
  const applied = [];
  const ambiguous = [];
  for (const e of plan) {
    const c = await db.getCredit(e.credit_id);
    if (c && c.remaining_amount === e.after && c.credit_idempotency_key === key) applied.push(e);
    else if (!c || c.remaining_amount !== e.before) ambiguous.push({ credit_id: e.credit_id, expected: [e.before, e.after], actual: c?.remaining_amount ?? null });
  }
  if (ambiguous.length) throw Object.assign(conflict('Credit ledger no longer matches an earlier interrupted send. Admin review required before sending.', 'CREDIT_NEEDS_REVIEW'), { ambiguous });
  const stuck = await restoreCredits(db, applied, key);
  if (stuck.length) throw Object.assign(conflict('Could not restore credits from an earlier interrupted send.', 'CREDIT_NEEDS_REVIEW'), { ambiguous: stuck });
  await db.invoiceCas({ id: inv.id, status: 'draft' }, { credit_application_plan: [], credit_plan_state: null });
  return true;
}

async function applyCredits(db, inv, key, journal) {
  const creditToApply = inv.credit_proposed ?? inv.credit_applied ?? 0;
  if (creditToApply <= 0) return { creditToApply, applied: 0 };
  const available = (await db.findCredits({ project_id: inv.project_id }))
    .filter((c) => (c.remaining_amount ?? 0) > 0)
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  const plan = [];
  let remaining = creditToApply;
  for (const c of available) {
    if (remaining <= 0) break;
    const toApply = Math.min(c.remaining_amount, remaining);
    if (toApply <= 0) continue;
    plan.push({ credit_id: c.id, amount: toApply, before: c.remaining_amount, after: c.remaining_amount - toApply,
      prev_applied_to_invoice_id: c.applied_to_invoice_id ?? null, prev_credit_idempotency_key: c.credit_idempotency_key ?? null });
    remaining -= toApply;
  }
  if (plan.length === 0) return { creditToApply, applied: 0 };
  if ((await db.invoiceCas({ id: inv.id, status: 'draft' }, { credit_application_plan: plan, credit_plan_state: 'pending' })) !== 1) {
    throw conflict('Invoice changed during send', 'INVOICE_CHANGED');
  }
  let applied = 0;
  for (const e of plan) {
    const n = await db.creditCas({ id: e.credit_id, remaining_amount: e.before }, { remaining_amount: e.after, applied_to_invoice_id: inv.id, credit_idempotency_key: key });
    if (n !== 1) throw conflict('A credit balance changed while sending. Nothing was applied; try again.', 'CREDIT_CONFLICT');
    journal.push(e);
    applied += e.amount;
  }
  return { creditToApply, applied };
}

async function rollbackSources(db, commitmentUpdates, serviceUpdates) {
  for (const u of commitmentUpdates) {
    try {
      const c = await db.getCommitment(u.source_id);
      if (c) await db.updateCommitment(u.source_id, {
        invoiced_qty: Math.max(0, (c.invoiced_qty ?? 0) - u.qty_added),
        invoiced_amount: Math.max(0, (c.invoiced_amount ?? 0) - u.amount_added),
        billing_status: u.prev_billing_status ?? 'unbilled',
      });
    } catch (e) { console.error(`Rollback failed for ${u.source_id}:`, e); }
  }
  for (const u of serviceUpdates) {
    try {
      await db.updateService(u.source_id, { is_billed: false, invoice_id: null, billed_date: null, status: 'completed' });
    } catch (e) { console.error(`Service rollback failed for ${u.source_id}:`, e); }
  }
}

async function markSent(db, { invoice_id, qb_invoice_number, issue_date, due_date }) {
  const invoice = await db.getInvoice(invoice_id);
  if (!invoice) return [404, { error: 'Invoice not found' }];
  if (invoice.status !== 'draft') return [400, { error: `Cannot mark as sent: invoice is ${invoice.status}, must be draft` }];

  const release = await acquireLock(db, invoice.project_id, `inv_${invoice_id}`);
  if (!release) return [409, { success: false, error: 'Another invoice for this project is being finalized. Try again in a moment.', code: 'BILLING_LOCKED' }];
  try {
    let fresh = await db.getInvoice(invoice_id);
    if (fresh.status !== 'draft') return [409, { error: `Cannot mark as sent: invoice is ${fresh.status}, must be draft` }];
    const key = SEND_KEY(invoice_id);
    try {
      if (await reconcilePendingPlan(db, fresh, key)) fresh = await db.getInvoice(invoice_id);
    } catch (e) {
      return [409, { success: false, error: e.message, code: e.code, ambiguous: e.ambiguous }];
    }

    const lines = await db.listLines(invoice_id);

    // PHASE 0: eligibility re-check (unchanged)
    const partQtyBySource = new Map();
    const serviceSources = new Set();
    for (const line of lines) {
      if (line.type === 'part') {
        const sid = line.source_id || line.part_commitment_id;
        if (sid) partQtyBySource.set(sid, (partQtyBySource.get(sid) ?? 0) + (line.qty ?? 0));
      } else if (line.type === 'service' && line.source_id) serviceSources.add(line.source_id);
    }
    const ineligible = [];
    for (const [sid, qty] of partQtyBySource) {
      const c = await db.getCommitment(sid);
      if (!c) continue;
      const effective = Math.max(0, (c.required_total ?? 0) - (c.qty_removed ?? 0));
      const available = Math.max(0, effective - (c.invoiced_qty ?? 0));
      if (qty > available + 1e-9) ineligible.push({ source_id: sid, type: 'part', reason: 'EXCEEDS_UNINVOICED_QTY', line_qty: qty, available_qty: available });
    }
    for (const sid of serviceSources) {
      const sc = await db.getService(sid);
      if (sc?.invoice_id && sc.invoice_id !== invoice_id) ineligible.push({ source_id: sid, type: 'service', reason: 'ALREADY_BILLED', billed_on_invoice_id: sc.invoice_id });
    }
    if (ineligible.length) {
      return [409, { success: false, error: 'Invoice contains items already invoiced on another invoice. Edit or cancel this draft before sending.', ineligible }];
    }

    // PHASE 1: source billing state (unchanged math)
    const commitmentUpdates = [];
    const serviceUpdates = [];
    const failures = [];
    for (const line of lines) {
      if (line.type === 'part') {
        const sourceId = line.source_id || line.part_commitment_id;
        if (!sourceId) continue;
        try {
          const c = await db.getCommitment(sourceId);
          if (!c) { failures.push({ source_id: sourceId, type: 'part', error: 'PartCommitment not found' }); continue; }
          const newInvoicedQty = (c.invoiced_qty ?? 0) + (line.qty ?? 0);
          const newInvoicedAmount = (c.invoiced_amount ?? 0) + (line.line_total ?? 0);
          await db.updateCommitment(sourceId, { invoiced_qty: newInvoicedQty, invoiced_amount: newInvoicedAmount, billing_status: 'invoiced' });
          commitmentUpdates.push({ source_id: sourceId, qty_added: line.qty ?? 0, amount_added: line.line_total ?? 0, new_invoiced_qty: newInvoicedQty, new_invoiced_amount: newInvoicedAmount, prev_billing_status: c.billing_status });
        } catch (err) { failures.push({ source_id: sourceId, type: 'part', error: err.message }); }
      }
      if (line.type === 'service') {
        const sourceId = line.source_id;
        if (!sourceId) continue;
        try {
          await db.updateService(sourceId, { is_billed: true, invoice_id, billed_date: new Date().toISOString().split('T')[0], status: 'billed' });
          serviceUpdates.push({ source_id: sourceId, amount_billed: line.line_total ?? 0 });
        } catch (err) {
          console.error(`[markInvoiceSent] Failed to mark service ${sourceId} as billed:`, err.message);
          failures.push({ source_id: sourceId, type: 'service', error: err.message });
        }
      }
    }
    const strip = (u) => { const { prev_billing_status, ...rest } = u; return rest; };
    if (failures.length) {
      await rollbackSources(db, commitmentUpdates, serviceUpdates);
      return [500, { success: false, error: 'Some source record updates failed — invoice NOT sent, all changes rolled back', failures }];
    }

    // PHASE 2 + 3: deduct credit, then draft → sent. Any failure rolls back credits and sources.
    const journal = [];
    let creditToApply = 0;
    let actualCreditApplied = 0;
    try {
      ({ creditToApply, applied: actualCreditApplied } = await applyCredits(db, fresh, key, journal));
      const balanceDue = Math.max(0, (fresh.subtotal ?? 0) - actualCreditApplied);
      const won = await db.invoiceCas({ id: invoice_id, status: 'draft' }, {
        status: 'sent', qb_invoice_number, issue_date, due_date, credit_applied: actualCreditApplied, balance_due: balanceDue,
        credit_idempotency_key: key, credit_plan_state: journal.length ? 'applied' : null,
      });
      if (won !== 1) throw conflict('Invoice changed during send', 'INVOICE_CHANGED');
      return [200, {
        success: true, invoice_id, status: 'sent', qb_invoice_number, issue_date, due_date,
        credit_proposed: creditToApply, credit_applied: actualCreditApplied, balance_due: balanceDue,
        commitment_updates: commitmentUpdates.map(strip), service_updates: serviceUpdates,
      }];
    } catch (err) {
      // The final write may have committed before the error surfaced — never undo a completed send.
      const now = await db.getInvoice(invoice_id).catch(() => null);
      if (now?.status === 'sent' && now.credit_idempotency_key === key) {
        return [200, {
          success: true, invoice_id, status: 'sent', qb_invoice_number, issue_date, due_date,
          credit_proposed: creditToApply, credit_applied: now.credit_applied, balance_due: now.balance_due,
          commitment_updates: commitmentUpdates.map(strip), service_updates: serviceUpdates,
        }];
      }
      const stuck = await restoreCredits(db, journal, key);
      if (!stuck.length) await db.invoiceCas({ id: invoice_id, status: 'draft' }, { credit_application_plan: [], credit_plan_state: null }).catch(() => {});
      await rollbackSources(db, commitmentUpdates, serviceUpdates);
      const isConflict = err.code === 'CREDIT_CONFLICT' || err.code === 'INVOICE_CHANGED';
      return [isConflict ? 409 : 500, {
        success: false, code: err.code, credit_restore_failed: stuck,
        error: `Invoice NOT sent — ${err.message}. Credit and billing changes were rolled back${stuck.length ? ' except credits listed in credit_restore_failed (retry will reconcile them)' : ''}.`,
      }];
    }
  } finally {
    await release();
  }
}

function realDb(base44) {
  const sr = base44.asServiceRole.entities;
  return {
    getInvoice: async (id) => (await base44.entities.ProjectInvoice.filter({ id }))[0] || null,
    listLines: (invoice_id) => base44.entities.ProjectInvoiceLine.filter({ invoice_id }),
    getCommitment: async (id) => (await base44.entities.PartCommitment.filter({ id }))[0] || null,
    updateCommitment: (id, d) => sr.PartCommitment.update(id, d),
    getService: async (id) => (await base44.entities.ServiceCommitment.filter({ id }))[0] || null,
    updateService: (id, d) => sr.ServiceCommitment.update(id, d),
    invoiceCas: async (q, set) => (await sr.ProjectInvoice.updateMany(q, { $set: set })).updated,
    findCredits: (q) => base44.entities.ProjectCreditLedger.filter(q),
    getCredit: async (id) => (await base44.entities.ProjectCreditLedger.filter({ id }))[0] || null,
    creditCas: async (q, set) => (await sr.ProjectCreditLedger.updateMany(q, { $set: set })).updated,
    getProject: (id) => sr.Project.get(id).catch((e) => (e.status === 404 ? null : Promise.reject(e))),
    projectCas: async (q, set) => (await sr.Project.updateMany(q, { $set: set })).updated,
  };
}

// ───────────── In-memory test harness (never touches real records) ─────────────
function mockDb(seed, faults = {}) {
  const T = {};
  for (const k of ['invoices', 'lines', 'commitments', 'services', 'credits', 'projects']) T[k] = new Map((seed[k] || []).map((r) => [r.id, structuredClone(r)]));
  const calls = {};
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const hit = async (name) => {
    await tick();
    const n = (calls[name] = (calls[name] || 0) + 1);
    const f = faults[name];
    if (f?.before) f.before(n, T);
    if (f?.throwOn?.includes(n)) throw new Error(`injected ${name} failure #${n}`);
    return n;
  };
  const match = (r, q) => Object.entries(q).every(([k, v]) => (v === null ? r[k] == null : r[k] === v));
  const cas = async (name, map, q, set) => {
    const n = await hit(name);
    let u = 0;
    for (const r of map.values()) if (match(r, q)) { Object.assign(r, structuredClone(set)); u++; }
    if (faults[name]?.throwAfterOn?.includes(n)) throw new Error(`injected ${name} post-commit failure #${n}`);
    return u;
  };
  const find = async (name, map, q) => { await hit(name); return [...map.values()].filter((r) => match(r, q)).map((r) => structuredClone(r)); };
  const upd = (name, map) => async (id, d) => { await hit(name); Object.assign(map.get(id), d); };
  return {
    T,
    getInvoice: async (id) => (await find('getInvoice', T.invoices, { id }))[0] || null,
    listLines: (invoice_id) => find('listLines', T.lines, { invoice_id }),
    getCommitment: async (id) => (await find('getCommitment', T.commitments, { id }))[0] || null,
    updateCommitment: upd('updateCommitment', T.commitments),
    getService: async (id) => (await find('getService', T.services, { id }))[0] || null,
    updateService: upd('updateService', T.services),
    invoiceCas: (q, set) => cas('invoiceCas', T.invoices, q, set),
    findCredits: (q) => find('findCredits', T.credits, q),
    getCredit: async (id) => (await find('getCredit', T.credits, { id }))[0] || null,
    creditCas: (q, set) => cas('creditCas', T.credits, q, set),
    getProject: async (id) => (await find('getProject', T.projects, { id }))[0] || null,
    projectCas: (q, set) => cas('projectCas', T.projects, q, set),
  };
}

async function runSelfTest() {
  const ARGS = { invoice_id: 'inv1', qb_invoice_number: 'Q-1', issue_date: '2026-11-08', due_date: '2026-12-08' };
  const CREDITS = [
    { id: 'c1', project_id: 'p1', credit_amount: 200, remaining_amount: 200, created_date: '2026-01-01T00:00:00Z' },
    { id: 'c2', project_id: 'p1', credit_amount: 150, remaining_amount: 150, created_date: '2026-02-01T00:00:00Z', applied_to_invoice_id: 'invOld', credit_idempotency_key: 'inv_sent_invOld_1' },
    { id: 'c3', project_id: 'p1', credit_amount: 80, remaining_amount: 0, created_date: '2025-12-01T00:00:00Z' },
    { id: 'cx', project_id: 'p2', credit_amount: 999, remaining_amount: 999, created_date: '2025-01-01T00:00:00Z' },
  ];
  const seed = (inv = {}, extra = {}) => mockDb({
    invoices: [{ id: 'inv1', project_id: 'p1', status: 'draft', invoice_type: 'progress', subtotal: 1000, credit_proposed: 300, credit_applied: 0, ...inv }],
    lines: [
      { id: 'l1', invoice_id: 'inv1', type: 'part', source_id: 'pc1', qty: 2, line_total: 600 },
      { id: 'l2', invoice_id: 'inv1', type: 'service', source_id: 'sc1', line_total: 400 },
    ],
    commitments: [{ id: 'pc1', required_total: 2, invoiced_qty: 0, invoiced_amount: 0, billing_status: 'unbilled' }],
    services: [{ id: 'sc1', is_billed: false, invoice_id: null, status: 'completed' }],
    credits: extra.credits || CREDITS,
    projects: [{ id: 'p1', billing_lock_token: extra.lockToken ?? null, billing_lock_at: extra.lockAt ?? null }],
  }, extra.faults);
  const run = (db, args = {}) => markSent(db, { ...ARGS, ...args }).catch((e) => [500, { error: e.message }]);
  const bal = (db) => Object.fromEntries([...db.T.credits.values()].map((c) => [c.id, c.remaining_amount]));
  const deducted = (db, start = CREDITS) => start.reduce((s, c) => s + (c.remaining_amount - db.T.credits.get(c.id).remaining_amount), 0);
  const inv = (db) => db.T.invoices.get('inv1');
  const pc = (db) => db.T.commitments.get('pc1');
  const sc = (db) => db.T.services.get('sc1');
  const unlocked = (db) => db.T.projects.get('p1').billing_lock_token == null;
  const cleanDraft = (db) => inv(db).status === 'draft' && !(inv(db).credit_application_plan || []).length && pc(db).invoiced_qty === 0
    && pc(db).billing_status === 'unbilled' && !sc(db).is_billed && deducted(db) === 0 && db.T.credits.get('c2').credit_idempotency_key === 'inv_sent_invOld_1' && unlocked(db);
  const sentOnce = (db) => inv(db).status === 'sent' && inv(db).credit_applied === 300 && inv(db).balance_due === 700 && deducted(db) === 300
    && pc(db).invoiced_qty === 2 && pc(db).invoiced_amount === 600 && sc(db).is_billed && bal(db).cx === 999 && unlocked(db);
  const results = [];
  const test = async (name, fn) => {
    try { const detail = await fn(); results.push({ name, pass: detail.pass, detail }); }
    catch (e) { results.push({ name, pass: false, detail: { error: e.message } }); }
  };

  await test('happy path: FIFO credit 300 over balances 200+150; other project untouched', async () => {
    const db = seed();
    const [s, b] = await run(db);
    return { pass: s === 200 && b.credit_applied === 300 && sentOnce(db) && bal(db).c1 === 0 && bal(db).c2 === 50 && inv(db).credit_idempotency_key === 'inv_sent:inv1' && inv(db).credit_plan_state === 'applied', balances: bal(db) };
  });
  await test('repeat after success: rejected, no second deduction', async () => {
    const db = seed();
    await run(db);
    const r = await Promise.all([run(db), run(db)]);
    return { pass: r.every(([s]) => s === 400) && sentOnce(db), statuses: r.map((x) => x[0]) };
  });
  await test('5 concurrent sends: one wins, credit deducted once', async () => {
    const db = seed();
    const r = await Promise.all(Array.from({ length: 5 }, () => run(db)));
    return { pass: r.filter(([s]) => s === 200).length === 1 && sentOnce(db), statuses: r.map((x) => x[0]) };
  });
  await test('failure on final invoice write: credits + sources rolled back; retry deducts once', async () => {
    const db = seed({}, { faults: { invoiceCas: { throwOn: [2] } } });
    const [s1] = await run(db);
    const mid = { clean: cleanDraft(db), balances: bal(db) };
    const [s2] = await run(db);
    return { pass: s1 === 500 && mid.clean && s2 === 200 && sentOnce(db), mid };
  });
  await test('failure mid-deduction (2nd ledger row): first row restored; retry deducts once', async () => {
    const db = seed({}, { faults: { creditCas: { throwOn: [2] } } });
    const [s1] = await run(db);
    const mid = cleanDraft(db);
    const [s2] = await run(db);
    return { pass: s1 === 500 && mid && s2 === 200 && sentOnce(db) };
  });
  await test('final write committed but response errored: treated as sent, credits NOT restored', async () => {
    const db = seed({}, { faults: { invoiceCas: { throwAfterOn: [2] } } });
    const [s] = await run(db);
    return { pass: s === 200 && sentOnce(db) };
  });
  await test('crash recovery: pending journal with c1 already deducted → reconciled, total deduction stays 300', async () => {
    const crashed = CREDITS.map((c) => (c.id === 'c1' ? { ...c, remaining_amount: 0, applied_to_invoice_id: 'inv1', credit_idempotency_key: 'inv_sent:inv1' } : c));
    const db = seed({ credit_plan_state: 'pending', credit_application_plan: [
      { credit_id: 'c1', amount: 200, before: 200, after: 0, prev_applied_to_invoice_id: null, prev_credit_idempotency_key: null },
      { credit_id: 'c2', amount: 100, before: 150, after: 50, prev_applied_to_invoice_id: 'invOld', prev_credit_idempotency_key: 'inv_sent_invOld_1' },
    ] }, { credits: crashed });
    const [s] = await run(db);
    return { pass: s === 200 && sentOnce(db) && bal(db).c1 === 0 && bal(db).c2 === 50, balances: bal(db) };
  });
  await test('crash recovery with ledger changed by someone else: stops for review, nothing changed', async () => {
    const changed = CREDITS.map((c) => (c.id === 'c1' ? { ...c, remaining_amount: 120 } : c));
    const db = seed({ credit_plan_state: 'pending', credit_application_plan: [{ credit_id: 'c1', amount: 200, before: 200, after: 0 }] }, { credits: changed });
    const before = JSON.stringify([...db.T.invoices.values(), ...db.T.credits.values(), ...db.T.commitments.values(), ...db.T.services.values()]);
    const [s, b] = await run(db);
    const after = JSON.stringify([...db.T.invoices.values(), ...db.T.credits.values(), ...db.T.commitments.values(), ...db.T.services.values()]);
    return { pass: s === 409 && b.code === 'CREDIT_NEEDS_REVIEW' && before === after && unlocked(db), code: b.code };
  });
  await test('ledger balance changes between read and deduction: conflict, everything rolled back', async () => {
    const db = seed({}, { faults: { creditCas: { before: (n, T) => { if (n === 1) T.credits.get('c1').remaining_amount = 50; } } } });
    const [s, b] = await run(db);
    const okRollback = inv(db).status === 'draft' && pc(db).invoiced_qty === 0 && !sc(db).is_billed && bal(db).c1 === 50 && bal(db).c2 === 150;
    return { pass: s === 409 && b.code === 'CREDIT_CONFLICT' && okRollback && unlocked(db), balances: bal(db) };
  });
  await test('existing balance smaller than proposed: applies only what exists', async () => {
    const db = seed({}, { credits: [{ id: 'c1', project_id: 'p1', credit_amount: 100, remaining_amount: 100, created_date: '2026-01-01T00:00:00Z' }] });
    const [s, b] = await run(db);
    return { pass: s === 200 && b.credit_applied === 100 && inv(db).balance_due === 900 && bal(db).c1 === 0 };
  });
  await test('no credit proposed: no journal written, ledger untouched', async () => {
    const db = seed({ credit_proposed: 0 });
    const [s] = await run(db);
    return { pass: s === 200 && inv(db).status === 'sent' && deducted(db) === 0 && !(inv(db).credit_application_plan || []).length && inv(db).credit_plan_state == null };
  });
  await test('source update failure (service): rolled back, no credit touched', async () => {
    const db = seed({}, { faults: { updateService: { throwOn: [1] } } });
    const [s1] = await run(db);
    const mid = cleanDraft(db);
    const [s2] = await run(db);
    return { pass: s1 === 500 && mid && s2 === 200 && sentOnce(db) };
  });
  await test('rollback restores prior billing_status of a partially invoiced commitment', async () => {
    const db = mockDb({
      invoices: [{ id: 'inv1', project_id: 'p1', status: 'draft', subtotal: 300, credit_proposed: 0 }],
      lines: [{ id: 'l1', invoice_id: 'inv1', type: 'part', source_id: 'pc1', qty: 1, line_total: 300 }],
      commitments: [{ id: 'pc1', required_total: 3, invoiced_qty: 1, invoiced_amount: 300, billing_status: 'invoiced' }],
      projects: [{ id: 'p1', billing_lock_token: null }],
    }, { invoiceCas: { throwOn: [1] } });
    const [s] = await run(db);
    const c = db.T.commitments.get('pc1');
    return { pass: s === 500 && c.invoiced_qty === 1 && c.invoiced_amount === 300 && c.billing_status === 'invoiced', commitment: c };
  });
  await test('lock held by another finalization: 409, nothing changed', async () => {
    const db = seed({}, { lockToken: 'other', lockAt: new Date().toISOString() });
    const [s] = await run(db);
    return { pass: s === 409 && inv(db).status === 'draft' && deducted(db) === 0 && pc(db).invoiced_qty === 0 };
  });

  return { function: 'markInvoiceSent', mock_only: true, passed: results.filter((r) => r.pass).length, total: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    // SDK 0.8.25 rejects signed-out callers without a status code, only a message.
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status ?? e.response?.status) || /authentication required/i.test(e.message) ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (body.self_test) {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      return Response.json(await runSelfTest());
    }

    const { invoice_id, qb_invoice_number, issue_date, due_date } = body;
    if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });
    if (!qb_invoice_number) return Response.json({ error: 'qb_invoice_number required' }, { status: 400 });
    if (!issue_date) return Response.json({ error: 'issue_date required' }, { status: 400 });
    if (!due_date) return Response.json({ error: 'due_date required' }, { status: 400 });

    const [status, payload] = await markSent(realDb(base44), { invoice_id, qb_invoice_number, issue_date, due_date });
    return Response.json(payload, { status });
  } catch (error) {
    console.error('markInvoiceSent error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});