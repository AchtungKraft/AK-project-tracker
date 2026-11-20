import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * projectDepositAction — canonical, admin-only project deposit handler.
 *
 * Deposit credit = ProjectCreditLedger row of a deposit invoice (key pay_credit:{invoice}); recordInvoicePayment keeps it
 * equal to the amount actually received. This function never creates deposit credit itself.
 *
 * actions:
 *  summary            read-only: deposits, balances, open invoices, full history
 *  register_existing  Record Existing Down Payment: registers a deposit invoice that already exists in QuickBooks
 *                     (no new QuickBooks invoice), then records its payment through recordInvoicePayment.
 *                     Duplicate QuickBooks invoice numbers / payment references are refused.
 *  apply              apply available deposit (or any credit with sources:'all') to a sent/partial/overdue invoice
 *  reverse            corrective entry for an application or refund (never edits or deletes the original)
 *  refund             refund unused deposit credit to the client (recorded only; nothing is posted to QuickBooks)
 *
 * Safety: shared per-project billing lock, conditional (compare-and-set) updates, request keys, server-side
 * balance checks (never above the invoice outstanding, the credit remaining, or credit reserved by drafts).
 * Append-only DepositTransaction journal. { self_test: true } runs scenarios on an in-memory database only.
 */

const STALE_MS = 120000;
const DEPOSIT_LOGIC_VERSION = 'dep-v1';
const norm = (s) => String(s || '').trim().toLowerCase();
const METHODS = ['check', 'ach', 'wire', 'card', 'cash', 'other'];
const OPEN = ['sent', 'partial', 'overdue'];
const ISSUED = ['sent', 'partial', 'overdue', 'paid'];
const cents = (n) => Math.round((Number(n) || 0) * 100);
const usd = (c) => `$${(c / 100).toFixed(2)}`;
const label = (inv) => inv?.qb_invoice_number || inv?.id;
const today = () => new Date().toISOString().slice(0, 10);
const fail = (http, code, error) => Object.assign(new Error(error), { http, code });

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
    await db.projectCas({ id: projectId, billing_lock_token: token }, { billing_lock_token: null, billing_lock_at: null }).catch((e) => console.error('[projectDepositAction] lock release failed', e.message));
  }
}

async function loadState(db, project_id) {
  const [invoices, credits, txs, payments] = await Promise.all([
    db.findInvoices({ project_id }), db.findCredits({ project_id }), db.findTx({ project_id }), db.findPayments({ project_id }),
  ]);
  const depIds = new Set(invoices.filter((i) => i.invoice_type === 'deposit').map((i) => i.id));
  const reversed = new Set(txs.filter((t) => t.reverses_transaction_id).map((t) => t.reverses_transaction_id));
  return { invoices, credits, txs, payments, depIds, reversed };
}

const isDepositCredit = (c, st) => !c.reversed_from_invoice_id && st.depIds.has(c.source_invoice_id);

// What can be drawn now: positive rows in FIFO order, minus credit already proposed on drafts (applied at send).
function availability(st, sources = 'deposit') {
  const rows = st.credits
    .filter((c) => cents(c.remaining_amount) >= 1 && (sources === 'all' || isDepositCredit(c, st)))
    .sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id)));
  const poolC = rows.reduce((s, c) => s + cents(c.remaining_amount), 0);
  const totalC = st.credits.reduce((s, c) => s + Math.max(0, cents(c.remaining_amount)), 0);
  const proposedC = st.invoices.filter((i) => i.status === 'draft').reduce((s, i) => s + Math.max(0, cents(i.credit_proposed)), 0);
  return { rows, poolC, proposedC, availC: Math.max(0, Math.min(poolC, totalC - proposedC)) };
}

const outstandingC = (inv) => Math.max(0, cents(inv.subtotal) - cents(inv.credit_applied) - cents(inv.paid_amount));

async function partIds(db, invoice_id) {
  return (await db.listLines(invoice_id)).filter((l) => l.type === 'part').map((l) => l.source_id || l.part_commitment_id).filter(Boolean);
}
async function markPartsPaid(db, invoice_id) {
  for (const id of await partIds(db, invoice_id)) {
    const c = await db.getCommitment(id);
    if (c && c.billing_status !== 'paid') await db.updateCommitment(id, { billing_status: 'paid', invoice_blocked_reason: null });
  }
}
async function revertPartsPaid(db, invoice_id) {
  for (const id of await partIds(db, invoice_id)) {
    const c = await db.getCommitment(id);
    if (!c || c.billing_status !== 'paid') continue;
    const others = [...new Set((await db.findLinesBySource(id)).map((l) => l.invoice_id).filter((x) => x !== invoice_id))];
    let elsewhere = false;
    for (const oid of others) if ((await db.getInvoice(oid))?.status === 'paid') { elsewhere = true; break; }
    if (!elsewhere) await db.updateCommitment(id, { billing_status: 'invoiced' });
  }
}

// New invoice state after its credit_applied changes; payments are untouched.
function invoiceStateAfter(inv, newCreditC) {
  const dueC = Math.max(0, cents(inv.subtotal) - newCreditC);
  const paidC = cents(inv.paid_amount);
  const balC = Math.max(0, dueC - paidC);
  const status = balC === 0 ? 'paid' : paidC > 0 ? 'partial' : inv.status === 'overdue' ? 'overdue' : 'sent';
  const set = { credit_applied: newCreditC / 100, balance_due: balC / 100, status };
  if (status === 'paid' && inv.status !== 'paid') Object.assign(set, { payment_date: inv.payment_date || today(), payment_idempotency_key: `pay:${inv.id}` });
  if (status !== 'paid' && inv.status === 'paid') Object.assign(set, { payment_date: null, payment_idempotency_key: null });
  return set;
}

async function restoreLedger(db, moves) {
  for (const m of moves.reverse()) {
    await db.creditCas({ id: m.id, remaining_amount: m.after / 100 }, { remaining_amount: m.before / 100, applied_to_invoice_id: m.prevApplied ?? null })
      .catch((e) => console.error('[projectDepositAction] ledger rollback failed', m.id, e.message));
  }
}

async function apply(db, a) {
  const inv0 = await db.getInvoice(a.invoice_id);
  if (!inv0) throw fail(404, 'NOT_FOUND', 'Invoice not found');
  if (inv0.invoice_type === 'deposit') throw fail(400, 'DEPOSIT_TARGET', 'A deposit cannot be applied to a deposit invoice.');
  return withLock(db, inv0.project_id, `depapply_${a.invoice_id}`, async () => {
    const prior = await db.findTx({ application_id: a.key });
    if (prior.length) return { success: true, idempotent: true, applied_cents: prior.filter((t) => t.type === 'apply').reduce((s, t) => s + t.amount_cents, 0) };
    const inv = await db.getInvoice(a.invoice_id);
    if (!OPEN.includes(inv.status)) throw fail(409, 'INVOICE_NOT_OPEN', `Deposit can only be applied to sent, partially paid or overdue invoices (this one is ${inv.status}).`);
    const st = await loadState(db, inv.project_id);
    const outC = outstandingC(inv);
    const { rows, availC, proposedC } = availability(st, a.sources);
    if (a.amount_cents > outC) throw fail(409, 'EXCEEDS_INVOICE', `Invoice ${label(inv)} only has ${usd(outC)} outstanding.`);
    if (a.amount_cents > availC) throw fail(409, 'EXCEEDS_AVAILABLE', `Only ${usd(availC)} is available${proposedC ? ` (${usd(proposedC)} is reserved by draft invoices)` : ''}.`);

    const moves = [];
    let invoiceSet = null;
    try {
      let left = a.amount_cents;
      for (const row of rows) {
        if (left <= 0) break;
        const before = cents(row.remaining_amount);
        const take = Math.min(before, left);
        const won = await db.creditCas({ id: row.id, remaining_amount: row.remaining_amount }, { remaining_amount: (before - take) / 100, applied_to_invoice_id: inv.id });
        if (won !== 1) throw fail(409, 'CREDIT_CHANGED', 'Client credit changed during this action. Nothing was applied. Try again.');
        moves.push({ id: row.id, before, after: before - take, take, prevApplied: row.applied_to_invoice_id, source_invoice_id: row.source_invoice_id });
        left -= take;
      }
      invoiceSet = invoiceStateAfter(inv, cents(inv.credit_applied) + a.amount_cents);
      const won = await db.invoiceCas({ id: inv.id, status: inv.status }, invoiceSet);
      if (won !== 1) { invoiceSet = null; throw fail(409, 'INVOICE_CHANGED', 'Invoice changed during this action. Nothing was applied. Try again.'); }
      if (invoiceSet.status === 'paid') await markPartsPaid(db, inv.id);
      const now = new Date().toISOString();
      await db.createTx(moves.map((m, i) => ({
        type: 'apply', project_id: inv.project_id, application_id: a.key, idempotency_key: `${a.key}:${i}`,
        credit_ledger_id: m.id, source_invoice_id: m.source_invoice_id, target_invoice_id: inv.id, amount_cents: m.take,
        ledger_before_cents: m.before, ledger_after_cents: m.after, note: a.note || '', actor_email: a.user_email, recorded_at: now, transaction_date: today(),
      })));
      return { success: true, applied_cents: a.amount_cents, invoice_status: invoiceSet.status, balance_due: invoiceSet.balance_due, portions: moves.length };
    } catch (e) {
      if (invoiceSet) {
        await db.invoiceCas({ id: inv.id, status: invoiceSet.status }, { credit_applied: inv.credit_applied ?? 0, balance_due: inv.balance_due ?? 0, status: inv.status, payment_date: inv.payment_date ?? null, payment_idempotency_key: inv.payment_idempotency_key ?? null }).catch(() => {});
        if (invoiceSet.status === 'paid' && inv.status !== 'paid') await revertPartsPaid(db, inv.id).catch(() => {});
      }
      await restoreLedger(db, moves);
      throw e;
    }
  });
}

async function refund(db, a) {
  const [row] = await db.findCredits({ id: a.credit_ledger_id });
  if (!row) throw fail(404, 'NOT_FOUND', 'Deposit credit not found');
  return withLock(db, row.project_id, `deprefund_${row.id}`, async () => {
    const prior = await db.findTx({ application_id: a.key });
    if (prior.length) return { success: true, idempotent: true };
    const st = await loadState(db, row.project_id);
    const fresh = st.credits.find((c) => c.id === row.id);
    if (!isDepositCredit(fresh, st)) throw fail(400, 'NOT_DEPOSIT', 'Only deposit credit can be refunded here.');
    const { availC } = availability(st, 'deposit');
    const before = cents(fresh.remaining_amount);
    if (a.amount_cents > before) throw fail(409, 'EXCEEDS_AVAILABLE', `This deposit only has ${usd(before)} unused.`);
    if (a.amount_cents > availC) throw fail(409, 'EXCEEDS_AVAILABLE', `Only ${usd(availC)} is free to refund; the rest is reserved by draft invoices.`);
    const won = await db.creditCas({ id: fresh.id, remaining_amount: fresh.remaining_amount }, { remaining_amount: (before - a.amount_cents) / 100 });
    if (won !== 1) throw fail(409, 'CREDIT_CHANGED', 'Deposit credit changed during this action. Try again.');
    try {
      await db.createTx([{
        type: 'refund', project_id: fresh.project_id, application_id: a.key, idempotency_key: `${a.key}:0`, credit_ledger_id: fresh.id,
        source_invoice_id: fresh.source_invoice_id, amount_cents: a.amount_cents, ledger_before_cents: before, ledger_after_cents: before - a.amount_cents,
        method: a.method, reference: a.reference, transaction_date: a.date, note: a.note || '', actor_email: a.user_email, recorded_at: new Date().toISOString(),
      }]);
    } catch (e) { await restoreLedger(db, [{ id: fresh.id, before, after: before - a.amount_cents, prevApplied: fresh.applied_to_invoice_id }]); throw e; }
    return { success: true, refunded_cents: a.amount_cents };
  });
}

async function reverse(db, a) {
  const [first] = await db.findTx({ application_id: a.application_id });
  if (!first) throw fail(404, 'NOT_FOUND', 'Deposit entry not found');
  if (!['apply', 'refund'].includes(first.type)) throw fail(400, 'NOT_REVERSIBLE', 'Only applications and refunds can be reversed.');
  if (SYSTEM_APP.test(a.application_id)) throw fail(400, 'SEND_APPLICATION', 'Credit applied when an invoice was sent is returned to its original deposit by cancelling that invoice.');
  return withLock(db, first.project_id, `deprev_${a.application_id}`, async () => {
    const entries = (await db.findTx({ application_id: a.application_id })).filter((t) => t.type === first.type);
    const st = await loadState(db, first.project_id);
    if (entries.every((t) => st.reversed.has(t.id))) return { success: true, idempotent: true, already_reversed: true };
    if (entries.some((t) => st.reversed.has(t.id))) throw fail(409, 'PARTLY_REVERSED', 'Part of this entry is already reversed. Contact an administrator.');
    const total = entries.reduce((s, t) => s + t.amount_cents, 0);
    let inv = null; let invoiceSet = null;
    if (first.type === 'apply') {
      inv = st.invoices.find((i) => i.id === first.target_invoice_id);
      if (!inv || !ISSUED.includes(inv.status)) throw fail(409, 'INVOICE_NOT_OPEN', `Invoice is ${inv?.status || 'missing'}; this application can't be reversed.`);
      const over = st.credits.find((c) => c.payment_idempotency_key === `pay_credit:${inv.id}` && cents(c.credit_amount) > 0);
      if (over) throw fail(409, 'OVERPAYMENT_CREDIT', `Invoice ${label(inv)} has an overpayment credit. Reverse the extra payment first, then this application.`);
      if (cents(inv.credit_applied) < total) throw fail(409, 'CREDIT_MISMATCH', 'Invoice credit is lower than this application. Contact an administrator.');
      invoiceSet = invoiceStateAfter(inv, cents(inv.credit_applied) - total);
    }
    const moves = [];
    try {
      for (const t of entries) {
        const row = st.credits.find((c) => c.id === t.credit_ledger_id);
        const before = cents(row.remaining_amount);
        const won = await db.creditCas({ id: row.id, remaining_amount: row.remaining_amount }, { remaining_amount: (before + t.amount_cents) / 100 });
        if (won !== 1) throw fail(409, 'CREDIT_CHANGED', 'Client credit changed during this action. Try again.');
        row.remaining_amount = (before + t.amount_cents) / 100;
        moves.push({ id: row.id, before, after: before + t.amount_cents, t });
      }
      if (invoiceSet) {
        const won = await db.invoiceCas({ id: inv.id, status: inv.status }, invoiceSet);
        if (won !== 1) { invoiceSet = null; throw fail(409, 'INVOICE_CHANGED', 'Invoice changed during this action. Try again.'); }
        if (inv.status === 'paid' && invoiceSet.status !== 'paid') await revertPartsPaid(db, inv.id);
      }
      const now = new Date().toISOString();
      await db.createTx(moves.map((m, i) => ({
        type: first.type === 'apply' ? 'apply_reversal' : 'refund_reversal', project_id: first.project_id, application_id: a.key,
        idempotency_key: `${a.key}:${i}`, reverses_transaction_id: m.t.id, credit_ledger_id: m.id, source_invoice_id: m.t.source_invoice_id,
        target_invoice_id: m.t.target_invoice_id || null, amount_cents: m.t.amount_cents, ledger_before_cents: m.before, ledger_after_cents: m.after,
        note: a.reason, actor_email: a.user_email, recorded_at: now, transaction_date: today(),
      })));
      return { success: true, reversed_cents: total, invoice_status: invoiceSet?.status };
    } catch (e) {
      if (invoiceSet) await db.invoiceCas({ id: inv.id, status: invoiceSet.status }, { credit_applied: inv.credit_applied ?? 0, balance_due: inv.balance_due ?? 0, status: inv.status, payment_date: inv.payment_date ?? null, payment_idempotency_key: inv.payment_idempotency_key ?? null }).catch(() => {});
      for (const m of moves.reverse()) await db.creditCas({ id: m.id, remaining_amount: m.after / 100 }, { remaining_amount: m.before / 100 }).catch(() => {});
      throw e;
    }
  });
}

async function registerExisting(db, a) {
  const project = await db.getProject(a.project_id);
  if (!project) throw fail(404, 'NOT_FOUND', 'Project not found');
  if (project.is_system_project) throw fail(400, 'SYSTEM_PROJECT', 'System projects cannot hold client deposits.');
  if (project.billing_designation === 'NON_BILLABLE') throw fail(400, 'NON_BILLABLE', 'This project is Non-Billable. Change its billing status before recording a deposit.');
  const regKey = `register:${a.key}`;
  const invoice = await withLock(db, a.project_id, `depreg_${a.key}`, async () => {
    const [prior] = await db.findTx({ idempotency_key: regKey });
    if (prior) return db.getInvoice(prior.source_invoice_id);
    const dupInv = (await db.findInvoices({ qb_invoice_number: a.qb_invoice_number })).find((i) => !['cancelled', 'void'].includes(i.status));
    if (dupInv) {
      throw Object.assign(fail(409, 'DUPLICATE_INVOICE', dupInv.project_id === a.project_id
        ? `QuickBooks invoice ${a.qb_invoice_number} is already recorded on this project. Record the payment on that deposit invoice instead.`
        : `QuickBooks invoice ${a.qb_invoice_number} is already recorded on another project.`), { existing_invoice_id: dupInv.id });
    }
    // Payment references are unique per project (a QuickBooks invoice number is not a payment identifier).
    const ref = norm(a.payment.reference);
    const dupPay = ref && ref !== norm(a.qb_invoice_number) ? (await db.findPayments({ project_id: a.project_id })).find((p) => !p.reversed_at && norm(p.reference) === ref) : null;
    if (dupPay) throw fail(409, 'DUPLICATE_PAYMENT', `Payment reference ${a.payment.reference} is already recorded (invoice ${dupPay.invoice_id}). Nothing was created.`);
    const amount = a.invoice_amount_cents / 100;
    const inv = await db.createInvoice({
      project_id: a.project_id, invoice_type: 'deposit', status: 'sent', qb_invoice_number: a.qb_invoice_number,
      qb_invoice_date: a.invoice_date, issue_date: a.invoice_date, subtotal: amount, total: amount, balance_due: amount, paid_amount: 0,
      credit_proposed: 0, credit_applied: 0, notes: a.notes || '', recorded_from_quickbooks: true,
    });
    await db.createLine({ invoice_id: inv.id, type: 'manual', source_entity: 'Manual', description: `Client down payment · QuickBooks invoice ${a.qb_invoice_number}`, qty: 1, unit_price: amount, line_total: amount, sort_order: 0 });
    await db.createTx([{
      type: 'register_existing', project_id: a.project_id, client_account_id: project.client_account_id || null, application_id: a.key, idempotency_key: regKey,
      source_invoice_id: inv.id, amount_cents: a.invoice_amount_cents, reference: a.qb_invoice_number, transaction_date: a.invoice_date,
      note: a.notes || '', actor_email: a.user_email, recorded_at: new Date().toISOString(),
    }]);
    return inv;
  });
  // Lock released: the canonical payment handler takes it. Deterministic key makes a retry heal without a second receipt.
  const pay = await db.recordPayment({ invoice_id: invoice.id, amount: a.payment.amount_cents / 100, payment_date: a.payment.date, method: a.payment.method, reference: a.payment.reference, note: a.payment.note, idempotency_key: `regpay:${a.key}` });
  if (!pay?.success) throw Object.assign(fail(409, 'PAYMENT_NOT_RECORDED', `Deposit invoice ${a.qb_invoice_number} was recorded, but the payment was not: ${pay?.error || 'unknown error'}. Retry, or record the payment on that invoice.`), { existing_invoice_id: invoice.id });
  return { success: true, invoice_id: invoice.id, payment: pay };
}

// QuickBooks status shown to admins. Nothing here posts to QuickBooks: AK PROJECTS only records what an admin confirms.
const QB = { IN: 'in_quickbooks', NEEDS: 'needs_manual_entry', DONE: 'reconciled' };
const SYSTEM_APP = /^(send|cancel):/; // applied at send / returned when that invoice was cancelled

async function summary(db, project_id) {
  const st = await loadState(db, project_id);
  const active = (t) => !st.reversed.has(t.id);
  const recon = new Map(st.txs.filter((t) => t.type === 'qb_reconcile').map((t) => [t.reconciles_ref, t]));
  const qb = (ref, inQb) => {
    const r = recon.get(ref);
    return r ? { qb_ref: ref, qb_status: QB.DONE, qb_reference: r.reference || null, qb_reconciled_by: r.actor_email, qb_reconciled_at: r.recorded_at }
      : { qb_ref: ref, qb_status: inQb ? QB.IN : QB.NEEDS };
  };
  const deposits = st.invoices.filter((i) => i.invoice_type === 'deposit' && i.status !== 'draft').map((inv) => {
    const pays = st.payments.filter((p) => p.invoice_id === inv.id);
    const credit = st.credits.find((c) => c.payment_idempotency_key === `pay_credit:${inv.id}`) || st.credits.find((c) => c.source_invoice_id === inv.id && !c.reversed_from_invoice_id);
    const refundedC = st.txs.filter((t) => t.type === 'refund' && active(t) && t.credit_ledger_id === credit?.id).reduce((s, t) => s + t.amount_cents, 0);
    const creditC = cents(credit?.credit_amount); const remC = Math.max(0, cents(credit?.remaining_amount));
    const fromQb = !!inv.recorded_from_quickbooks;
    return {
      invoice_id: inv.id, qb_invoice_number: inv.qb_invoice_number || null, status: inv.status, issue_date: inv.issue_date || null, recorded_from_quickbooks: fromQb,
      origin: fromQb ? 'quickbooks_existing' : 'ak_projects', qb_export_status: inv.qb_export_status || null, qb_link_reference: inv.qb_link_reference || null,
      export_eligible: !fromQb && !inv.qb_export_status && inv.status !== 'cancelled',
      invoiced: cents(inv.subtotal) / 100, received: pays.filter((p) => !p.reversed_at).reduce((s, p) => s + p.amount_cents, 0) / 100,
      payment_count: pays.filter((p) => !p.reversed_at).length,
      outstanding: OPEN.includes(inv.status) ? cents(inv.balance_due) / 100 : 0, credit_ledger_id: credit?.id || null,
      credit: creditC / 100, refunded: refundedC / 100, remaining: remC / 100, applied: Math.max(0, creditC - remC - refundedC) / 100,
      ...qb(`invoice:${inv.id}`, fromQb || !!inv.qb_export_status),
    };
  });
  const issued = deposits.filter((d) => ISSUED.includes(d.status));
  const sum = (rows, k) => Math.round(rows.reduce((s, r) => s + cents(r[k]), 0)) / 100;
  const { availC, proposedC } = availability(st, 'deposit');
  const allAvail = availability(st, 'all');
  const invById = new Map(st.invoices.map((i) => [i.id, i]));
  const depCreditIds = new Set(deposits.map((d) => d.credit_ledger_id).filter(Boolean));
  const sendJournaled = new Set(st.txs.filter((t) => String(t.application_id).startsWith('send:')).map((t) => t.application_id));

  const history = [];
  for (const p of st.payments.filter((x) => st.depIds.has(x.invoice_id))) {
    history.push({ key: `pay:${p.id}`, at: p.recorded_at || p.payment_date, date: p.payment_date, kind: 'received', amount: p.amount_cents / 100, deposit: label(invById.get(p.invoice_id)), detail: [p.method, p.reference].filter(Boolean).join(' · '), actor: p.recorded_by_email, ...qb(`payment:${p.id}`, String(p.idempotency_key || '').startsWith('regpay:')) });
    if (p.reversed_at) history.push({ key: `payrev:${p.id}`, at: p.reversed_at, date: p.reversed_at.slice(0, 10), kind: 'received_reversed', amount: -p.amount_cents / 100, deposit: label(invById.get(p.invoice_id)), detail: p.reversal_reason, actor: p.reversed_by_email, ...qb(`payment_reversal:${p.id}`, false) });
  }
  // Legacy sends made before send-time applications were journaled: shown from the invoice's own deduction journal.
  for (const inv of st.invoices.filter((i) => i.status !== 'draft' && i.credit_plan_state === 'applied' && !sendJournaled.has(`send:${i.id}`))) {
    for (const step of (inv.credit_application_plan || []).filter((s) => depCreditIds.has(s.credit_id))) {
      const row = st.credits.find((c) => c.id === step.credit_id);
      history.push({ key: `send:${inv.id}:${step.credit_id}`, at: inv.issue_date, date: inv.issue_date, kind: 'applied_at_send', amount: -cents(step.amount) / 100, deposit: label(invById.get(row?.source_invoice_id)), invoice: label(inv), invoice_status: inv.status, ...qb(`app:send:${inv.id}`, false) });
    }
  }
  const groups = new Map();
  for (const t of st.txs.filter((x) => x.type !== 'qb_reconcile')) { if (!groups.has(t.application_id)) groups.set(t.application_id, []); groups.get(t.application_id).push(t); }
  for (const [appId, ts] of groups) {
    const t = ts[0]; const amt = ts.reduce((s, x) => s + x.amount_cents, 0) / 100;
    const sign = { apply: -1, refund: -1, apply_reversal: 1, refund_reversal: 1, register_existing: 0 }[t.type];
    const kind = appId.startsWith('send:') ? 'applied_at_send' : appId.startsWith('cancel:') ? 'restored_on_cancel' : t.type;
    const target = t.target_invoice_id ? invById.get(t.target_invoice_id) : null;
    history.push({
      key: `tx:${appId}:${t.type}`, application_id: appId, at: t.recorded_at, date: t.transaction_date || t.recorded_at?.slice(0, 10), kind,
      amount: sign === 0 ? amt : sign * amt, deposit: [...new Set(ts.map((x) => label(invById.get(x.source_invoice_id))))].join(', '),
      invoice: target ? label(target) : null, invoice_status: target?.status || null, detail: [t.method, t.reference, t.note].filter(Boolean).join(' · '), actor: t.actor_email,
      reversible: ['apply', 'refund'].includes(t.type) && !SYSTEM_APP.test(appId) && ts.every(active),
      ...qb(`app:${appId}`, t.type === 'register_existing'),
    });
  }
  history.sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')));
  const projectOpen = st.invoices.filter((i) => i.invoice_type !== 'deposit' && OPEN.includes(i.status) && outstandingC(i) > 0);

  return {
    success: true,
    logic_version: DEPOSIT_LOGIC_VERSION,
    totals: {
      requested: sum(issued, 'invoiced'), received: sum(deposits, 'received'), credit_created: sum(deposits, 'credit'),
      applied: sum(deposits, 'applied'), refunded: sum(deposits, 'refunded'), remaining: sum(deposits, 'remaining'),
      deposit_invoices_outstanding: sum(issued, 'outstanding'), reserved_by_drafts: proposedC / 100,
      available_to_apply: availC / 100, available_all_credit: allAvail.availC / 100,
      project_invoices_outstanding: projectOpen.reduce((s, i) => s + outstandingC(i), 0) / 100,
      needs_qb_entry: [...deposits.filter((d) => d.status !== 'cancelled'), ...history].filter((x) => x.qb_status === QB.NEEDS).length,
    },
    deposits,
    open_invoices: projectOpen.map((i) => ({
      id: i.id, label: label(i), invoice_type: i.invoice_type, status: i.status, subtotal: cents(i.subtotal) / 100,
      credit_applied: cents(i.credit_applied) / 100, paid_amount: cents(i.paid_amount) / 100, outstanding: outstandingC(i) / 100,
    })),
    history,
  };
}

// Admin confirms an item was entered in QuickBooks. Append-only; one confirmation per item.
async function qbReconcile(db, a) {
  return withLock(db, a.project_id, `qbrec_${a.project_id}`, async () => {
    const s = await summary(db, a.project_id);
    const item = s.deposits.find((d) => d.qb_ref === a.ref) || s.history.find((h) => h.qb_ref === a.ref);
    if (!item) throw fail(404, 'NOT_FOUND', 'That deposit item was not found on this project.');
    if (item.qb_status === QB.DONE) return { success: true, idempotent: true, qb_status: QB.DONE };
    await db.createTx([{
      type: 'qb_reconcile', project_id: a.project_id, application_id: `qbrec:${a.ref}`, idempotency_key: `qbrec:${a.ref}`, reconciles_ref: a.ref,
      amount_cents: Math.abs(cents(item.amount ?? item.invoiced)), reference: a.qb_reference, note: a.note || '', actor_email: a.user_email,
      recorded_at: new Date().toISOString(), transaction_date: today(),
    }]);
    return { success: true, qb_status: QB.DONE };
  });
}

// AK-created deposit invoice that already exists in QuickBooks (entered by hand): excluded from future exports.
async function qbLink(db, a) {
  const inv = await db.getInvoice(a.invoice_id);
  if (!inv) throw fail(404, 'NOT_FOUND', 'Invoice not found');
  if (inv.invoice_type !== 'deposit') throw fail(400, 'NOT_DEPOSIT', 'Only deposit invoices are linked here.');
  if (inv.recorded_from_quickbooks) throw fail(400, 'FROM_QUICKBOOKS', 'This deposit was recorded from QuickBooks; it already exists there.');
  if (['draft', 'cancelled', 'void'].includes(inv.status)) throw fail(409, 'NOT_ISSUED', `This deposit invoice is ${inv.status}.`);
  return withLock(db, inv.project_id, `qblink_${inv.id}`, async () => {
    const won = await db.invoiceCas({ id: inv.id, qb_export_status: null }, { qb_export_status: 'linked', qb_link_reference: a.qb_reference, qb_linked_at: new Date().toISOString(), qb_linked_by: a.user_email });
    if (won !== 1) {
      const fresh = await db.getInvoice(inv.id);
      if (fresh?.qb_export_status) return { success: true, idempotent: true, qb_export_status: fresh.qb_export_status };
      throw fail(409, 'INVOICE_CHANGED', 'Invoice changed. Reload and try again.');
    }
    return { success: true, qb_export_status: 'linked' };
  });
}

function realDb(base44) {
  const sr = base44.asServiceRole.entities;
  const first = async (E, id) => (await E.filter({ id }).catch((e) => (/not a valid record id/i.test(e.message) ? [] : Promise.reject(e))))[0] || null;
  const all = (E, q) => E.filter(q, 'created_date', 5000);
  return {
    getProject: (id) => first(sr.Project, id),
    projectCas: async (q, set) => (await sr.Project.updateMany(q, { $set: set })).updated,
    getInvoice: (id) => first(sr.ProjectInvoice, id),
    findInvoices: (q) => all(sr.ProjectInvoice, q),
    createInvoice: (d) => sr.ProjectInvoice.create(d),
    invoiceCas: async (q, set) => (await sr.ProjectInvoice.updateMany(q, { $set: set })).updated,
    listLines: (invoice_id) => sr.ProjectInvoiceLine.filter({ invoice_id }),
    createLine: (d) => sr.ProjectInvoiceLine.create(d),
    findLinesBySource: async (id) => {
      const [a, b] = await Promise.all([sr.ProjectInvoiceLine.filter({ source_id: id }), sr.ProjectInvoiceLine.filter({ part_commitment_id: id })]);
      return [...new Map([...a, ...b].map((l) => [l.id, l])).values()];
    },
    getCommitment: (id) => first(sr.PartCommitment, id),
    updateCommitment: (id, d) => sr.PartCommitment.update(id, d),
    findCredits: (q) => all(sr.ProjectCreditLedger, q),
    creditCas: async (q, set) => (await sr.ProjectCreditLedger.updateMany(q, { $set: set })).updated,
    findPayments: (q) => all(sr.ProjectInvoicePayment, q),
    findTx: (q) => all(sr.DepositTransaction, q),
    createTx: (rows) => sr.DepositTransaction.bulkCreate(rows),
    recordPayment: async (payload) => {
      const res = await base44.functions.invoke('recordInvoicePayment', payload).catch((e) => e.response || { data: { error: e.message } });
      return res.data;
    },
  };
}

// ───────────── In-memory test harness (never touches real records) ─────────────
function mockDb(seed) {
  const T = {};
  for (const k of ['projects', 'invoices', 'lines', 'commitments', 'credits', 'payments', 'txs']) T[k] = new Map((seed[k] || []).map((r) => [r.id, structuredClone(r)]));
  let seq = 0;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const match = (r, q) => Object.entries(q).every(([k, v]) => (v === null ? r[k] == null : r[k] === v));
  const find = async (map, q) => { await tick(); return [...map.values()].filter((r) => match(r, q)).map((r) => structuredClone(r)); };
  const cas = async (map, q, set) => { await tick(); let u = 0; for (const r of map.values()) if (match(r, q)) { Object.assign(r, structuredClone(set)); u++; } return u; };
  const create = (map, p) => async (d) => { await tick(); const r = { id: `${p}${++seq}`, created_date: `2026-01-01T00:00:${String(seq).padStart(2, '0')}`, ...d }; map.set(r.id, r); return structuredClone(r); };
  const db = {
    T,
    getProject: async (id) => (await find(T.projects, { id }))[0] || null,
    projectCas: (q, s) => cas(T.projects, q, s),
    getInvoice: async (id) => (await find(T.invoices, { id }))[0] || null,
    findInvoices: (q) => find(T.invoices, q),
    createInvoice: create(T.invoices, 'inv'),
    invoiceCas: (q, s) => cas(T.invoices, q, s),
    listLines: (invoice_id) => find(T.lines, { invoice_id }),
    createLine: create(T.lines, 'l'),
    findLinesBySource: async (id) => [...T.lines.values()].filter((l) => l.source_id === id),
    getCommitment: async (id) => (await find(T.commitments, { id }))[0] || null,
    updateCommitment: async (id, d) => { await tick(); Object.assign(T.commitments.get(id), d); },
    findCredits: (q) => find(T.credits, q),
    creditCas: (q, s) => cas(T.credits, q, s),
    findPayments: (q) => find(T.payments, q),
    findTx: (q) => find(T.txs, q),
    createTx: async (rows) => { for (const r of rows) await create(T.txs, 'tx')(r); },
    // Mirrors recordInvoicePayment: one payment per key; deposit credit = amount received.
    recordPayment: async (p) => {
      await tick();
      if (![...T.payments.values()].some((x) => x.idempotency_key === p.idempotency_key)) {
        await create(T.payments, 'pay')({ invoice_id: p.invoice_id, project_id: T.invoices.get(p.invoice_id).project_id, amount_cents: Math.round(p.amount * 100), payment_date: p.payment_date, reference: p.reference, idempotency_key: p.idempotency_key });
      }
      const inv = T.invoices.get(p.invoice_id);
      const paidC = [...T.payments.values()].filter((x) => x.invoice_id === inv.id && !x.reversed_at).reduce((s, x) => s + x.amount_cents, 0);
      Object.assign(inv, { paid_amount: paidC / 100, balance_due: Math.max(0, cents(inv.subtotal) - paidC) / 100, status: paidC >= cents(inv.subtotal) ? 'paid' : 'partial' });
      const c = [...T.credits.values()].find((x) => x.payment_idempotency_key === `pay_credit:${inv.id}`);
      if (!c) await create(T.credits, 'cr')({ project_id: inv.project_id, source_invoice_id: inv.id, credit_amount: paidC / 100, remaining_amount: paidC / 100, payment_idempotency_key: `pay_credit:${inv.id}` });
      else { c.remaining_amount = (cents(c.remaining_amount) + paidC - cents(c.credit_amount)) / 100; c.credit_amount = paidC / 100; }
      return { success: true };
    },
  };
  return db;
}

async function runSelfTest() {
  const base = (extra = {}) => mockDb({
    projects: [{ id: 'p1', billing_lock_token: extra.lock ?? null, billing_lock_at: extra.lock ? new Date().toISOString() : null }],
    invoices: [
      { id: 'd1', project_id: 'p1', invoice_type: 'deposit', status: 'paid', subtotal: 300, paid_amount: 300, qb_invoice_number: 'QB-D1' },
      { id: 'd2', project_id: 'p1', invoice_type: 'deposit', status: 'partial', subtotal: 500, paid_amount: 200, balance_due: 300, qb_invoice_number: 'QB-D2' },
      { id: 'i1', project_id: 'p1', invoice_type: 'progress', status: 'sent', subtotal: 1000, credit_applied: 0, paid_amount: 0, balance_due: 1000, qb_invoice_number: 'QB-1' },
      { id: 'i2', project_id: 'p1', invoice_type: 'progress', status: 'sent', subtotal: 150, credit_applied: 0, paid_amount: 0, balance_due: 150, qb_invoice_number: 'QB-2' },
      ...(extra.invoices || []),
    ],
    lines: [{ id: 'l2', invoice_id: 'i2', type: 'part', source_id: 'pc1' }],
    commitments: [{ id: 'pc1', billing_status: 'invoiced' }],
    credits: [
      { id: 'c1', project_id: 'p1', source_invoice_id: 'd1', credit_amount: 300, remaining_amount: 300, payment_idempotency_key: 'pay_credit:d1', created_date: '2026-01-01' },
      { id: 'c2', project_id: 'p1', source_invoice_id: 'd2', credit_amount: 200, remaining_amount: 200, payment_idempotency_key: 'pay_credit:d2', created_date: '2026-02-01' },
      ...(extra.credits || []),
    ],
    payments: [{ id: 'pp1', project_id: 'p1', invoice_id: 'd1', amount_cents: 30000, reference: 'CHK-1' }, { id: 'pp2', project_id: 'p1', invoice_id: 'd2', amount_cents: 20000, reference: 'CHK-2' }],
  });
  let k = 0;
  const run = (p) => p.then((r) => [200, r]).catch((e) => [e.http || 500, { code: e.code, error: e.message }]);
  const ap = (db, invoice_id, amount_cents, key = `a${++k}`, sources) => run(apply(db, { invoice_id, amount_cents, key, user_email: 't@x', sources }));
  const rv = (db, application_id, key = `r${++k}`) => run(reverse(db, { application_id, key, reason: 'entered in error', user_email: 't@x' }));
  const rf = (db, credit_ledger_id, amount_cents, key = `f${++k}`) => run(refund(db, { credit_ledger_id, amount_cents, key, method: 'check', reference: 'RF-1', date: '2026-11-20', user_email: 't@x' }));
  const rem = (db, id) => db.T.credits.get(id).remaining_amount;
  const inv = (db, id) => db.T.invoices.get(id);
  const unlocked = (db) => db.T.projects.get('p1').billing_lock_token == null;
  const txs = (db) => [...db.T.txs.values()];
  const results = [];
  const test = async (name, fn) => { try { const d = await fn(); results.push({ name, pass: !!d.pass, detail: d }); } catch (e) { results.push({ name, pass: false, detail: { error: e.message } }); } };

  await test('multiple deposits drawn oldest first; each portion traceable to its receipt', async () => {
    const db = base(); const [s] = await ap(db, 'i1', 40000, 'A');
    const t = txs(db);
    return { pass: s === 200 && rem(db, 'c1') === 0 && rem(db, 'c2') === 100 && inv(db, 'i1').credit_applied === 400 && inv(db, 'i1').balance_due === 600 && inv(db, 'i1').status === 'sent' && t.length === 2 && t.map((x) => x.source_invoice_id).join() === 'd1,d2' && t.reduce((s2, x) => s2 + x.amount_cents, 0) === 40000 && unlocked(db) };
  });
  await test('incremental applications across invoices; totals consistent', async () => {
    const db = base(); await ap(db, 'i1', 10000); await ap(db, 'i1', 20000); const [s] = await ap(db, 'i2', 15000);
    const sm = await summary(db, 'p1');
    return { pass: s === 200 && inv(db, 'i1').credit_applied === 300 && inv(db, 'i2').status === 'paid' && db.T.commitments.get('pc1').billing_status === 'paid' && rem(db, 'c1') + rem(db, 'c2') === 50 && sm.totals.applied === 450 && sm.totals.remaining === 50 && sm.totals.received === 500 && sm.totals.requested === 800, totals: sm.totals };
  });
  await test('cannot exceed invoice outstanding or available balance; nothing changes', async () => {
    const db = base(); const [s1, b1] = await ap(db, 'i2', 15001); const [s2, b2] = await ap(db, 'i1', 50001);
    return { pass: s1 === 409 && b1.code === 'EXCEEDS_INVOICE' && s2 === 409 && b2.code === 'EXCEEDS_AVAILABLE' && rem(db, 'c1') === 300 && rem(db, 'c2') === 200 && txs(db).length === 0 && inv(db, 'i1').credit_applied === 0 && unlocked(db) };
  });
  await test('same request key retried: applied once', async () => {
    const db = base(); await ap(db, 'i1', 10000, 'same'); const [s, b] = await ap(db, 'i1', 10000, 'same');
    return { pass: s === 200 && b.idempotent && inv(db, 'i1').credit_applied === 100 && rem(db, 'c1') === 200 && txs(db).length === 1 };
  });
  await test('6 simultaneous applications of $100 with $500 available: never over-drawn, journal matches', async () => {
    const db = base(); const res = await Promise.all(Array.from({ length: 6 }, () => ap(db, 'i1', 10000)));
    const ok = res.filter(([s]) => s === 200).length;
    return { pass: res.every(([s]) => s === 200 || s === 409) && rem(db, 'c1') >= 0 && rem(db, 'c2') >= 0 && Math.round(inv(db, 'i1').credit_applied * 100) === ok * 10000 && txs(db).reduce((s, x) => s + x.amount_cents, 0) === ok * 10000 && cents(rem(db, 'c1') + rem(db, 'c2')) === 50000 - ok * 10000 && unlocked(db), ok };
  });
  await test('credit proposed on a draft stays reserved', async () => {
    const db = base({ invoices: [{ id: 'dr', project_id: 'p1', invoice_type: 'progress', status: 'draft', credit_proposed: 450 }] });
    const [s, b] = await ap(db, 'i1', 10000); const [s2] = await ap(db, 'i1', 5000);
    return { pass: s === 409 && b.code === 'EXCEEDS_AVAILABLE' && s2 === 200 && rem(db, 'c1') === 250 };
  });
  await test('reverse an application that fully paid an invoice: restored to original receipts, parts back to invoiced', async () => {
    const db = base(); await ap(db, 'i1', 20000, 'X'); await ap(db, 'i2', 15000, 'Y');
    const [s] = await rv(db, 'Y'); const [s2, b2] = await rv(db, 'Y');
    return { pass: s === 200 && inv(db, 'i2').status === 'sent' && inv(db, 'i2').credit_applied === 0 && inv(db, 'i2').balance_due === 150 && inv(db, 'i2').payment_idempotency_key == null && db.T.commitments.get('pc1').billing_status === 'invoiced' && rem(db, 'c1') === 100 && rem(db, 'c2') === 200 && s2 === 200 && b2.already_reversed && txs(db).filter((t) => t.type === 'apply_reversal').length === 2 && txs(db).length === 5 };
  });
  await test('refund unused deposit, then reverse the refund (corrective entries only)', async () => {
    const db = base(); const [s] = await rf(db, 'c1', 10000, 'RF'); const mid = rem(db, 'c1');
    const [s2, b2] = await ap(db, 'i1', 45000); const [s3] = await rv(db, 'RF');
    const sm = await summary(db, 'p1');
    return { pass: s === 200 && mid === 200 && s2 === 409 && b2.code === 'EXCEEDS_AVAILABLE' && s3 === 200 && rem(db, 'c1') === 300 && txs(db).length === 2 && sm.totals.refunded === 0 && sm.totals.remaining === 500, totals: sm.totals };
  });
  await test('refund limited to the receipt balance; overpayment credit refused', async () => {
    const db = base({ credits: [{ id: 'cx', project_id: 'p1', source_invoice_id: 'i1', credit_amount: 50, remaining_amount: 50, payment_idempotency_key: 'pay_credit:i1' }] });
    const [s1, b1] = await rf(db, 'c2', 20001); const [s2, b2] = await rf(db, 'cx', 100);
    return { pass: s1 === 409 && b1.code === 'EXCEEDS_AVAILABLE' && s2 === 400 && b2.code === 'NOT_DEPOSIT' && txs(db).length === 0 };
  });
  await test('application reversal blocked while the invoice has an overpayment credit', async () => {
    const db = base(); await ap(db, 'i1', 10000, 'Z');
    db.T.credits.set('ov', { id: 'ov', project_id: 'p1', source_invoice_id: 'i1', credit_amount: 20, remaining_amount: 20, payment_idempotency_key: 'pay_credit:i1' });
    const [s, b] = await rv(db, 'Z');
    return { pass: s === 409 && b.code === 'OVERPAYMENT_CREDIT' && inv(db, 'i1').credit_applied === 100 };
  });
  await test('deposit invoices, drafts and paid invoices refuse applications', async () => {
    const db = base({ invoices: [{ id: 'dr', project_id: 'p1', invoice_type: 'progress', status: 'draft', subtotal: 100 }, { id: 'pd', project_id: 'p1', invoice_type: 'final', status: 'paid', subtotal: 100, paid_amount: 100 }] });
    const r = await Promise.all([ap(db, 'd2', 100), ap(db, 'dr', 100), ap(db, 'pd', 100)]);
    return { pass: r[0][0] === 400 && r[1][0] === 409 && r[2][0] === 409 && txs(db).length === 0 };
  });
  await test('billing lock held elsewhere: refused, nothing changes', async () => {
    const db = base({ lock: 'other' }); const [s, b] = await ap(db, 'i1', 100);
    return { pass: s === 409 && b.code === 'BILLING_LOCKED' && rem(db, 'c1') === 300 };
  });
  const reg = (db, over = {}) => run(registerExisting(db, { project_id: 'p1', qb_invoice_number: 'QB-77', invoice_amount_cents: 100000, invoice_date: '2026-11-01', notes: '', user_email: 't@x', key: 'R1', ...over, payment: { amount_cents: 40000, date: '2026-11-02', method: 'check', reference: 'CHK-77', ...(over.payment || {}) } }));
  await test('record existing QuickBooks deposit with partial payment: one invoice, credit = amount received only', async () => {
    const db = base(); const [s, b] = await reg(db); const [s2] = await reg(db);
    const deps = [...db.T.invoices.values()].filter((i) => i.qb_invoice_number === 'QB-77');
    const c = [...db.T.credits.values()].filter((x) => x.source_invoice_id === b.invoice_id);
    return { pass: s === 200 && s2 === 200 && deps.length === 1 && deps[0].status === 'partial' && deps[0].recorded_from_quickbooks && c.length === 1 && c[0].credit_amount === 400 && [...db.T.payments.values()].filter((p) => p.reference === 'CHK-77').length === 1 && unlocked(db) };
  });
  await test('duplicate QuickBooks invoice number or payment reference refused', async () => {
    const db = base(); const [s1, b1] = await reg(db, { qb_invoice_number: 'QB-D1', key: 'R2' }); const [s2, b2] = await reg(db, { key: 'R3', qb_invoice_number: 'QB-88', payment: { reference: 'CHK-1' } });
    return { pass: s1 === 409 && b1.code === 'DUPLICATE_INVOICE' && s2 === 409 && b2.code === 'DUPLICATE_PAYMENT' && db.T.invoices.size === 4 };
  });
  await test('two partial payments on one deposit invoice: credit rises by each payment once', async () => {
    const db = base();
    await db.recordPayment({ invoice_id: 'd2', amount: 100, payment_date: '2026-11-03', reference: 'CHK-3', idempotency_key: 'p-a' });
    await db.recordPayment({ invoice_id: 'd2', amount: 100, payment_date: '2026-11-04', reference: 'CHK-4', idempotency_key: 'p-b' });
    await db.recordPayment({ invoice_id: 'd2', amount: 100, payment_date: '2026-11-04', reference: 'CHK-4', idempotency_key: 'p-b' });
    const sm = await summary(db, 'p1'); const d2 = sm.deposits.find((d) => d.invoice_id === 'd2');
    return { pass: d2.received === 400 && d2.credit === 400 && d2.remaining === 400 && d2.payment_count === 3 && d2.status === 'partial' && sm.totals.received === 700 && sm.totals.available_to_apply === 700, d2 };
  });
  await test('QuickBooks status: AK deposit needs entry, recorded-from-QuickBooks deposit and its payment exist there, reconcile is append-only', async () => {
    const db = base(); const [, r] = await reg(db);
    const s1 = await summary(db, 'p1');
    const ak = s1.deposits.find((d) => d.invoice_id === 'd1'); const qbd = s1.deposits.find((d) => d.invoice_id === r.invoice_id);
    const qbPay = s1.history.find((h) => h.kind === 'received' && h.deposit === 'QB-77');
    const [s] = await run(qbReconcile(db, { project_id: 'p1', ref: 'invoice:d1', qb_reference: 'QB-D1', user_email: 't@x' }));
    const [s2, b2] = await run(qbReconcile(db, { project_id: 'p1', ref: 'invoice:d1', qb_reference: 'QB-D1', user_email: 't@x' }));
    const [s3] = await run(qbReconcile(db, { project_id: 'p1', ref: 'app:nope', qb_reference: 'X1', user_email: 't@x' }));
    const s4 = await summary(db, 'p1');
    return { pass: ak.qb_status === 'needs_manual_entry' && ak.export_eligible && qbd.qb_status === 'in_quickbooks' && !qbd.export_eligible && qbPay?.qb_status === 'in_quickbooks'
      && s === 200 && s2 === 200 && b2.idempotent && s3 === 404 && s4.deposits.find((d) => d.invoice_id === 'd1').qb_status === 'reconciled'
      && txs(db).filter((t) => t.type === 'qb_reconcile').length === 1 && s4.totals.remaining === s1.totals.remaining && s4.totals.received === s1.totals.received && unlocked(db) };
  });
  await test('link AK deposit to QuickBooks: excluded from export, idempotent; QuickBooks-origin deposit refused', async () => {
    const db = base(); const [, r] = await reg(db);
    const [s] = await run(qbLink(db, { invoice_id: 'd1', qb_reference: 'QB-D1', user_email: 't@x' }));
    const [s2, b2] = await run(qbLink(db, { invoice_id: 'd1', qb_reference: 'QB-D1', user_email: 't@x' }));
    const [s3] = await run(qbLink(db, { invoice_id: r.invoice_id, qb_reference: 'QB-77', user_email: 't@x' }));
    const d1 = (await summary(db, 'p1')).deposits.find((d) => d.invoice_id === 'd1');
    return { pass: s === 200 && s2 === 200 && b2.idempotent && s3 === 400 && d1.qb_export_status === 'linked' && !d1.export_eligible && d1.qb_status === 'in_quickbooks' };
  });
  await test('credit applied at send: shown once in history, keeps its deposit source, cannot be reversed here', async () => {
    const db = base({ invoices: [{ id: 'i3', project_id: 'p1', invoice_type: 'progress', status: 'sent', subtotal: 400, credit_applied: 250, paid_amount: 0, balance_due: 150, qb_invoice_number: 'QB-3', credit_plan_state: 'applied', credit_application_plan: [{ credit_id: 'c1', amount: 250, before: 300, after: 50 }] }] });
    db.T.credits.get('c1').remaining_amount = 50;
    await db.createTx([{ type: 'apply', project_id: 'p1', application_id: 'send:i3', idempotency_key: 'send:i3:0', credit_ledger_id: 'c1', source_invoice_id: 'd1', target_invoice_id: 'i3', amount_cents: 25000, actor_email: 't@x', recorded_at: '2026-11-05T00:00:00Z' }]);
    const sm = await summary(db, 'p1');
    const sends = sm.history.filter((h) => h.kind === 'applied_at_send');
    const [s, b] = await rv(db, 'send:i3');
    return { pass: sends.length === 1 && sends[0].deposit === 'QB-D1' && sends[0].amount === -250 && !sends[0].reversible && sends[0].qb_status === 'needs_manual_entry' && s === 400 && b.code === 'SEND_APPLICATION'
      && sm.deposits.find((d) => d.invoice_id === 'd1').applied === 250 && sm.totals.project_invoices_outstanding === 1300 };
  });
  await test('duplicate payment reference only blocks within the project; reference equal to the QuickBooks invoice number is not treated as unique', async () => {
    const db = base(); db.T.payments.set('ppx', { id: 'ppx', project_id: 'p1', invoice_id: 'd1', amount_cents: 100, reference: 'QB-99' });
    const [s] = await reg(db, { key: 'R9', qb_invoice_number: 'QB-99', payment: { reference: 'QB-99' } });
    const [s2, b2] = await reg(db, { key: 'R10', qb_invoice_number: 'QB-100', payment: { reference: 'chk-1 ' } });
    return { pass: s === 200 && s2 === 409 && b2.code === 'DUPLICATE_PAYMENT' };
  });
  return { function: 'projectDepositAction', mock_only: true, passed: results.filter((r) => r.pass).length, total: results.length, results };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => ([401, 403].includes(e.status ?? e.response?.status) || /authentication required/i.test(e.message) ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const b = await req.json().catch(() => ({}));
    if (b.self_test) return Response.json(await runSelfTest());
    const db = realDb(base44);
    const amountC = (v) => { const c = Math.round(Number(v) * 100); if (!Number.isFinite(c) || c <= 0) throw fail(400, 'BAD_AMOUNT', 'Amount must be greater than 0.'); return c; };
    const needKey = () => { if (typeof b.idempotency_key !== 'string' || b.idempotency_key.length < 8) throw fail(400, 'NO_KEY', 'idempotency_key required'); return b.idempotency_key; };
    const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const run = async () => {
      switch (b.action) {
        case 'summary':
          if (!b.project_id) throw fail(400, 'NO_PROJECT', 'project_id required');
          return summary(db, b.project_id);
        case 'apply':
          if (!b.invoice_id) throw fail(400, 'NO_INVOICE', 'invoice_id required');
          return apply(db, { invoice_id: b.invoice_id, amount_cents: amountC(b.amount), key: needKey(), note: String(b.note || '').slice(0, 500), sources: b.sources === 'all' ? 'all' : 'deposit', user_email: user.email });
        case 'refund': {
          if (!b.credit_ledger_id) throw fail(400, 'NO_CREDIT', 'credit_ledger_id required');
          if (!isDate(b.date)) throw fail(400, 'NO_DATE', 'Refund date required.');
          if (b.method && !METHODS.includes(b.method)) throw fail(400, 'BAD_METHOD', 'Invalid method.');
          if (String(b.reference || '').trim().length < 2) throw fail(400, 'NO_REFERENCE', 'A refund reference (check # or QuickBooks refund) is required.');
          return refund(db, { credit_ledger_id: b.credit_ledger_id, amount_cents: amountC(b.amount), key: needKey(), method: b.method || 'other', reference: String(b.reference).trim().slice(0, 200), date: b.date, note: String(b.note || '').slice(0, 500), user_email: user.email });
        }
        case 'reverse': {
          const reason = String(b.reason || '').trim().slice(0, 500);
          if (!b.application_id) throw fail(400, 'NO_ENTRY', 'application_id required');
          if (reason.length < 3) throw fail(400, 'NO_REASON', 'A reason is required.');
          return reverse(db, { application_id: b.application_id, key: needKey(), reason, user_email: user.email });
        }
        case 'register_existing': {
          const qb = String(b.qb_invoice_number || '').trim();
          const ref = String(b.payment_reference || '').trim();
          if (!b.project_id) throw fail(400, 'NO_PROJECT', 'project_id required');
          if (qb.length < 1) throw fail(400, 'NO_QB', 'QuickBooks deposit invoice number is required.');
          if (ref.length < 2) throw fail(400, 'NO_REFERENCE', 'QuickBooks payment reference is required.');
          if (!isDate(b.invoice_date) || !isDate(b.payment_date)) throw fail(400, 'NO_DATE', 'Invoice date and payment date are required.');
          if (b.payment_method && !METHODS.includes(b.payment_method)) throw fail(400, 'BAD_METHOD', 'Invalid payment method.');
          const invC = amountC(b.invoice_amount); const payC = amountC(b.payment_amount);
          if (payC > invC) throw fail(400, 'PAYMENT_TOO_LARGE', 'The payment received cannot be more than the deposit invoice amount.');
          return registerExisting(db, {
            project_id: b.project_id, qb_invoice_number: qb, invoice_amount_cents: invC, invoice_date: b.invoice_date, notes: String(b.notes || '').slice(0, 1000),
            key: needKey(), user_email: user.email, payment: { amount_cents: payC, date: b.payment_date, method: b.payment_method || 'other', reference: ref.slice(0, 200), note: String(b.payment_note || '').slice(0, 500) },
          });
        }
        case 'qb_reconcile': {
          const ref = String(b.ref || '');
          const qbRef = String(b.qb_reference || '').trim();
          if (!b.project_id) throw fail(400, 'NO_PROJECT', 'project_id required');
          if (!/^(invoice|payment|payment_reversal|app):.+/.test(ref)) throw fail(400, 'BAD_REF', 'Unknown item');
          if (qbRef.length < 2) throw fail(400, 'NO_REFERENCE', 'Enter the QuickBooks reference for this entry.');
          return qbReconcile(db, { project_id: b.project_id, ref, qb_reference: qbRef.slice(0, 200), note: String(b.note || '').slice(0, 500), user_email: user.email });
        }
        case 'qb_link': {
          const qbRef = String(b.qb_reference || '').trim();
          if (!b.invoice_id) throw fail(400, 'NO_INVOICE', 'invoice_id required');
          if (qbRef.length < 1) throw fail(400, 'NO_REFERENCE', 'Enter the QuickBooks invoice number.');
          return qbLink(db, { invoice_id: b.invoice_id, qb_reference: qbRef.slice(0, 200), user_email: user.email });
        }
        default: throw fail(400, 'BAD_ACTION', 'Unknown action');
      }
    };
    const out = await run().catch((e) => (e.http ? { __err: e } : Promise.reject(e)));
    if (out?.__err) return Response.json({ success: false, code: out.__err.code, error: out.__err.message, existing_invoice_id: out.__err.existing_invoice_id }, { status: out.__err.http });
    return Response.json(out);
  } catch (error) {
    console.error('projectDepositAction error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});