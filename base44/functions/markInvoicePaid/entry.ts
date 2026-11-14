import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * markInvoicePaid — UNIFIED: Payment mutation only
 *
 * RULES (unchanged semantics):
 * 1. Transitions sent → paid ONLY
 * 2. Updates PartCommitment.billing_status to 'paid' for linked part lines
 * 3. Does NOT re-deduct credits (already done at sent time)
 * 4. Creates credit for deposit invoices (full paid amount) or overpayment (paid − balance after credit)
 * 5. Idempotent: if already paid, returns success without changes
 *
 * IDEMPOTENCY HARDENING:
 * - Serialized per project with the same compare-and-set billing lock markInvoiceSent uses.
 * - sent → paid is a conditional update (status must still be 'sent').
 * - Stable keys: invoice.payment_idempotency_key = pay:{id}; credit.payment_idempotency_key = pay_credit:{id}.
 * - Credit is derived from the STORED paid invoice, so a retry can't change the amount, and a credit lost to a
 *   failure after the paid transition is recreated exactly once on retry. Legacy paid invoices (older key format)
 *   are never touched.
 * - { self_test: true } (admin only) runs the scenarios below against an in-memory database. It never touches real records.
 */

const PAY_KEY = (id) => `pay:${id}`;
const PAY_CREDIT_KEY = (id) => `pay_credit:${id}`;
const STALE_MS = 120000;

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
    .catch((e) => console.error('[markInvoicePaid] lock release failed', e.message));
}

// Same math as before: deposit → full paid amount; otherwise overpayment above balance after credit.
function expectedCredit(inv) {
  const balanceAfterCredit = Math.max(0, (inv.subtotal ?? 0) - (inv.credit_applied ?? 0));
  const paid = inv.paid_amount ?? 0;
  if (inv.invoice_type === 'deposit') return paid > 0 ? { type: 'deposit', amount: paid } : null;
  return paid > balanceAfterCredit ? { type: 'overpayment', amount: paid - balanceAfterCredit } : null;
}

async function ensureCredit(db, inv) {
  const exp = expectedCredit(inv);
  if (!exp) return null;
  const key = PAY_CREDIT_KEY(inv.id);
  const [byKey] = await db.findCredits({ payment_idempotency_key: key });
  if (byKey) return { credit_id: byKey.id, amount: byKey.credit_amount, type: exp.type, already_existed: true };
  if (exp.type === 'deposit') {
    // Preserved legacy check: a deposit credit created by older code or backfillDepositCredits.
    const [legacy] = await db.findCredits({ source_invoice_id: inv.id });
    if (legacy) return { credit_id: legacy.id, amount: legacy.credit_amount, type: 'deposit', already_existed: true };
  }
  const label = exp.type === 'deposit' ? 'Deposit payment' : 'Overpayment';
  const credit = await db.createCredit({
    project_id: inv.project_id,
    source_invoice_id: inv.id,
    credit_amount: exp.amount,
    remaining_amount: exp.amount,
    notes: `${label} from invoice ${inv.qb_invoice_number || inv.id}`,
    payment_idempotency_key: key,
  });
  return { credit_id: credit.id, amount: exp.amount, type: exp.type };
}

const legacyPaid = (invoice_id) => [200, { success: true, idempotent: true, message: 'Invoice already paid — no changes made', invoice_id, status: 'paid' }];

async function markPaid(db, { invoice_id, payment_date, paid_amount }) {
  const invoice = await db.getInvoice(invoice_id);
  if (!invoice) return [404, { error: 'Invoice not found' }];
  if (invoice.status === 'paid' && invoice.payment_idempotency_key !== PAY_KEY(invoice_id)) return legacyPaid(invoice_id);
  if (invoice.status !== 'sent' && invoice.status !== 'paid') {
    return [400, { error: `Cannot mark as paid: invoice is ${invoice.status}, must be sent` }];
  }

  const release = await acquireLock(db, invoice.project_id, `pay_${invoice_id}`);
  if (!release) return [409, { success: false, error: 'Another invoice for this project is being finalized. Try again in a moment.', code: 'BILLING_LOCKED' }];
  try {
    const fresh = await db.getInvoice(invoice_id);
    if (fresh.status === 'paid') {
      if (fresh.payment_idempotency_key !== PAY_KEY(invoice_id)) return legacyPaid(invoice_id);
      // Retry of a payment recorded by this code: recreate a credit lost to an earlier failure (exactly once).
      const credit = await ensureCredit(db, fresh);
      const restored = credit && !credit.already_existed ? credit : null;
      return [200, {
        success: true, idempotent: true, invoice_id, status: 'paid',
        message: restored ? 'Invoice already paid — missing credit restored' : 'Invoice already paid — no changes made',
        credit_created: restored, credit_restored: !!restored, idempotency_key: PAY_KEY(invoice_id),
      }];
    }
    if (fresh.status !== 'sent') return [409, { error: `Cannot mark as paid: invoice is ${fresh.status}, must be sent` }];

    const idempotencyKey = PAY_KEY(invoice_id);
    const subtotal = fresh.subtotal ?? 0;
    const creditApplied = fresh.credit_applied ?? 0;
    const balanceAfterCredit = Math.max(0, subtotal - creditApplied);
    const actualPaidAmount = paid_amount ?? balanceAfterCredit;

    // PHASE 1: source records → paid (already-paid commitments are skipped, so retries are safe)
    const commitmentResults = [];
    for (const line of await db.listLines(invoice_id)) {
      if (line.type !== 'part') continue;
      const sourceId = line.source_id || line.part_commitment_id;
      if (!sourceId) continue;
      try {
        const c = await db.getCommitment(sourceId);
        if (!c) { commitmentResults.push({ source_id: sourceId, status: 'skipped', reason: 'not_found' }); continue; }
        if (c.billing_status === 'paid') { commitmentResults.push({ source_id: sourceId, status: 'skipped', reason: 'already_paid' }); continue; }
        await db.updateCommitment(sourceId, { billing_status: 'paid', invoice_blocked_reason: null });
        commitmentResults.push({ source_id: sourceId, status: 'updated' });
      } catch (err) {
        console.error(`Failed to mark commitment ${sourceId} as paid:`, err);
        commitmentResults.push({ source_id: sourceId, status: 'error', error: err.message });
      }
    }

    // PHASE 2: invoice sent → paid (conditional: only one caller can win)
    const balanceDue = Math.max(0, balanceAfterCredit - actualPaidAmount);
    const won = await db.invoiceCas({ id: invoice_id, status: 'sent' }, {
      status: 'paid', payment_date, paid_amount: actualPaidAmount, balance_due: balanceDue, payment_idempotency_key: idempotencyKey,
    });
    if (won !== 1) return [409, { success: false, error: 'Invoice changed while recording payment. Reload and try again.', code: 'INVOICE_CHANGED' }];

    // PHASE 3: deposit / overpayment credit (stable key; a failure here is healed by retry)
    const creditCreated = await ensureCredit(db, { ...fresh, status: 'paid', paid_amount: actualPaidAmount });

    return [200, {
      success: true, invoice_id, status: 'paid', payment_date, subtotal,
      credit_applied: creditApplied, balance_due: balanceDue, paid_amount: actualPaidAmount,
      credit_created: creditCreated,
      commitments_updated: commitmentResults.filter((r) => r.status === 'updated').length,
      commitment_results: commitmentResults, idempotency_key: idempotencyKey,
    }];
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
    invoiceCas: async (q, set) => (await sr.ProjectInvoice.updateMany(q, { $set: set })).updated,
    findCredits: (q) => base44.entities.ProjectCreditLedger.filter(q),
    createCredit: (d) => sr.ProjectCreditLedger.create(d),
    getProject: (id) => sr.Project.get(id).catch((e) => (e.status === 404 ? null : Promise.reject(e))),
    projectCas: async (q, set) => (await sr.Project.updateMany(q, { $set: set })).updated,
  };
}

// ───────────── In-memory test harness (never touches real records) ─────────────
function mockDb(seed, faults = {}) {
  const T = {};
  for (const k of ['invoices', 'lines', 'commitments', 'credits', 'projects']) T[k] = new Map((seed[k] || []).map((r) => [r.id, structuredClone(r)]));
  const calls = {};
  let seq = 0;
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
  return {
    T,
    getInvoice: async (id) => (await find('getInvoice', T.invoices, { id }))[0] || null,
    listLines: (invoice_id) => find('listLines', T.lines, { invoice_id }),
    getCommitment: async (id) => (await find('getCommitment', T.commitments, { id }))[0] || null,
    updateCommitment: async (id, d) => { await hit('updateCommitment'); Object.assign(T.commitments.get(id), d); },
    invoiceCas: (q, set) => cas('invoiceCas', T.invoices, q, set),
    findCredits: (q) => find('findCredits', T.credits, q),
    createCredit: async (d) => { await hit('createCredit'); const r = { id: `cr_new_${++seq}`, created_date: new Date().toISOString(), ...d }; T.credits.set(r.id, r); return structuredClone(r); },
    getProject: async (id) => (await find('getProject', T.projects, { id }))[0] || null,
    projectCas: (q, set) => cas('projectCas', T.projects, q, set),
  };
}

async function runSelfTest() {
  const ARGS = { invoice_id: 'inv1', payment_date: '2026-11-08' };
  const seed = (inv = {}, extra = {}) => mockDb({
    invoices: [{ id: 'inv1', project_id: 'p1', status: 'sent', invoice_type: 'progress', subtotal: 1000, credit_applied: 0, qb_invoice_number: 'Q-1', ...inv }],
    lines: [{ id: 'l1', invoice_id: 'inv1', type: 'part', source_id: 'pc1', qty: 1, line_total: 1000 }],
    commitments: [{ id: 'pc1', billing_status: 'invoiced' }],
    credits: extra.credits || [],
    projects: [{ id: 'p1', billing_lock_token: extra.lockToken ?? null, billing_lock_at: extra.lockAt ?? null }],
  }, extra.faults);
  const run = (db, args) => markPaid(db, { ...ARGS, ...args }).catch((e) => [500, { error: e.message }]);
  const credits = (db) => [...db.T.credits.values()];
  const inv = (db) => db.T.invoices.get('inv1');
  const unlocked = (db) => db.T.projects.get('p1').billing_lock_token == null;
  const results = [];
  const test = async (name, fn) => {
    try { const detail = await fn(); results.push({ name, pass: detail.pass, detail }); }
    catch (e) { results.push({ name, pass: false, detail: { error: e.message } }); }
  };

  await test('exact payment: paid, no credit; repeat is a no-op', async () => {
    const db = seed();
    const [s1, b1] = await run(db, {});
    const [s2, b2] = await run(db, { paid_amount: 5000 });
    return { pass: s1 === 200 && inv(db).status === 'paid' && inv(db).paid_amount === 1000 && inv(db).balance_due === 0 && credits(db).length === 0
      && db.T.commitments.get('pc1').billing_status === 'paid' && s2 === 200 && b2.idempotent && !b2.credit_created && inv(db).paid_amount === 1000 && unlocked(db), s1, s2, credit_created: b1.credit_created };
  });
  await test('underpayment: balance due kept, no credit; retry cannot change amount', async () => {
    const db = seed();
    const [s1] = await run(db, { paid_amount: 600 });
    const [s2] = await run(db, { paid_amount: 2000 });
    return { pass: s1 === 200 && s2 === 200 && inv(db).paid_amount === 600 && inv(db).balance_due === 400 && credits(db).length === 0, balance_due: inv(db).balance_due };
  });
  await test('overpayment (after 100 sent-time credit): one credit of 350; 3 retries create none', async () => {
    const db = seed({ credit_applied: 100 });
    const [s1, b1] = await run(db, { paid_amount: 1250 });
    for (let i = 0; i < 3; i++) await run(db, { paid_amount: 1250 });
    const c = credits(db);
    return { pass: s1 === 200 && b1.credit_created?.amount === 350 && c.length === 1 && c[0].remaining_amount === 350 && c[0].payment_idempotency_key === 'pay_credit:inv1', credits: c.length, amount: c[0]?.credit_amount };
  });
  await test('5 concurrent overpayment requests: exactly one credit', async () => {
    const db = seed();
    const res = await Promise.all(Array.from({ length: 5 }, () => run(db, { paid_amount: 1300 })));
    const statuses = res.map((r) => r[0]);
    const winners = res.filter(([s, b]) => s === 200 && !b.idempotent).length;
    return { pass: winners === 1 && credits(db).length === 1 && credits(db)[0].credit_amount === 300 && statuses.every((s) => s === 200 || s === 409) && unlocked(db), statuses };
  });
  await test('partial failure: credit create fails after paid → retry restores it once', async () => {
    const db = seed({}, { faults: { createCredit: { throwOn: [1] } } });
    const [s1] = await run(db, { paid_amount: 1200 });
    const afterFail = { status: inv(db).status, credits: credits(db).length, unlocked: unlocked(db) };
    const [s2, b2] = await run(db, { paid_amount: 9999 });
    const [s3, b3] = await run(db, {});
    return { pass: s1 === 500 && afterFail.status === 'paid' && afterFail.credits === 0 && afterFail.unlocked && s2 === 200 && b2.credit_restored && b2.credit_created.amount === 200
      && s3 === 200 && !b3.credit_restored && credits(db).length === 1, afterFail, second: b2.message, third: b3.message };
  });
  await test('partial failure: invoice update fails → still sent, no credit; retry pays once', async () => {
    const db = seed({}, { faults: { invoiceCas: { throwOn: [1] } } });
    const [s1] = await run(db, { paid_amount: 1100 });
    const mid = { status: inv(db).status, credits: credits(db).length };
    const [s2, b2] = await run(db, { paid_amount: 1100 });
    return { pass: s1 === 500 && mid.status === 'sent' && mid.credits === 0 && s2 === 200 && !b2.idempotent && credits(db).length === 1 && credits(db)[0].credit_amount === 100 && unlocked(db), mid };
  });
  await test('deposit with an existing unrelated credit balance: deposit credit once, other balance untouched', async () => {
    const db = seed({ invoice_type: 'deposit', subtotal: 500 }, { credits: [{ id: 'old', project_id: 'p1', source_invoice_id: 'invX', credit_amount: 75, remaining_amount: 40 }] });
    const res = await Promise.all([run(db, { paid_amount: 500 }), run(db, { paid_amount: 500 })]);
    await run(db, { paid_amount: 500 });
    const dep = credits(db).filter((c) => c.source_invoice_id === 'inv1');
    return { pass: dep.length === 1 && dep[0].credit_amount === 500 && db.T.credits.get('old').remaining_amount === 40, statuses: res.map((r) => r[0]) };
  });
  await test('deposit whose credit already exists from backfill: no duplicate', async () => {
    const db = seed({ invoice_type: 'deposit', subtotal: 500 }, { credits: [{ id: 'bf', project_id: 'p1', source_invoice_id: 'inv1', credit_amount: 500, remaining_amount: 500 }] });
    const [s, b] = await run(db, { paid_amount: 500 });
    return { pass: s === 200 && b.credit_created?.already_existed && credits(db).length === 1 };
  });
  await test('legacy paid invoice (old key format, no credit): never modified', async () => {
    const db = seed({ status: 'paid', paid_amount: 1500, payment_idempotency_key: 'pay_1x2y3z' });
    const before = JSON.stringify([...db.T.invoices.values(), ...db.T.credits.values(), ...db.T.projects.values()]);
    const [s, b] = await run(db, {});
    const after = JSON.stringify([...db.T.invoices.values(), ...db.T.credits.values(), ...db.T.projects.values()]);
    return { pass: s === 200 && b.idempotent && before === after };
  });
  await test('lock held by another finalization: 409, nothing changed', async () => {
    const db = seed({}, { lockToken: 'other', lockAt: new Date().toISOString() });
    const [s] = await run(db, { paid_amount: 1300 });
    return { pass: s === 409 && inv(db).status === 'sent' && credits(db).length === 0 && db.T.projects.get('p1').billing_lock_token === 'other' };
  });
  await test('stale lock (3 min) is taken over and released', async () => {
    const db = seed({}, { lockToken: 'dead', lockAt: new Date(Date.now() - 180000).toISOString() });
    const [s] = await run(db, {});
    return { pass: s === 200 && inv(db).status === 'paid' && unlocked(db) };
  });
  await test('cancelled / draft invoices rejected without changes', async () => {
    const a = seed({ status: 'draft' }); const b = seed({ status: 'cancelled' });
    const [sa] = await run(a, {}); const [sb] = await run(b, {});
    return { pass: sa === 400 && sb === 400 && credits(a).length + credits(b).length === 0 };
  });

  return { function: 'markInvoicePaid', mock_only: true, passed: results.filter((r) => r.pass).length, total: results.length, results };
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
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (body.self_test) {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      return Response.json(await runSelfTest());
    }

    // PHASE 2U.3A: retired. One-step "mark paid" left no payment records and bypassed partial payments.
    // All payments now go through recordInvoicePayment (record / reverse). Self-test kept for reference.
    return Response.json({
      success: false, code: 'RETIRED',
      error: 'Mark Paid has been replaced. Open the invoice and use Record Payment.',
    }, { status: 410 });
  } catch (error) {
    console.error('markInvoicePaid error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});