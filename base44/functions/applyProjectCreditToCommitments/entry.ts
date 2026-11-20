import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * applyProjectCreditToCommitments — Settle parts with GENERAL project credit (no invoice).
 *
 * INPUT: { project_id, commitment_ids?, mode: 'auto'|'manual', allocations?: [{credit_ledger_id, commitment_id, amount}],
 *          dry_run (default true), settle_parts }   |   { self_test: true } (in-memory only)
 *
 * CREDIT RULES (shared with invoice drafts, sends, deposit/general applications and cancellations):
 *  - General credit only. Deposit credit (ledger row from a payment on a deposit invoice) is never drawn here.
 *  - The spendable amount is the CANONICAL figure from projectDepositAction credit_availability
 *    (available_general): general credit remaining minus what active drafts reserve (split general + legacy any-credit
 *    reservations). Sent invoices already reduced remaining_amount, so they are not subtracted again; cancelled or
 *    deleted drafts reserve nothing.
 *  - Execution holds the shared per-project billing lock (same token as markInvoiceSent, createProjectInvoiceDraft,
 *    projectDepositAction, cancelProjectInvoice, deleteDraftInvoice), recalculates availability inside the lock, and
 *    updates each ledger row with compare-and-set. Any change underneath rolls everything back (409).
 *  - Exposure already counts existing allocations, so a repeated request allocates nothing twice. Existing
 *    CreditAllocation records are never edited.
 */

const STALE_MS = 120000;
const DEPOSIT_LOGIC_VERSION = 'dep-v2';
const cents = (n) => Math.round((Number(n) || 0) * 100);
const fail = (http, code, error, extra = {}) => Object.assign(new Error(error), { http, code, extra });
const fifo = (a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id));

function generateAllocationKey(ledgerId, commitmentId, amount, timestamp) {
  const input = `${ledgerId}:${commitmentId || 'project'}:${amount}:${Math.floor(timestamp / 60000)}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) { hash = ((hash << 5) - hash) + input.charCodeAt(i); hash = hash & hash; }
  return `alloc_${Math.abs(hash).toString(36)}`;
}

async function acquireLock(db, projectId) {
  const token = `settle_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  let ok = (await db.projectCas({ id: projectId, billing_lock_token: null }, { billing_lock_token: token, billing_lock_at: now })) === 1;
  if (!ok) {
    const p = await db.getProject(projectId);
    if (p?.billing_lock_token && p.billing_lock_at && Date.now() - new Date(p.billing_lock_at).getTime() > STALE_MS) {
      ok = (await db.projectCas({ id: projectId, billing_lock_token: p.billing_lock_token }, { billing_lock_token: token, billing_lock_at: now })) === 1;
    }
  }
  if (!ok) throw fail(409, 'BILLING_LOCKED', 'Another billing action for this project is in progress. Try again in a moment.');
  return () => db.projectCas({ id: projectId, billing_lock_token: token }, { billing_lock_token: null, billing_lock_at: null })
    .catch((e) => console.error('[applyProjectCreditToCommitments] lock release failed', e.message));
}

async function loadState(db, project_id) {
  const [project, commitments, credits, allocations, depositInvoices, av] = await Promise.all([
    db.getProject(project_id), db.findCommitments(project_id), db.findCredits(project_id),
    db.findAllocations(project_id), db.findDepositInvoices(project_id), db.availability(project_id),
  ]);
  if (!project) throw fail(404, 'NOT_FOUND', 'Project not found');
  if (!av?.success || av.logic_version !== DEPOSIT_LOGIC_VERSION) throw new Error('Credit availability unavailable or version mismatch');
  return { commitments, credits, allocations: allocations.filter((a) => !a.is_reversed), depIds: new Set(depositInvoices.map((i) => i.id)), av };
}

function exposureOf(c, allocations) {
  const grossC = cents((c.unit_retail_snapshot || 0) * (c.required_total || 0));
  const invoicedC = cents(c.invoiced_amount);
  const creditC = allocations.filter((a) => a.commitment_id === c.id).reduce((s, a) => s + cents(a.amount_applied), 0);
  return { grossC, invoicedC, creditC, netC: Math.max(0, grossC - invoicedC - creditC) };
}

// Pure planning: never spends more than the canonical available general credit, per-row balances, or exposure.
function buildPlan(st, { commitment_ids, mode, allocations: manual }, now) {
  let targets = st.commitments.filter((c) => c.billing_status !== 'paid' && c.commitment_status !== 'cancelled');
  if (commitment_ids?.length) targets = targets.filter((c) => commitment_ids.includes(c.id));
  const exps = targets.map((c) => ({ commitment_id: c.id, part_id: c.part_id, required_total: c.required_total || 0, ...exposureOf(c, st.allocations) }));
  const rows = st.credits
    .filter((c) => cents(c.remaining_amount) >= 1 && (c.reversed_from_invoice_id || !st.depIds.has(c.source_invoice_id)))
    .sort(fifo);
  const availC = Math.max(0, cents(st.av.available_general));
  const bal = new Map(rows.map((r) => [r.id, cents(r.remaining_amount)]));
  const existingKeys = new Set(st.allocations.map((a) => a.allocation_key).filter(Boolean));
  const plan = [];
  let budgetC = availC;
  const take = (rowId, commitmentId, c) => {
    const key = generateAllocationKey(rowId, commitmentId, c / 100, now);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    plan.push({ credit_ledger_id: rowId, commitment_id: commitmentId || null, amount_c: c, allocation_key: key });
    bal.set(rowId, bal.get(rowId) - c);
    budgetC -= c;
    return true;
  };

  if (mode === 'auto') {
    for (const e of [...exps].filter((x) => x.netC > 0).sort((a, b) => b.netC - a.netC)) {
      let need = e.netC;
      for (const r of rows) {
        if (need <= 0 || budgetC <= 0) break;
        const c = Math.min(need, bal.get(r.id), budgetC);
        if (c > 0 && take(r.id, e.commitment_id, c)) need -= c;
      }
    }
  } else if (mode === 'manual' && Array.isArray(manual)) {
    const used = new Map();
    for (const a of manual) {
      const c = cents(a?.amount);
      if (!a?.credit_ledger_id || c <= 0) continue;
      const lb = bal.get(a.credit_ledger_id) ?? 0;
      if (c > lb) throw fail(400, 'EXCEEDS_LEDGER', `Allocation exceeds available general credit in ledger ${a.credit_ledger_id}`, { available: lb / 100, requested: c / 100 });
      if (c > budgetC) throw fail(400, 'EXCEEDS_AVAILABLE_GENERAL_CREDIT', `Allocation exceeds available general project credit ($${(budgetC / 100).toFixed(2)} after draft reservations).`, { available: budgetC / 100, requested: c / 100 });
      if (a.commitment_id) {
        const e = exps.find((x) => x.commitment_id === a.commitment_id);
        if (!e) throw fail(400, 'NOT_ELIGIBLE', `Commitment ${a.commitment_id} not found or not eligible`);
        const u = used.get(a.commitment_id) || 0;
        if (u + c > e.netC) throw fail(400, 'EXCEEDS_EXPOSURE', 'Allocation exceeds commitment exposure', { commitment_id: a.commitment_id, exposure: (e.netC - u) / 100, requested: c / 100 });
        used.set(a.commitment_id, u + c);
      }
      take(a.credit_ledger_id, a.commitment_id, c);
    }
  }

  const per = exps.map((e) => {
    const newC = plan.filter((p) => p.commitment_id === e.commitment_id).reduce((s, p) => s + p.amount_c, 0);
    const totalC = e.creditC + newC;
    const remC = Math.max(0, e.netC - newC);
    return { commitment_id: e.commitment_id, part_id: e.part_id, required_total: e.required_total,
      gross: e.grossC / 100, invoiced: e.invoicedC / 100, credit_applied_existing: e.creditC / 100,
      credit_applied_new: newC / 100, credit_applied_total: totalC / 100, net: remC / 100, will_be_settled: remC === 0 && totalC > 0 };
  });
  const toApplyC = plan.reduce((s, p) => s + p.amount_c, 0);
  const sum = (k) => exps.reduce((s, e) => s + e[k], 0);
  return { plan, per, rows, bal, availC, toApplyC,
    totals: { grossC: sum('grossC'), invoicedC: sum('invoicedC'), alreadyC: sum('creditC') } };
}

function summaryOf(st, p, settle) {
  const appliedTotalC = p.totals.alreadyC + p.toApplyC;
  return {
    gross_exposure: p.totals.grossC / 100,
    credit_available: p.availC / 100, // canonical: general credit net of draft reservations
    general_credit_balance: st.av.general_balance,
    credit_reserved_by_drafts: Math.round((st.av.reserved_general + st.av.reserved_legacy) * 100) / 100,
    credit_already_applied: p.totals.alreadyC / 100,
    credit_to_apply: p.toApplyC / 100,
    credit_applied_total: appliedTotalC / 100,
    net_exposure: Math.max(0, p.totals.grossC - p.totals.invoicedC - appliedTotalC) / 100,
    allocations_count: p.plan.length,
    commitments_to_settle: settle ? p.per.filter((c) => c.will_be_settled).length : 0,
    commitments_partially_settled: p.per.filter((c) => c.credit_applied_new > 0 && !c.will_be_settled).length,
  };
}

async function settle(db, payload, now = Date.now()) {
  const { project_id, mode = 'auto', dry_run = true, settle_parts = false } = payload;
  if (!project_id) throw fail(400, 'NO_PROJECT', 'project_id is required');

  if (dry_run) {
    const st = await loadState(db, project_id);
    const p = buildPlan(st, { ...payload, mode }, now);
    return { success: true, dry_run: true, project_id, mode, settle_parts, logic_version: DEPOSIT_LOGIC_VERSION,
      summary: summaryOf(st, p, settle_parts),
      allocation_plan: p.plan.map(({ amount_c, ...a }) => ({ ...a, amount_applied: amount_c / 100 })),
      per_commitment: p.per,
      available_credits: p.rows.map((c) => ({ id: c.id, original_amount: c.credit_amount, remaining_before: c.remaining_amount, remaining_after: p.bal.get(c.id) / 100 })) };
  }

  const release = await acquireLock(db, project_id);
  try {
    // Recalculated inside the lock: no invoice send, draft, deposit application or other settlement can interleave.
    const st = await loadState(db, project_id);
    const p = buildPlan(st, { ...payload, mode }, now);
    const moves = [];
    const created = [];
    const rollback = async () => {
      for (const a of created) await db.deleteAllocation(a.id).catch((e) => console.error('[settle] allocation rollback failed', a.id, e.message));
      for (const m of moves.reverse()) await db.creditCas({ id: m.id, remaining_amount: m.after }, { remaining_amount: m.before })
        .catch((e) => console.error('[settle] ledger rollback failed', m.id, e.message));
    };
    try {
      const byRow = new Map();
      for (const a of p.plan) byRow.set(a.credit_ledger_id, (byRow.get(a.credit_ledger_id) || 0) + a.amount_c);
      for (const [id, takeC] of byRow) {
        const row = p.rows.find((r) => r.id === id);
        const afterC = cents(row.remaining_amount) - takeC;
        if (afterC < 0) throw fail(409, 'CREDIT_CHANGED', 'Credit balance changed. Nothing was applied; refresh and try again.');
        const won = await db.creditCas({ id, remaining_amount: row.remaining_amount }, { remaining_amount: afterC / 100 });
        if (won !== 1) throw fail(409, 'CREDIT_CHANGED', 'Credit balance changed while settling. Nothing was applied; refresh and try again.');
        moves.push({ id, before: row.remaining_amount, after: afterC / 100 });
      }
      for (const a of p.plan) {
        created.push(await db.createAllocation({ project_id, credit_ledger_id: a.credit_ledger_id, commitment_id: a.commitment_id,
          amount_applied: a.amount_c / 100, allocation_mode: mode, allocation_key: a.allocation_key, is_reversed: false }));
      }
    } catch (e) { await rollback(); throw e; }

    const settled = [];
    if (settle_parts) {
      for (const c of p.per.filter((x) => x.will_be_settled)) {
        await db.updateCommitment(c.commitment_id, { billing_status: 'paid', invoiced_amount: c.gross, invoiced_qty: c.required_total });
        settled.push(c.commitment_id);
      }
    }
    const s = summaryOf(st, p, settle_parts);
    return { success: true, dry_run: false, project_id, mode, settle_parts, logic_version: DEPOSIT_LOGIC_VERSION,
      summary: { ...s, credit_applied_now: s.credit_to_apply, allocations_created: created.length, commitments_settled: settled.length },
      created_allocations: created.map((a) => a.id), settled_commitments: settled, per_commitment: p.per };
  } finally { await release(); }
}

function realDb(base44) {
  const sr = base44.asServiceRole.entities;
  const all = (E, q) => E.filter(q, 'created_date', 5000);
  return {
    getProject: async (id) => (await sr.Project.filter({ id }))[0] || null,
    projectCas: async (q, set) => (await sr.Project.updateMany(q, { $set: set })).updated,
    findCommitments: (project_id) => all(sr.PartCommitment, { project_id }),
    findCredits: (project_id) => all(sr.ProjectCreditLedger, { project_id }),
    findAllocations: (project_id) => all(sr.CreditAllocation, { project_id, is_reversed: false }),
    findDepositInvoices: (project_id) => all(sr.ProjectInvoice, { project_id, invoice_type: 'deposit' }),
    availability: async (project_id) => (await base44.functions.invoke('projectDepositAction', { action: 'credit_availability', project_id })).data,
    creditCas: async (q, set) => (await sr.ProjectCreditLedger.updateMany(q, { $set: set })).updated,
    createAllocation: (d) => sr.CreditAllocation.create(d),
    deleteAllocation: (id) => sr.CreditAllocation.delete(id),
    updateCommitment: (id, d) => base44.entities.PartCommitment.update(id, d),
  };
}

// ───────────── In-memory test harness (never touches real records) ─────────────
// The mock availability mirrors projectDepositAction pools() exactly so the tests exercise the same semantics.
function mockAvailability(T, project_id) {
  const inv = [...T.invoices.values()].filter((i) => i.project_id === project_id);
  const dep = new Set(inv.filter((i) => i.invoice_type === 'deposit').map((i) => i.id));
  const rows = [...T.credits.values()].filter((c) => c.project_id === project_id && cents(c.remaining_amount) >= 1);
  const kind = (c) => (!c.reversed_from_invoice_id && dep.has(c.source_invoice_id) ? 'deposit' : 'general');
  const r = { deposit: 0, general: 0, legacy: 0 };
  for (const i of inv) {
    if (i.status !== 'draft') continue;
    if (i.credit_selection_mode === 'split') { r.deposit += cents(i.credit_proposed_deposit); r.general += cents(i.credit_proposed_general); } else r.legacy += cents(i.credit_proposed);
  }
  const pool = (k) => rows.filter((c) => kind(c) === k).reduce((s, c) => s + cents(c.remaining_amount), 0);
  const capC = pool('deposit') + pool('general') - r.deposit - r.general - r.legacy;
  const avail = (k) => Math.max(0, Math.min(pool(k) - r[k], capC));
  return { success: true, logic_version: DEPOSIT_LOGIC_VERSION, available_deposit: avail('deposit') / 100, available_general: avail('general') / 100,
    deposit_balance: pool('deposit') / 100, general_balance: pool('general') / 100, reserved_general: r.general / 100, reserved_legacy: r.legacy / 100, reserved_deposit: r.deposit / 100 };
}

function mockDb(seed, faults = {}) {
  const T = {};
  for (const k of ['projects', 'invoices', 'credits', 'allocations', 'commitments']) T[k] = new Map((seed[k] || []).map((r) => [r.id, { ...r }]));
  let n = 0;
  const cas = (tbl, q, set) => {
    const r = tbl.get(q.id);
    if (!r || !Object.entries(q).every(([k, v]) => (r[k] ?? null) === (v ?? null))) return 0;
    Object.assign(r, set); return 1;
  };
  const db = {
    T,
    getProject: async (id) => (T.projects.has(id) ? { ...T.projects.get(id) } : null),
    projectCas: async (q, s) => cas(T.projects, q, s),
    findCommitments: async (pid) => [...T.commitments.values()].filter((c) => c.project_id === pid).map((c) => ({ ...c })),
    findCredits: async (pid) => [...T.credits.values()].filter((c) => c.project_id === pid).map((c) => ({ ...c })),
    findAllocations: async (pid) => [...T.allocations.values()].filter((a) => a.project_id === pid && !a.is_reversed).map((a) => ({ ...a })),
    findDepositInvoices: async (pid) => [...T.invoices.values()].filter((i) => i.project_id === pid && i.invoice_type === 'deposit'),
    availability: async (pid) => {
      const av = mockAvailability(T, pid);
      if (faults.afterAvailability) { faults.afterAvailability(T); faults.afterAvailability = null; }
      return av;
    },
    creditCas: async (q, s) => cas(T.credits, q, s),
    createAllocation: async (d) => {
      if (faults.allocationFailAt != null && T.allocations.size >= faults.allocationFailAt) throw new Error('simulated allocation failure');
      const r = { id: `a${++n}`, ...d }; T.allocations.set(r.id, r); return r;
    },
    deleteAllocation: async (id) => { T.allocations.delete(id); },
    updateCommitment: async (id, d) => { Object.assign(T.commitments.get(id), d); },
  };
  return db;
}

// Simulates markInvoiceSent's split draw for one draft: deducts its reserved credit FIFO from the right kind, marks sent.
function simulateSend(T, invId) {
  const inv = T.invoices.get(invId);
  const dep = new Set([...T.invoices.values()].filter((i) => i.invoice_type === 'deposit').map((i) => i.id));
  const kind = (c) => (!c.reversed_from_invoice_id && dep.has(c.source_invoice_id) ? 'deposit' : 'general');
  let ok = true;
  for (const [k, amt] of [['deposit', inv.credit_proposed_deposit || 0], ['general', inv.credit_proposed_general || 0]]) {
    let need = cents(amt);
    for (const c of [...T.credits.values()].filter((x) => kind(x) === k).sort(fifo)) {
      const t = Math.min(need, cents(c.remaining_amount)); c.remaining_amount = (cents(c.remaining_amount) - t) / 100; need -= t;
    }
    if (need > 0) ok = false;
  }
  Object.assign(inv, { status: 'sent', credit_applied: (inv.credit_proposed_deposit || 0) + (inv.credit_proposed_general || 0) });
  return ok;
}

async function runSelfTest() {
  const GEN = (amt, id = 'g1', extra = {}) => ({ id, project_id: 'p1', source_invoice_id: 'w1', credit_amount: amt, remaining_amount: amt, created_date: '2026-01-01', ...extra });
  const DEP = (amt) => ({ id: 'd1', project_id: 'p1', source_invoice_id: 'dep1', credit_amount: amt, remaining_amount: amt, created_date: '2025-12-01' });
  const PART = (retail, id = 'c1', extra = {}) => ({ id, project_id: 'p1', part_id: 'x', unit_retail_snapshot: retail, required_total: 1, invoiced_amount: 0, billing_status: 'not_invoiced', ...extra });
  const DRAFT = (id, gen, extra = {}) => ({ id, project_id: 'p1', invoice_type: 'progress', status: 'draft', credit_selection_mode: 'split', credit_proposed_deposit: 0, credit_proposed_general: gen, credit_proposed: gen, ...extra });
  const base = (o = {}) => ({ projects: [{ id: 'p1', billing_lock_token: o.lock ?? null, billing_lock_at: o.lock ? new Date().toISOString() : null }],
    invoices: [{ id: 'w1', project_id: 'p1', invoice_type: 'progress', status: 'paid' }, { id: 'dep1', project_id: 'p1', invoice_type: 'deposit', status: 'paid' }, ...(o.invoices || [])],
    credits: o.credits || [], allocations: o.allocations || [], commitments: o.commitments || [] });
  const rem = (db, id) => db.T.credits.get(id).remaining_amount;
  const unlocked = (db) => db.T.projects.get('p1').billing_lock_token == null;
  const allocSum = (db) => [...db.T.allocations.values()].reduce((s, a) => s + cents(a.amount_applied), 0);
  const nonNeg = (db) => [...db.T.credits.values()].every((c) => c.remaining_amount >= 0);
  const call = async (db, extra = {}) => settle(db, { project_id: 'p1', mode: 'auto', dry_run: false, settle_parts: true, ...extra })
    .then((r) => ({ status: 200, body: r }), (e) => ({ status: e.http || 500, body: { code: e.code, error: e.message, ...e.extra } }));
  const results = [];
  const t = async (name, fn) => { try { results.push({ name, ...(await fn()) }); } catch (e) { results.push({ name, pass: false, error: e.message }); } };

  await t('1 general credit, no draft reservation: settles fully', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(200)] }));
    const r = await call(db);
    return { pass: r.status === 200 && r.body.summary.credit_available === 300 && r.body.summary.credit_applied_now === 200 && rem(db, 'g1') === 100
      && db.T.commitments.get('c1').billing_status === 'paid' && allocSum(db) === 20000 && unlocked(db), r: r.body.summary };
  });
  await t('2 partially reserved: settlement limited to unreserved general credit', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(500)], invoices: [DRAFT('dr1', 100)] }));
    const r = await call(db);
    return { pass: r.status === 200 && r.body.summary.credit_available === 200 && r.body.summary.credit_applied_now === 200 && rem(db, 'g1') === 100
      && db.T.commitments.get('c1').billing_status !== 'paid' && simulateSend(db.T, 'dr1') && rem(db, 'g1') === 0 && nonNeg(db) && unlocked(db) };
  });
  await t('3 fully reserved: nothing settles, ledger untouched', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(200)], invoices: [DRAFT('dr1', 300)] }));
    const r = await call(db);
    return { pass: r.status === 200 && r.body.summary.credit_available === 0 && r.body.summary.credit_applied_now === 0 && rem(db, 'g1') === 300
      && db.T.allocations.size === 0 && db.T.commitments.get('c1').billing_status !== 'paid' && unlocked(db) };
  });
  await t('4 multiple drafts (split + legacy any-credit) all reduce availability', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(500)],
      invoices: [DRAFT('dr1', 100), DRAFT('dr2', 50), { id: 'dr3', project_id: 'p1', invoice_type: 'progress', status: 'draft', credit_proposed: 50 }] }));
    const r = await call(db);
    return { pass: r.status === 200 && r.body.summary.credit_available === 100 && r.body.summary.credit_reserved_by_drafts === 200 && rem(db, 'g1') === 200 && unlocked(db) };
  });
  await t('5 cancelled draft releases its reservation', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(300)], invoices: [DRAFT('dr1', 300, { status: 'cancelled' })] }));
    const r = await call(db);
    return { pass: r.status === 200 && r.body.summary.credit_available === 300 && rem(db, 'g1') === 0 && db.T.commitments.get('c1').billing_status === 'paid' && nonNeg(db) };
  });
  await t('6 sent draft: applied credit is consumed once, not subtracted again', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(500)], invoices: [DRAFT('dr1', 100)] }));
    const before = (await settle(db, { project_id: 'p1', dry_run: true })).summary.credit_available;
    simulateSend(db.T, 'dr1');
    const r = await call(db);
    return { pass: before === 200 && rem(db, 'g1') === 0 && r.status === 200 && r.body.summary.credit_available === 200 && r.body.summary.credit_applied_now === 200 && nonNeg(db) };
  });
  await t('7 manual allocation into reserved credit is rejected; within availability accepted', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(500)], invoices: [DRAFT('dr1', 100)] }));
    const bad = await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 250 }] });
    const split = await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 150 }, { credit_ledger_id: 'g1', commitment_id: 'c1', amount: 100 }] });
    const unchanged = rem(db, 'g1') === 300 && db.T.allocations.size === 0;
    const ok = await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 200 }] });
    return { pass: bad.status === 400 && bad.body.code === 'EXCEEDS_AVAILABLE_GENERAL_CREDIT' && split.status === 400 && unchanged
      && ok.status === 200 && rem(db, 'g1') === 100 && unlocked(db) };
  });
  await t('8a concurrent: invoice send holds the lock, settlement refused, nothing changed', async () => {
    const db = mockDb(base({ lock: 'send_other', credits: [GEN(300)], commitments: [PART(200)] }));
    const r = await call(db);
    return { pass: r.status === 409 && r.body.code === 'BILLING_LOCKED' && rem(db, 'g1') === 300 && db.T.allocations.size === 0 && db.T.projects.get('p1').billing_lock_token === 'send_other' };
  });
  await t('8b concurrent: credit spent underneath (compare-and-set) rolls back fully', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(200)] }), { afterAvailability: (T) => { T.credits.get('g1').remaining_amount = 50; } });
    const r = await call(db);
    return { pass: r.status === 409 && r.body.code === 'CREDIT_CHANGED' && rem(db, 'g1') === 50 && db.T.allocations.size === 0 && db.T.commitments.get('c1').billing_status !== 'paid' && unlocked(db) };
  });
  await t('8c settlement then send of the reserved draft: both succeed, no overdraw', async () => {
    const db = mockDb(base({ credits: [GEN(200, 'g1'), GEN(100, 'g2', { created_date: '2026-02-01' })], commitments: [PART(1000)], invoices: [DRAFT('dr1', 120)] }));
    const r = await call(db);
    const sent = simulateSend(db.T, 'dr1');
    return { pass: r.status === 200 && r.body.summary.credit_applied_now === 180 && sent && rem(db, 'g1') === 0 && rem(db, 'g2') === 0 && nonNeg(db) };
  });
  await t('8d allocation write failure restores ledger', async () => {
    const db = mockDb(base({ credits: [GEN(100, 'g1'), GEN(100, 'g2', { created_date: '2026-02-01' })], commitments: [PART(150)] }), { allocationFailAt: 1 });
    const r = await call(db);
    return { pass: r.status === 500 && rem(db, 'g1') === 100 && rem(db, 'g2') === 100 && db.T.allocations.size === 0 && unlocked(db) };
  });
  await t('9 deposit credit alongside general: deposit never consumed', async () => {
    const db = mockDb(base({ credits: [DEP(500), GEN(100)], commitments: [PART(400)] }));
    const r = await call(db);
    const bad = await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'd1', commitment_id: 'c1', amount: 50 }] });
    return { pass: r.status === 200 && r.body.summary.credit_applied_now === 100 && rem(db, 'd1') === 500 && rem(db, 'g1') === 0
      && bad.status === 400 && bad.body.code === 'EXCEEDS_LEDGER' && rem(db, 'd1') === 500 };
  });
  await t('10 historical allocations counted; repeat request allocates nothing twice', async () => {
    const db = mockDb(base({ credits: [GEN(300, 'g1', { credit_amount: 450 })], commitments: [PART(400)],
      allocations: [{ id: 'old1', project_id: 'p1', credit_ledger_id: 'g1', commitment_id: 'c1', amount_applied: 150, is_reversed: false, allocation_key: 'alloc_hist' }] }));
    const r1 = await call(db);
    const r2 = await call(db);
    return { pass: r1.status === 200 && r1.body.summary.credit_applied_now === 250 && rem(db, 'g1') === 50 && allocSum(db) === 40000
      && db.T.allocations.get('old1').amount_applied === 150 && r2.status === 200 && r2.body.summary.credit_applied_now === 0 && rem(db, 'g1') === 50 && db.T.allocations.size === 2 };
  });
  await t('dry run never writes or locks', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(200)] }));
    const r = await settle(db, { project_id: 'p1', dry_run: true, settle_parts: true });
    return { pass: r.summary.credit_to_apply === 200 && rem(db, 'g1') === 300 && db.T.allocations.size === 0 && unlocked(db) };
  });
  return { function: 'applyProjectCreditToCommitments', mock_only: true, passed: results.filter((r) => r.pass).length, total: results.length, results };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status ?? e.response?.status) || /authentication required/i.test(e.message) ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const payload = await req.json().catch(() => ({}));
    if (payload.self_test) return Response.json(await runSelfTest());
    try {
      return Response.json(await settle(realDb(base44), payload));
    } catch (e) {
      if (e.http) return Response.json({ success: false, code: e.code, error: e.message, ...e.extra }, { status: e.http });
      throw e;
    }
  } catch (error) {
    console.error('applyProjectCreditToCommitments error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});