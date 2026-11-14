import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * recordInvoicePayment — the ONE canonical payment handler for ProjectInvoices (admin only).
 *
 * action 'record' (default): records one client payment against a sent/partial invoice.
 * action 'reverse': reverses one recorded payment (required reason). The payment record is kept and
 *   flagged reversed (who/when/why); it is never deleted.
 *
 * - Each payment is its own ProjectInvoicePayment record (integer cents) keyed by a client idempotency key.
 * - Invoice paid_amount is ALWAYS recomputed from ACTIVE (non-reversed) payment records, so retries self-heal.
 * - Status: active sum = 0 → 'sent'; < amount due → 'partial'; >= amount due → 'paid'.
 *   Fully paid = part commitments → paid (unchanged rule). Reversal out of 'paid' puts those parts back to
 *   'invoiced' unless another paid invoice also bills them.
 * - Client credit created by this invoice's payments (deposit credit / overpayment, key pay_credit:{id}) is kept
 *   equal to what the active payments justify. A reversal that would need to take back credit that has already
 *   been used is BLOCKED with an explanation; nothing is changed.
 * - Serialized per project with the shared billing lock; status changes are conditional updates.
 * - { self_test: true } runs the scenarios below on an in-memory database only.
 */

const PAY_KEY = (id) => `pay:${id}`;
const PAY_CREDIT_KEY = (id) => `pay_credit:${id}`;
const STALE_MS = 120000;
const METHODS = ['check', 'ach', 'wire', 'card', 'cash', 'other'];
const cents = (n) => Math.round((n ?? 0) * 100);
const usd = (c) => `$${(c / 100).toFixed(2)}`;
const activeSumC = (ps) => ps.filter((p) => !p.reversed_at).reduce((s, p) => s + (p.amount_cents || 0), 0);
const dueCents = (inv) => Math.max(0, cents(inv.subtotal) - cents(inv.credit_applied));
const invLabel = (inv) => inv?.qb_invoice_number || inv?.id;

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

// Credit the active payments justify. Same rules as before: deposit → full paid amount once fully paid;
// otherwise the overpayment above the amount due. (Deposit accounting rule unchanged; pending accounting review.)
function expectedCreditC(inv, paidC, isPaid) {
  if (inv.invoice_type === 'deposit') return isPaid && paidC > 0 ? paidC : 0;
  return Math.max(0, paidC - dueCents(inv));
}

async function findInvoiceCredit(db, inv) {
  const [byKey] = await db.findCredits({ payment_idempotency_key: PAY_CREDIT_KEY(inv.id) });
  if (byKey) return byKey;
  if (inv.invoice_type !== 'deposit') return null;
  const legacy = (await db.findCredits({ source_invoice_id: inv.id })).filter((c) => !c.reversed_from_invoice_id);
  return legacy[0] || null;
}

// Returns an actionable message when the credit can't be reduced to expC without going negative.
async function creditBlock(db, credit, expC) {
  if (!credit) return null;
  const takeC = cents(credit.credit_amount) - expC;
  const remC = cents(credit.remaining_amount);
  if (takeC <= 0 || takeC <= remC) return null;
  const usedC = cents(credit.credit_amount) - remC;
  const usedOn = credit.applied_to_invoice_id ? await db.getInvoice(credit.applied_to_invoice_id) : null;
  return `This invoice's payments back a ${usd(cents(credit.credit_amount))} client credit, and ${usd(usedC)} of it has already been used`
    + `${usedOn ? ` on invoice ${invLabel(usedOn)}` : ''}. Reversing this payment would take back ${usd(takeC)} of that credit, but only ${usd(remC)} is still unused. `
    + `Cancel the invoice or credit application that used it first (that returns the credit), then reverse this payment.`;
}

// Drafts don't hold ledger credit; they only store credit_proposed. Refuse a reversal whose credit take-back
// would leave the project's unused credit below what its drafts propose (send would silently apply less).
async function draftCreditBlock(db, inv, credit, expC) {
  const takeC = cents(credit?.credit_amount) - expC;
  if (!credit || takeC <= 0) return null;
  const drafts = (await db.findInvoices({ project_id: inv.project_id, status: 'draft' })).filter((d) => cents(d.credit_proposed) > 0);
  if (!drafts.length) return null;
  const proposedC = drafts.reduce((s, d) => s + cents(d.credit_proposed), 0);
  const availC = (await db.findCredits({ project_id: inv.project_id })).reduce((s, c) => s + Math.max(0, cents(c.remaining_amount)), 0);
  if (availC - takeC >= proposedC) return null;
  return `Reversing this payment would take back ${usd(takeC)} of unused client credit, leaving ${usd(Math.max(0, availC - takeC))} available. `
    + `Draft invoice${drafts.length > 1 ? 's' : ''} ${drafts.map(invLabel).join(', ')} propose${drafts.length > 1 ? '' : 's'} ${usd(proposedC)} of credit. `
    + `Reduce the credit on ${drafts.length > 1 ? 'those drafts' : 'that draft'} first, then reverse this payment.`;
}

// Brings the invoice's credit to expC. Caller has already checked creditBlock.
async function syncCredit(db, inv, credit, expC, reason) {
  if (!credit) {
    if (expC <= 0) return null;
    const amount = expC / 100;
    const c = await db.createCredit({
      project_id: inv.project_id, source_invoice_id: inv.id, credit_amount: amount, remaining_amount: amount,
      notes: `${inv.invoice_type === 'deposit' ? 'Deposit payment' : 'Overpayment'} from invoice ${invLabel(inv)}`,
      payment_idempotency_key: PAY_CREDIT_KEY(inv.id),
    });
    return { credit_id: c.id, amount, type: inv.invoice_type === 'deposit' ? 'deposit' : 'overpayment', change: amount };
  }
  const curC = cents(credit.credit_amount);
  if (curC === expC) return null;
  const diffC = expC - curC;
  const won = await db.creditCas({ id: credit.id, remaining_amount: credit.remaining_amount }, {
    credit_amount: expC / 100,
    remaining_amount: (cents(credit.remaining_amount) + diffC) / 100,
    notes: `${credit.notes || ''} | ${new Date().toISOString().slice(0, 10)}: ${usd(curC)} → ${usd(expC)} (${reason})`.slice(0, 2000),
  });
  if (won !== 1) throw Object.assign(new Error('Client credit changed during this action. Try again.'), { http: 409 });
  return { credit_id: credit.id, amount: expC / 100, type: inv.invoice_type === 'deposit' ? 'deposit' : 'overpayment', change: diffC / 100 };
}

async function partCommitmentIds(db, invoice_id) {
  return (await db.listLines(invoice_id)).filter((l) => l.type === 'part').map((l) => l.source_id || l.part_commitment_id).filter(Boolean);
}

async function markCommitmentsPaid(db, invoice_id) {
  let updated = 0;
  for (const id of await partCommitmentIds(db, invoice_id)) {
    const c = await db.getCommitment(id);
    if (!c || c.billing_status === 'paid') continue;
    await db.updateCommitment(id, { billing_status: 'paid', invoice_blocked_reason: null });
    updated++;
  }
  return updated;
}

// Inverse of markCommitmentsPaid: paid → invoiced, unless another fully paid invoice also bills the commitment.
async function revertCommitmentsPaid(db, invoice_id) {
  let updated = 0;
  for (const id of await partCommitmentIds(db, invoice_id)) {
    const c = await db.getCommitment(id);
    if (!c || c.billing_status !== 'paid') continue;
    const otherInvIds = [...new Set((await db.findLinesBySource(id)).map((l) => l.invoice_id).filter((x) => x !== invoice_id))];
    let paidElsewhere = false;
    for (const oid of otherInvIds) if ((await db.getInvoice(oid))?.status === 'paid') { paidElsewhere = true; break; }
    if (paidElsewhere) continue;
    await db.updateCommitment(id, { billing_status: 'invoiced' });
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
    const paidC = activeSumC(payments);
    const dueC = dueCents(fresh);
    const paid_amount = paidC / 100;
    const balance_due = Math.max(0, dueC - paidC) / 100;

    if (fresh.status === 'paid') {
      const credit = await findInvoiceCredit(db, fresh);
      const expC = expectedCreditC(fresh, paidC, true);
      const synced = expC > cents(credit?.credit_amount) ? await syncCredit(db, fresh, credit, expC, 'payment retry') : null;
      return [200, { success: true, idempotent: true, status: 'paid', payment_id: payment.id, paid_amount: fresh.paid_amount, balance_due: fresh.balance_due, credit_created: synced }];
    }

    if (paidC > 0 && paidC >= dueC) {
      const commitments_updated = await markCommitmentsPaid(db, invoice_id);
      const lastDate = payments.filter((p) => !p.reversed_at).map((p) => p.payment_date).sort().pop();
      const won = await db.invoiceCas({ id: invoice_id, status: fresh.status }, {
        status: 'paid', paid_amount, balance_due: 0, payment_date: lastDate, payment_idempotency_key: PAY_KEY(invoice_id),
      });
      if (won !== 1) return [409, { code: 'INVOICE_CHANGED', error: 'Invoice changed while recording payment. Reload and try again.' }];
      const credit = await findInvoiceCredit(db, fresh);
      const expC = expectedCreditC(fresh, paidC, true);
      // Recording only ever raises the justified credit, which is always safe.
      const synced = expC > cents(credit?.credit_amount) ? await syncCredit(db, fresh, credit, expC, 'payment recorded') : null;
      return [200, { success: true, idempotent: isRetry, status: 'paid', payment_id: payment.id, paid_amount, balance_due: 0, credit_created: synced, commitments_updated }];
    }

    const newStatus = paidC > 0 ? 'partial' : 'sent';
    const won = await db.invoiceCas({ id: invoice_id, status: fresh.status }, { status: newStatus, paid_amount, balance_due });
    if (won !== 1) return [409, { code: 'INVOICE_CHANGED', error: 'Invoice changed while recording payment. Reload and try again.' }];
    return [200, { success: true, idempotent: isRetry, status: newStatus, payment_id: payment.id, paid_amount, balance_due }];
  } finally {
    await release();
  }
}

async function reversePayment(db, args) {
  const { payment_id, idempotency_key, reason, user_email } = args;
  const payment = await db.getPayment(payment_id);
  if (!payment) return [404, { error: 'Payment not found' }];
  const invoice = await db.getInvoice(payment.invoice_id);
  if (!invoice) return [404, { error: 'Invoice not found' }];
  if (!['sent', 'partial', 'paid'].includes(invoice.status)) {
    return [400, { error: `Payments on a ${invoice.status} invoice can't be reversed.` }];
  }
  const release = await acquireLock(db, invoice.project_id, `payrev_${payment_id}`);
  if (!release) return [409, { success: false, code: 'BILLING_LOCKED', error: 'Another billing action for this project is in progress. Try again in a moment.' }];
  try {
    const fresh = await db.getInvoice(invoice.id);
    if (!['sent', 'partial', 'paid'].includes(fresh.status)) return [409, { code: 'INVOICE_CHANGED', error: `Invoice is now ${fresh.status}. Reload and try again.` }];
    const p = await db.getPayment(payment_id);
    const alreadyReversed = !!p.reversed_at;

    const payments = await db.listPayments(fresh.id);
    const remaining = payments.filter((x) => x.id !== p.id);
    const paidC = activeSumC(remaining);
    const dueC = dueCents(fresh);
    const isPaid = paidC > 0 && paidC >= dueC;
    const newStatus = isPaid ? 'paid' : paidC > 0 ? 'partial' : 'sent';

    // Inspect downstream credit BEFORE changing anything.
    const credit = await findInvoiceCredit(db, fresh);
    const expC = expectedCreditC(fresh, paidC, isPaid);
    const block = await creditBlock(db, credit, expC);
    if (block) return [409, { success: false, code: 'CREDIT_IN_USE', error: block }];
    const draftBlock = await draftCreditBlock(db, fresh, credit, expC);
    if (draftBlock) return [409, { success: false, code: 'CREDIT_PROPOSED_ON_DRAFT', error: draftBlock }];

    if (!alreadyReversed) {
      const won = await db.paymentCas({ id: p.id, reversed_at: null }, {
        reversed_at: new Date().toISOString(), reversed_by_email: user_email, reversal_reason: reason, reversal_idempotency_key: idempotency_key,
      });
      if (won !== 1) return [409, { code: 'ALREADY_REVERSED', error: 'This payment was just reversed by someone else. Reload.' }];
    }

    // Reconcile (also heals a reversal that stopped half-way).
    const creditChange = await syncCredit(db, fresh, credit, expC, `payment reversed: ${reason || p.reversal_reason || ''}`.trim());
    const commitments_reverted = !isPaid && fresh.status === 'paid' ? await revertCommitmentsPaid(db, fresh.id) : 0;
    const lastDate = remaining.filter((x) => !x.reversed_at).map((x) => x.payment_date).sort().pop() || null;
    const won = await db.invoiceCas({ id: fresh.id, status: fresh.status }, {
      status: newStatus, paid_amount: paidC / 100, balance_due: Math.max(0, dueC - paidC) / 100,
      payment_date: isPaid ? lastDate : null, payment_idempotency_key: isPaid ? PAY_KEY(fresh.id) : null,
    });
    if (won !== 1) return [409, { code: 'INVOICE_CHANGED', error: 'Invoice changed during the reversal. The payment is marked reversed; run the reversal again to finish updating the invoice.' }];
    return [200, {
      success: true, idempotent: alreadyReversed, already_reversed: alreadyReversed,
      reversed_by_email: alreadyReversed ? p.reversed_by_email : user_email,
      status: newStatus, paid_amount: paidC / 100, balance_due: Math.max(0, dueC - paidC) / 100,
      credit_change: creditChange, commitments_reverted,
    }];
  } finally {
    await release();
  }
}

function realDb(base44) {
  const sr = base44.asServiceRole.entities;
  const first = async (E, id) => (await E.filter({ id }).catch((e) => (/not a valid record id/i.test(e.message) ? [] : Promise.reject(e))))[0] || null;
  return {
    getInvoice: (id) => first(sr.ProjectInvoice, id),
    findInvoices: (q) => sr.ProjectInvoice.filter(q),
    listLines: (invoice_id) => sr.ProjectInvoiceLine.filter({ invoice_id }),
    findLinesBySource: async (id) => {
      const [a, b] = await Promise.all([sr.ProjectInvoiceLine.filter({ source_id: id }), sr.ProjectInvoiceLine.filter({ part_commitment_id: id })]);
      return [...new Map([...a, ...b].map((l) => [l.id, l])).values()];
    },
    getCommitment: (id) => first(sr.PartCommitment, id),
    updateCommitment: (id, d) => sr.PartCommitment.update(id, d),
    invoiceCas: async (q, set) => (await sr.ProjectInvoice.updateMany(q, { $set: set })).updated,
    findCredits: (q) => sr.ProjectCreditLedger.filter(q),
    createCredit: (d) => sr.ProjectCreditLedger.create(d),
    creditCas: async (q, set) => (await sr.ProjectCreditLedger.updateMany(q, { $set: set })).updated,
    findPayments: (q) => sr.ProjectInvoicePayment.filter(q),
    getPayment: (id) => first(sr.ProjectInvoicePayment, id),
    listPayments: (invoice_id) => sr.ProjectInvoicePayment.filter({ invoice_id }),
    createPayment: (d) => sr.ProjectInvoicePayment.create(d),
    paymentCas: async (q, set) => (await sr.ProjectInvoicePayment.updateMany(q, { $set: set })).updated,
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
    findInvoices: (q) => find('findInvoices', T.invoices, q),
    listLines: (invoice_id) => find('listLines', T.lines, { invoice_id }),
    findLinesBySource: async (id) => { await hit('findLinesBySource'); return [...T.lines.values()].filter((l) => l.source_id === id || l.part_commitment_id === id).map((l) => structuredClone(l)); },
    getCommitment: async (id) => (await find('getCommitment', T.commitments, { id }))[0] || null,
    updateCommitment: async (id, d) => { await hit('updateCommitment'); Object.assign(T.commitments.get(id), d); },
    invoiceCas: (q, set) => cas('invoiceCas', T.invoices, q, set),
    findCredits: (q) => find('findCredits', T.credits, q),
    createCredit: create('createCredit', T.credits),
    creditCas: (q, set) => cas('creditCas', T.credits, q, set),
    findPayments: (q) => find('findPayments', T.payments, q),
    getPayment: async (id) => (await find('getPayment', T.payments, { id }))[0] || null,
    listPayments: (invoice_id) => find('listPayments', T.payments, { invoice_id }),
    createPayment: create('createPayment', T.payments),
    paymentCas: (q, set) => cas('paymentCas', T.payments, q, set),
    getProject: async (id) => (await find('getProject', T.projects, { id }))[0] || null,
    projectCas: (q, set) => cas('projectCas', T.projects, q, set),
  };
}

async function runSelfTest() {
  const seed = (inv = {}, extra = {}) => mockDb({
    invoices: [{ id: 'inv1', project_id: 'p1', status: 'sent', invoice_type: 'progress', subtotal: 1000, credit_applied: 0, paid_amount: 0, ...inv }, ...(extra.invoices || [])],
    lines: [{ id: 'l1', invoice_id: 'inv1', type: 'part', source_id: 'pc1' }, { id: 'l1s', invoice_id: 'inv1', type: 'service', source_id: 'sc1' }, ...(extra.lines || [])],
    commitments: [{ id: 'pc1', billing_status: 'invoiced', invoiced_qty: 2, invoiced_amount: 1000 }],
    credits: extra.credits || [], payments: [],
    projects: [{ id: 'p1', billing_lock_token: extra.lockToken ?? null, billing_lock_at: extra.lockAt ?? null }],
  }, extra.faults);
  let k = 0;
  const pay = (db, amount_cents, key = `k${++k}`) => recordPayment(db, { invoice_id: 'inv1', amount_cents, payment_date: '2026-11-13', idempotency_key: key, user_email: 't@x' }).catch((e) => [e.http || 500, { error: e.message }]);
  const rev = (db, payment_id, key = `r${++k}`) => reversePayment(db, { payment_id, idempotency_key: key, reason: 'entered in error', user_email: 'a@x' }).catch((e) => [e.http || 500, { error: e.message }]);
  const inv = (db) => db.T.invoices.get('inv1');
  const pc = (db) => db.T.commitments.get('pc1');
  const unlocked = (db) => db.T.projects.get('p1').billing_lock_token == null;
  const credits = (db) => [...db.T.credits.values()];
  const results = [];
  const test = async (name, fn) => { try { const d = await fn(); results.push({ name, pass: d.pass, detail: d }); } catch (e) { results.push({ name, pass: false, detail: { error: e.message } }); } };

  await test('1+2. partial payments then final: partial → paid, parts paid only at full payment, no credit', async () => {
    const db = seed();
    const [s1, b1] = await pay(db, 30000); const a = { st: inv(db).status, part: pc(db).billing_status, bal: inv(db).balance_due };
    const [s2, b2] = await pay(db, 70000);
    return { pass: s1 === 200 && b1.status === 'partial' && a.st === 'partial' && a.part === 'invoiced' && a.bal === 700 && s2 === 200 && b2.status === 'paid' && inv(db).paid_amount === 1000 && inv(db).payment_idempotency_key === 'pay:inv1' && pc(db).billing_status === 'paid' && db.T.credits.size === 0 && unlocked(db) };
  });
  await test('3. overpayment on final payment: one credit for the excess', async () => {
    const db = seed();
    await pay(db, 50000); await pay(db, 60000);
    const c = credits(db);
    return { pass: inv(db).status === 'paid' && c.length === 1 && c[0].credit_amount === 100 && c[0].remaining_amount === 100 && c[0].payment_idempotency_key === 'pay_credit:inv1' };
  });
  await test('credit applied at send reduces amount due (1000 - 281.99)', async () => {
    const db = seed({ credit_applied: 281.9900000000018 });
    const [, b] = await pay(db, 71801);
    return { pass: b.status === 'paid' && inv(db).balance_due === 0 && db.T.credits.size === 0 };
  });
  await test('deposit paid in two parts: credit for full deposit once, at full payment (rule unchanged)', async () => {
    const db = seed({ invoice_type: 'deposit', subtotal: 500 });
    await pay(db, 20000); const mid = db.T.credits.size;
    await pay(db, 30000);
    const c = credits(db);
    return { pass: mid === 0 && c.length === 1 && c[0].credit_amount === 500 };
  });
  await test('4. reverse the only partial payment: back to sent, record kept with reason/admin/time', async () => {
    const db = seed();
    const [, b] = await pay(db, 30000);
    const [s, r] = await rev(db, b.payment_id);
    const p = db.T.payments.get(b.payment_id);
    return { pass: s === 200 && r.status === 'sent' && inv(db).status === 'sent' && inv(db).paid_amount === 0 && inv(db).balance_due === 1000 && db.T.payments.size === 1 && !!p.reversed_at && p.reversed_by_email === 'a@x' && p.reversal_reason === 'entered in error' && unlocked(db) };
  });
  await test('5. reverse after full payment: paid → partial, parts back to invoiced, paid key cleared', async () => {
    const db = seed();
    await pay(db, 40000); const [, b2] = await pay(db, 60000);
    const [s, r] = await rev(db, b2.payment_id);
    return { pass: s === 200 && r.status === 'partial' && inv(db).paid_amount === 400 && inv(db).balance_due === 600 && inv(db).payment_idempotency_key == null && inv(db).payment_date == null && pc(db).billing_status === 'invoiced' && pc(db).invoiced_qty === 2 && r.commitments_reverted === 1 };
  });
  await test('5b. reversed invoice can be paid again normally', async () => {
    const db = seed();
    const [, b] = await pay(db, 100000); await rev(db, b.payment_id);
    const [s, r] = await pay(db, 100000);
    return { pass: s === 200 && r.status === 'paid' && pc(db).billing_status === 'paid' && db.T.payments.size === 2 && inv(db).paid_amount === 1000 };
  });
  await test('reverse the overpaying payment, unused credit: credit reduced to what remains justified', async () => {
    const db = seed();
    const [, a] = await pay(db, 3000); await pay(db, 100000); // 1030 paid on 1000 → 30 credit
    const before = credits(db)[0]?.credit_amount;
    const [s, r] = await rev(db, a.payment_id); // 1000 remain → still paid, credit no longer justified
    const c = credits(db)[0];
    return { pass: before === 30 && s === 200 && r.status === 'paid' && c.credit_amount === 0 && c.remaining_amount === 0 && db.T.credits.size === 1 && pc(db).billing_status === 'paid' };
  });
  await test('overpayment → reverse it → overpay again: same credit record updated, no duplicate', async () => {
    const db = seed();
    await pay(db, 50000); const [, b] = await pay(db, 60000); await rev(db, b.payment_id);
    const mid = { st: inv(db).status, c: credits(db)[0].credit_amount };
    const [s] = await pay(db, 70000);
    return { pass: mid.st === 'partial' && mid.c === 0 && s === 200 && inv(db).status === 'paid' && db.T.credits.size === 1 && credits(db)[0].credit_amount === 200 && credits(db)[0].remaining_amount === 200 };
  });
  await test('reversal blocked when the overpayment credit was already used: nothing changes', async () => {
    const db = seed({}, { invoices: [{ id: 'inv2', project_id: 'p1', status: 'sent', qb_invoice_number: 'QB-2' }] });
    await pay(db, 50000); const [, b] = await pay(db, 60000);
    const c = credits(db)[0]; db.T.credits.get(c.id).remaining_amount = 30; db.T.credits.get(c.id).applied_to_invoice_id = 'inv2';
    const [s, r] = await rev(db, b.payment_id);
    return { pass: s === 409 && r.code === 'CREDIT_IN_USE' && /QB-2/.test(r.error) && !db.T.payments.get(b.payment_id).reversed_at && inv(db).status === 'paid' && inv(db).paid_amount === 1100 && db.T.credits.get(c.id).remaining_amount === 30 && unlocked(db), msg: r.error };
  });
  await test('partly used credit: reversal allowed only when the unused part covers it', async () => {
    const db = seed();
    const [, a] = await pay(db, 5000); const [, b] = await pay(db, 5000); await pay(db, 100000);
    const c = credits(db)[0]; db.T.credits.get(c.id).remaining_amount = 80; // 100 credit, 20 used
    const [s1] = await rev(db, b.payment_id); // takes back 50 ≤ 80 unused → allowed
    const mid = { ...db.T.credits.get(c.id) };
    const [s2, r2] = await rev(db, a.payment_id); // would take remaining 50 > 30 unused → blocked
    return { pass: s1 === 200 && mid.credit_amount === 50 && mid.remaining_amount === 30 && s2 === 409 && r2.code === 'CREDIT_IN_USE' && !db.T.payments.get(a.payment_id).reversed_at && inv(db).paid_amount === 1050, s1, mid, s2, r2, paid: inv(db).paid_amount };
  });
  await test('deposit fully paid, credit unused: reversal back to partial removes the deposit credit amount (record kept)', async () => {
    const db = seed({ invoice_type: 'deposit', subtotal: 500 });
    await pay(db, 20000); const [, b] = await pay(db, 30000);
    const [s, r] = await rev(db, b.payment_id);
    const c = credits(db);
    return { pass: s === 200 && r.status === 'partial' && c.length === 1 && c[0].credit_amount === 0 && c[0].remaining_amount === 0 && /payment reversed/.test(c[0].notes) };
  });
  await test('deposit credit already applied: reversal blocked', async () => {
    const db = seed({ invoice_type: 'deposit', subtotal: 500 });
    const [, b] = await pay(db, 50000);
    const c = credits(db)[0]; db.T.credits.get(c.id).remaining_amount = 0;
    const [s, r] = await rev(db, b.payment_id);
    return { pass: s === 409 && r.code === 'CREDIT_IN_USE' && inv(db).status === 'paid' && !db.T.payments.get(b.payment_id).reversed_at };
  });
  await test('draft proposes the overpayment credit: reversal blocked, nothing changes', async () => {
    const db = seed({}, { invoices: [{ id: 'invD', project_id: 'p1', status: 'draft', qb_invoice_number: 'DRAFT-1', credit_proposed: 150 }] });
    await pay(db, 50000); const [, b] = await pay(db, 70000); // 200 credit, unused
    const before = credits(db)[0].remaining_amount;
    const [s, r] = await rev(db, b.payment_id);
    return { pass: before === 200 && s === 409 && r.code === 'CREDIT_PROPOSED_ON_DRAFT' && /DRAFT-1/.test(r.error) && credits(db)[0].remaining_amount === 200 && inv(db).status === 'paid' && !db.T.payments.get(b.payment_id).reversed_at && unlocked(db) };
  });
  await test('draft proposes less than what stays available: reversal allowed', async () => {
    const db = seed({}, { invoices: [{ id: 'invD', project_id: 'p1', status: 'draft', credit_proposed: 50 }], credits: [{ id: 'cOld', project_id: 'p1', credit_amount: 80, remaining_amount: 80 }] });
    await pay(db, 50000); const [, b] = await pay(db, 70000); // +200 credit; total unused 280
    const [s, r] = await rev(db, b.payment_id); // takes back 200 → 80 left ≥ 50 proposed
    return { pass: s === 200 && r.status === 'partial' && credits(db).find((c) => c.id !== 'cOld').remaining_amount === 0 };
  });
  await test('part also billed on another PAID invoice stays paid after reversal', async () => {
    const db = seed({}, { invoices: [{ id: 'inv9', project_id: 'p1', status: 'paid' }], lines: [{ id: 'l9', invoice_id: 'inv9', type: 'part', source_id: 'pc1' }] });
    const [, b] = await pay(db, 100000);
    const [s, r] = await rev(db, b.payment_id);
    return { pass: s === 200 && r.status === 'sent' && pc(db).billing_status === 'paid' && r.commitments_reverted === 0 };
  });
  await test('6. same payment key retried 3x: one payment record', async () => {
    const db = seed();
    for (let i = 0; i < 3; i++) await pay(db, 25000, 'same');
    return { pass: db.T.payments.size === 1 && inv(db).paid_amount === 250 && inv(db).status === 'partial' };
  });
  await test('7. duplicate reversal (same key and a different key): reversed once, totals unchanged', async () => {
    const db = seed();
    await pay(db, 40000); const [, b] = await pay(db, 20000);
    const [s1] = await rev(db, b.payment_id, 'rk'); const snap = { ...db.T.payments.get(b.payment_id) };
    const [s2, r2] = await rev(db, b.payment_id, 'rk');
    const [s3, r3] = await rev(db, b.payment_id, 'other');
    const p = db.T.payments.get(b.payment_id);
    return { pass: s1 === 200 && s2 === 200 && r2.already_reversed && s3 === 200 && r3.already_reversed && p.reversed_at === snap.reversed_at && p.reversal_idempotency_key === 'rk' && inv(db).paid_amount === 400 && inv(db).status === 'partial' };
  });
  await test('7b. two different admins reverse concurrently: one reversal recorded', async () => {
    const db = seed();
    await pay(db, 40000); const [, b] = await pay(db, 20000);
    const res = await Promise.all([rev(db, b.payment_id, 'x1'), rev(db, b.payment_id, 'x2')]);
    const p = db.T.payments.get(b.payment_id);
    return { pass: res.every(([s]) => s === 200 || s === 409) && ['x1', 'x2'].includes(p.reversal_idempotency_key) && inv(db).paid_amount === 400 && unlocked(db), statuses: res.map(([s]) => s) };
  });
  await test('reversal crash after flagging payment: retry heals invoice totals', async () => {
    const db = seed({}, { faults: { invoiceCas: { throwOn: [3] } } });
    await pay(db, 40000); const [, b] = await pay(db, 20000);
    const [s1] = await rev(db, b.payment_id, 'rc'); const mid = { st: inv(db).paid_amount, rev: !!db.T.payments.get(b.payment_id).reversed_at, unlocked: unlocked(db) };
    const [s2] = await rev(db, b.payment_id, 'rc');
    return { pass: s1 === 500 && mid.st === 600 && mid.rev && mid.unlocked && s2 === 200 && inv(db).paid_amount === 400 && inv(db).balance_due === 600 };
  });
  await test('payment saved but invoice update fails: retry with same key heals without duplicate', async () => {
    const db = seed({}, { faults: { invoiceCas: { throwOn: [1] } } });
    const [s1] = await pay(db, 40000, 'r'); const mid = { st: inv(db).status, n: db.T.payments.size, unlocked: unlocked(db) };
    const [s2, b2] = await pay(db, 40000, 'r');
    return { pass: s1 === 500 && mid.st === 'sent' && mid.n === 1 && mid.unlocked && s2 === 200 && b2.idempotent && db.T.payments.size === 1 && inv(db).status === 'partial' && inv(db).paid_amount === 400 };
  });
  await test('8. 5 concurrent different payments: serialized, totals correct, losers get 409', async () => {
    const db = seed();
    const res = await Promise.all(Array.from({ length: 5 }, () => pay(db, 10000)));
    const ok = res.filter(([s]) => s === 200).length;
    return { pass: db.T.payments.size === ok && inv(db).paid_amount === ok * 100 && res.every(([s]) => s === 200 || s === 409) && unlocked(db), ok };
  });
  await test('8b. concurrent payment + reversal: serialized, totals match active payments', async () => {
    const db = seed();
    const [, b] = await pay(db, 30000);
    const res = await Promise.all([pay(db, 20000), rev(db, b.payment_id)]);
    const expected = activeSumC([...db.T.payments.values()]) / 100;
    return { pass: inv(db).paid_amount === expected && res.every(([s]) => s === 200 || s === 409) && unlocked(db), statuses: res.map(([s]) => s) };
  });
  await test('9. draft / cancelled / fully paid invoices refuse new payments; reversal refused on cancelled', async () => {
    const a = seed({ status: 'draft' }); const b = seed({ status: 'cancelled' }); const c = seed({ status: 'paid' });
    const [sa] = await pay(a, 100); const [sb] = await pay(b, 100); const [sc] = await pay(c, 100);
    b.T.payments.set('px', { id: 'px', invoice_id: 'inv1', amount_cents: 100 });
    const [sr] = await rev(b, 'px');
    return { pass: sa === 400 && sb === 400 && sc === 400 && sr === 400 && a.T.payments.size + c.T.payments.size === 0 && !b.T.payments.get('px').reversed_at };
  });
  await test('11. lines/allocations untouched: service line, invoiced qty/amount unchanged across pay + reverse', async () => {
    const db = seed();
    const linesBefore = JSON.stringify([...db.T.lines.values()]);
    const [, b] = await pay(db, 100000); await rev(db, b.payment_id);
    return { pass: JSON.stringify([...db.T.lines.values()]) === linesBefore && pc(db).invoiced_qty === 2 && pc(db).invoiced_amount === 1000 && inv(db).subtotal === 1000 && inv(db).credit_applied === 0 };
  });
  await test('lock held elsewhere: 409 for payment and reversal, nothing changed', async () => {
    const db = seed({}, { lockToken: 'other', lockAt: new Date().toISOString() });
    db.T.payments.set('px', { id: 'px', invoice_id: 'inv1', amount_cents: 100 });
    const [s] = await pay(db, 100); const [s2] = await rev(db, 'px');
    return { pass: s === 409 && s2 === 409 && db.T.payments.size === 1 && !db.T.payments.get('px').reversed_at && inv(db).status === 'sent' };
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

    const { idempotency_key } = body;
    if (typeof idempotency_key !== 'string' || idempotency_key.length < 8) return Response.json({ error: 'idempotency_key required' }, { status: 400 });

    if (body.action === 'reverse') {
      const reason = String(body.reason || '').trim().slice(0, 500);
      if (typeof body.payment_id !== 'string' || !body.payment_id) return Response.json({ error: 'payment_id required' }, { status: 400 });
      if (reason.length < 3) return Response.json({ error: 'A reversal reason is required.' }, { status: 400 });
      const [status, payload] = await reversePayment(realDb(base44), { payment_id: body.payment_id, idempotency_key, reason, user_email: user.email })
        .catch((e) => (e.http ? [e.http, { error: e.message }] : Promise.reject(e)));
      return Response.json(payload, { status });
    }

    const { invoice_id, amount, payment_date, method, reference, note } = body;
    if (typeof invoice_id !== 'string' || !invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });
    const amount_cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amount_cents) || amount_cents <= 0) return Response.json({ error: 'Amount must be greater than 0.' }, { status: 400 });
    if (typeof payment_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) return Response.json({ error: 'Payment date required.' }, { status: 400 });
    if (method && !METHODS.includes(method)) return Response.json({ error: 'Invalid payment method.' }, { status: 400 });

    const [status, payload] = await recordPayment(realDb(base44), {
      invoice_id, amount_cents, payment_date, method, reference: String(reference || '').slice(0, 200),
      note: String(note || '').slice(0, 1000), idempotency_key, user_email: user.email,
    }).catch((e) => (e.http ? [e.http, { error: e.message }] : Promise.reject(e)));
    return Response.json(payload, { status });
  } catch (error) {
    console.error('recordInvoicePayment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});