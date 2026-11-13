import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * recordInvoicePayment — records one client payment against a sent/partial invoice (admin only).
 *
 * - Each payment is its own ProjectInvoicePayment record (integer cents) keyed by a client idempotency key.
 * - Invoice paid_amount is ALWAYS recomputed as the sum of its payment records, so retries and crashes self-heal.
 * - Status: sum < balance after credit → 'partial'; sum >= balance → 'paid' (same end state as markInvoicePaid:
 *   part commitments → paid, payment_idempotency_key pay:{id}, deposit / overpayment credit with key pay_credit:{id}).
 * - Serialized per project with the shared billing lock; status changes are conditional updates.
 * - { self_test: true } runs the scenarios below on an in-memory database only.
 */

const PAY_KEY = (id) => `pay:${id}`;
const PAY_CREDIT_KEY = (id) => `pay_credit:${id}`;
const STALE_MS = 120000;
const METHODS = ['check', 'ach', 'wire', 'card', 'cash', 'other'];
const cents = (n) => Math.round((n ?? 0) * 100);

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
    .catch((e) => console.error('[recordInvoicePayment] lock release failed', e.message));
}

// Identical rules to markInvoicePaid: deposit → full paid amount; otherwise overpayment above balance after credit.
async function ensureCredit(db, inv) {
  const dueC = Math.max(0, cents(inv.subtotal) - cents(inv.credit_applied));
  const paidC = cents(inv.paid_amount);
  let exp = null;
  if (inv.invoice_type === 'deposit') exp = paidC > 0 ? { type: 'deposit', c: paidC } : null;
  else if (paidC > dueC) exp = { type: 'overpayment', c: paidC - dueC };
  if (!exp) return null;
  const key = PAY_CREDIT_KEY(inv.id);
  const [byKey] = await db.findCredits({ payment_idempotency_key: key });
  if (byKey) return { credit_id: byKey.id, amount: byKey.credit_amount, type: exp.type, already_existed: true };
  if (exp.type === 'deposit') {
    const [legacy] = await db.findCredits({ source_invoice_id: inv.id });
    if (legacy) return { credit_id: legacy.id, amount: legacy.credit_amount, type: 'deposit', already_existed: true };
  }
  const amount = exp.c / 100;
  const credit = await db.createCredit({
    project_id: inv.project_id, source_invoice_id: inv.id, credit_amount: amount, remaining_amount: amount,
    notes: `${exp.type === 'deposit' ? 'Deposit payment' : 'Overpayment'} from invoice ${inv.qb_invoice_number || inv.id}`,
    payment_idempotency_key: key,
  });
  return { credit_id: credit.id, amount, type: exp.type };
}

async function markCommitmentsPaid(db, invoice_id) {
  let updated = 0;
  for (const line of await db.listLines(invoice_id)) {
    if (line.type !== 'part') continue;
    const id = line.source_id || line.part_commitment_id;
    if (!id) continue;
    const c = await db.getCommitment(id);
    if (!c || c.billing_status === 'paid') continue;
    await db.updateCommitment(id, { billing_status: 'paid', invoice_blocked_reason: null });
    updated++;
  }
  return updated;
}

async function recordPayment(db, args) {
  const { invoice_id, idempotency_key } = args;
  const invoice = await db.getInvoice(invoice_id);
  if (!invoice) return [404, { error: 'Invoice not found' }];
  if (!['sent', 'partial', 'paid'].includes(invoice.status)) {
    return [400, { error: `Payments can only be recorded on sent invoices (this one is ${invoice.status}).` }];
  }
  const release = await acquireLock(db, invoice.project_id, `payrec_${invoice_id}`);
  if (!release) return [409, { success: false, code: 'BILLING_LOCKED', error: 'Another billing action for this project is in progress. Try again in a moment.' }];
  try {
    const fresh = await db.getInvoice(invoice_id);
    let [payment] = await db.findPayments({ idempotency_key });
    if (payment && payment.invoice_id !== invoice_id) return [409, { error: 'Payment key already used for another invoice.' }];
    const isRetry = !!payment;
    if (!payment) {
      if (fresh.status === 'paid') return [400, { error: 'Invoice is already fully paid.' }];
      if (!['sent', 'partial'].includes(fresh.status)) return [409, { code: 'INVOICE_CHANGED', error: `Invoice is now ${fresh.status}. Reload and try again.` }];
      payment = await db.createPayment({
        invoice_id, project_id: fresh.project_id, amount_cents: args.amount_cents, payment_date: args.payment_date,
        method: args.method || 'other', reference: args.reference || '', note: args.note || '',
        idempotency_key, recorded_by_email: args.user_email, recorded_at: new Date().toISOString(),
      });
    }

    const payments = await db.listPayments(invoice_id);
    const paidC = payments.reduce((s, p) => s + (p.amount_cents || 0), 0);
    const dueC = Math.max(0, cents(fresh.subtotal) - cents(fresh.credit_applied));
    const paid_amount = paidC / 100;
    const balance_due = Math.max(0, dueC - paidC) / 100;

    if (fresh.status === 'paid') {
      const credit = await ensureCredit(db, fresh);
      return [200, { success: true, idempotent: true, status: 'paid', payment_id: payment.id, paid_amount: fresh.paid_amount, balance_due: fresh.balance_due, credit_created: credit && !credit.already_existed ? credit : null }];
    }

    if (paidC >= dueC) {
      const commitments_updated = await markCommitmentsPaid(db, invoice_id);
      const lastDate = payments.map((p) => p.payment_date).sort().pop();
      const won = await db.invoiceCas({ id: invoice_id, status: fresh.status }, {
        status: 'paid', paid_amount, balance_due: 0, payment_date: lastDate, payment_idempotency_key: PAY_KEY(invoice_id),
      });
      if (won !== 1) return [409, { code: 'INVOICE_CHANGED', error: 'Invoice changed while recording payment. Reload and try again.' }];
      const credit = await ensureCredit(db, { ...fresh, status: 'paid', paid_amount });
      return [200, { success: true, idempotent: isRetry, status: 'paid', payment_id: payment.id, paid_amount, balance_due: 0, credit_created: credit && !credit.already_existed ? credit : null, commitments_updated }];
    }

    const won = await db.invoiceCas({ id: invoice_id, status: fresh.status }, { status: 'partial', paid_amount, balance_due });
    if (won !== 1) return [409, { code: 'INVOICE_CHANGED', error: 'Invoice changed while recording payment. Reload and try again.' }];
    return [200, { success: true, idempotent: isRetry, status: 'partial', payment_id: payment.id, paid_amount, balance_due }];
  } finally {
    await release();
  }
}

function realDb(base44) {
  const sr = base44.asServiceRole.entities;
  return {
    getInvoice: async (id) => (await sr.ProjectInvoice.filter({ id }))[0] || null,
    listLines: (invoice_id) => sr.ProjectInvoiceLine.filter({ invoice_id }),
    getCommitment: async (id) => (await sr.PartCommitment.filter({ id }))[0] || null,
    updateCommitment: (id, d) => sr.PartCommitment.update(id, d),
    invoiceCas: async (q, set) => (await sr.ProjectInvoice.updateMany(q, { $set: set })).updated,
    findCredits: (q) => sr.ProjectCreditLedger.filter(q),
    createCredit: (d) => sr.ProjectCreditLedger.create(d),
    findPayments: (q) => sr.ProjectInvoicePayment.filter(q),
    listPayments: (invoice_id) => sr.ProjectInvoicePayment.filter({ invoice_id }),
    createPayment: (d) => sr.ProjectInvoicePayment.create(d),
    getProject: (id) => sr.Project.get(id).catch((e) => (e.status === 404 ? null : Promise.reject(e))),
    projectCas: async (q, set) => (await sr.Project.updateMany(q, { $set: set })).updated,
  };
}

// ───────────── In-memory test harness (never touches real records) ─────────────
function mockDb(seed, faults = {}) {
  const T = {};
  for (const k of ['invoices', 'lines', 'commitments', 'credits', 'payments', 'projects']) T[k] = new Map((seed[k] || []).map((r) => [r.id, structuredClone(r)]));
  const calls = {};
  let seq = 0;
  const hit = async (name) => {
    await new Promise((r) => setTimeout(r, 0));
    const n = (calls[name] = (calls[name] || 0) + 1);
    if (faults[name]?.throwOn?.includes(n)) throw new Error(`injected ${name} failure #${n}`);
  };
  const match = (r, q) => Object.entries(q).every(([k, v]) => (v === null ? r[k] == null : r[k] === v));
  const find = async (name, map, q) => { await hit(name); return [...map.values()].filter((r) => match(r, q)).map((r) => structuredClone(r)); };
  const cas = async (name, map, q, set) => { await hit(name); let u = 0; for (const r of map.values()) if (match(r, q)) { Object.assign(r, structuredClone(set)); u++; } return u; };
  const create = (name, map) => async (d) => { await hit(name); const r = { id: `${name}_${++seq}`, ...d }; map.set(r.id, r); return structuredClone(r); };
  return {
    T,
    getInvoice: async (id) => (await find('getInvoice', T.invoices, { id }))[0] || null,
    listLines: (invoice_id) => find('listLines', T.lines, { invoice_id }),
    getCommitment: async (id) => (await find('getCommitment', T.commitments, { id }))[0] || null,
    updateCommitment: async (id, d) => { await hit('updateCommitment'); Object.assign(T.commitments.get(id), d); },
    invoiceCas: (q, set) => cas('invoiceCas', T.invoices, q, set),
    findCredits: (q) => find('findCredits', T.credits, q),
    createCredit: create('createCredit', T.credits),
    findPayments: (q) => find('findPayments', T.payments, q),
    listPayments: (invoice_id) => find('listPayments', T.payments, { invoice_id }),
    createPayment: create('createPayment', T.payments),
    getProject: async (id) => (await find('getProject', T.projects, { id }))[0] || null,
    projectCas: (q, set) => cas('projectCas', T.projects, q, set),
  };
}

async function runSelfTest() {
  const seed = (inv = {}, extra = {}) => mockDb({
    invoices: [{ id: 'inv1', project_id: 'p1', status: 'sent', invoice_type: 'progress', subtotal: 1000, credit_applied: 0, paid_amount: 0, ...inv }],
    lines: [{ id: 'l1', invoice_id: 'inv1', type: 'part', source_id: 'pc1' }],
    commitments: [{ id: 'pc1', billing_status: 'invoiced' }],
    credits: [], payments: [],
    projects: [{ id: 'p1', billing_lock_token: extra.lockToken ?? null, billing_lock_at: extra.lockAt ?? null }],
  }, extra.faults);
  let k = 0;
  const pay = (db, amount_cents, key = `k${++k}`) => recordPayment(db, { invoice_id: 'inv1', amount_cents, payment_date: '2026-11-13', idempotency_key: key, user_email: 't@x' }).catch((e) => [500, { error: e.message }]);
  const inv = (db) => db.T.invoices.get('inv1');
  const unlocked = (db) => db.T.projects.get('p1').billing_lock_token == null;
  const results = [];
  const test = async (name, fn) => { try { const d = await fn(); results.push({ name, pass: d.pass, detail: d }); } catch (e) { results.push({ name, pass: false, detail: { error: e.message } }); } };

  await test('two partial payments then final: partial → partial → paid, commitments paid, no credit', async () => {
    const db = seed();
    const [s1] = await pay(db, 30000); const a = inv(db).status;
    const [s2] = await pay(db, 30000); const b = inv(db).balance_due;
    const [s3, b3] = await pay(db, 40000);
    return { pass: s1 === 200 && a === 'partial' && s2 === 200 && b === 400 && s3 === 200 && b3.status === 'paid' && inv(db).paid_amount === 1000 && inv(db).payment_idempotency_key === 'pay:inv1' && db.T.commitments.get('pc1').billing_status === 'paid' && db.T.credits.size === 0 && unlocked(db) };
  });
  await test('same key retried 3x: one payment record', async () => {
    const db = seed();
    for (let i = 0; i < 3; i++) await pay(db, 25000, 'same');
    return { pass: db.T.payments.size === 1 && inv(db).paid_amount === 250 && inv(db).status === 'partial' };
  });
  await test('credit applied at send reduces amount due (1000 - 281.99)', async () => {
    const db = seed({ credit_applied: 281.9900000000018 });
    const [, b] = await pay(db, 71801);
    return { pass: b.status === 'paid' && inv(db).balance_due === 0 && db.T.credits.size === 0 };
  });
  await test('overpayment on final payment: one credit for the excess', async () => {
    const db = seed();
    await pay(db, 50000); await pay(db, 60000); 
    const c = [...db.T.credits.values()];
    return { pass: inv(db).status === 'paid' && c.length === 1 && c[0].credit_amount === 100 && c[0].payment_idempotency_key === 'pay_credit:inv1' };
  });
  await test('deposit paid in two parts: credit for full deposit once, at full payment', async () => {
    const db = seed({ invoice_type: 'deposit', subtotal: 500 });
    await pay(db, 20000); const mid = db.T.credits.size;
    await pay(db, 30000);
    const c = [...db.T.credits.values()];
    return { pass: mid === 0 && c.length === 1 && c[0].credit_amount === 500 };
  });
  await test('payment saved but invoice update fails: retry with same key heals without duplicate', async () => {
    const db = seed({}, { faults: { invoiceCas: { throwOn: [1] } } });
    const [s1] = await pay(db, 40000, 'r'); const mid = { st: inv(db).status, n: db.T.payments.size, unlocked: unlocked(db) };
    const [s2, b2] = await pay(db, 40000, 'r');
    return { pass: s1 === 500 && mid.st === 'sent' && mid.n === 1 && mid.unlocked && s2 === 200 && b2.idempotent && db.T.payments.size === 1 && inv(db).status === 'partial' && inv(db).paid_amount === 400 };
  });
  await test('5 concurrent different payments: all serialized, totals correct', async () => {
    const db = seed();
    const res = await Promise.all(Array.from({ length: 5 }, () => pay(db, 10000)));
    const ok = res.filter(([s]) => s === 200).length;
    return { pass: db.T.payments.size === ok && inv(db).paid_amount === ok * 100 && res.every(([s]) => s === 200 || s === 409) && unlocked(db), ok };
  });
  await test('draft / cancelled / fully paid invoices refuse new payments', async () => {
    const a = seed({ status: 'draft' }); const b = seed({ status: 'cancelled' }); const c = seed({ status: 'paid' });
    const [sa] = await pay(a, 100); const [sb] = await pay(b, 100); const [sc] = await pay(c, 100);
    return { pass: sa === 400 && sb === 400 && sc === 400 && a.T.payments.size + b.T.payments.size + c.T.payments.size === 0 };
  });
  await test('lock held elsewhere: 409, nothing recorded', async () => {
    const db = seed({}, { lockToken: 'other', lockAt: new Date().toISOString() });
    const [s] = await pay(db, 100);
    return { pass: s === 409 && db.T.payments.size === 0 && inv(db).status === 'sent' };
  });
  return { function: 'recordInvoicePayment', mock_only: true, passed: results.filter((r) => r.pass).length, total: results.length, results };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status ?? e.response?.status) || /authentication required/i.test(e.message) ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (body.self_test) return Response.json(await runSelfTest());

    const { invoice_id, amount, payment_date, method, reference, note, idempotency_key } = body;
    if (typeof invoice_id !== 'string' || !invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });
    if (typeof idempotency_key !== 'string' || idempotency_key.length < 8) return Response.json({ error: 'idempotency_key required' }, { status: 400 });
    const amount_cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amount_cents) || amount_cents <= 0) return Response.json({ error: 'Amount must be greater than 0.' }, { status: 400 });
    if (typeof payment_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) return Response.json({ error: 'Payment date required.' }, { status: 400 });
    if (method && !METHODS.includes(method)) return Response.json({ error: 'Invalid payment method.' }, { status: 400 });

    const [status, payload] = await recordPayment(realDb(base44), {
      invoice_id, amount_cents, payment_date, method, reference: String(reference || '').slice(0, 200),
      note: String(note || '').slice(0, 1000), idempotency_key, user_email: user.email,
    });
    return Response.json(payload, { status });
  } catch (error) {
    console.error('recordInvoicePayment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});