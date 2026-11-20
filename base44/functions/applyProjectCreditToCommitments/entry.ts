import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * applyProjectCreditToCommitments — Settle parts with GENERAL project credit (no invoice), and reverse settlements.
 *
 * ACTIONS (admin only):
 *  (default) settle: { project_id, commitment_ids?, mode: 'auto'|'manual', allocations?, dry_run (default true), request_key? }
 *  reverse:  { action:'reverse', project_id, allocation_id, amount, reason, request_key? }
 *  reconcile:{ action:'reconcile', project_id }   finishes an interrupted settlement or reversal (idempotent)
 *  history:  { action:'history', project_id }     settlements, reversals, reversibility
 *  self_test:{ self_test: true }                  in-memory only
 *
 * CREDIT RULES (unchanged, shared with invoice drafts, sends, deposit applications and cancellations):
 *  - General credit only; deposit credit is never drawn. Spendable = projectDepositAction credit_availability.available_general.
 *  - Shared per-project billing lock; availability recalculated inside it; ledger rows updated with compare-and-set.
 *
 * PART AMOUNT RULES (canonical invoice quantities, same as resolveProjectBillableItems / createProjectInvoiceDraft / markInvoiceSent):
 *  - uninvoiced qty = (required_total − qty_removed) − invoiced_qty. invoiced_qty already includes credit-settled qty.
 *  - qty on active drafts (status=draft part lines) is reserved: eligible qty = uninvoiced − min(uninvoiced, on drafts).
 *  - Settled qty is ADDED to invoiced_qty / invoiced_amount (and tracked in credit_settled_qty / credit_settled_amount),
 *    so every draft, send and billable view stops offering it. Draft cancellation releases its qty automatically.
 *  - Amounts are on the invoice-line grid: qty in 1/10000 units, amount = round(qty × unit retail) in cents.
 *
 * RECOVERY: ledger debit → allocation entries (pending_commitment) → part quantities (idempotent via credit_settlement_ids)
 *  → entries completed. Failure before the entries exist rolls back. Failure after leaves the entries pending: credit is
 *  never spent again, drafts and sends for the project are refused, and reconcile (or any retry) finishes it.
 * REVERSAL: compensating negative entry; original entry untouched; credit returned to the original general row.
 */

const STALE_MS = 120000;
const DEPOSIT_LOGIC_VERSION = 'dep-v2';
const SETTLE_LOGIC_VERSION = 'settle-v2';
const SETTLE = 'parts_settlement';
const REVERSAL = 'settlement_reversal';
const PENDING = 'pending_commitment';
const DONE = 'completed';
const TOL = 1e-6;
const cents = (n) => Math.round((Number(n) || 0) * 100);
const lh = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const floor4 = (n) => Math.floor(n * 10000 + 1e-7) / 10000;
const usd = (c) => `$${(c / 100).toFixed(2)}`;
const fail = (http, code, error, extra = {}) => Object.assign(new Error(error), { http, code, extra });
const fifo = (a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id));
const when = (a) => `${a.recorded_at || ''}|${a.created_date || ''}`;
// Ledger writes keep sub-cent residue as it is (never written off or created): exact decimal move, not a rounded balance.
const drawableC = (n) => Math.max(0, Math.floor((Number(n) || 0) * 100 + 1e-7));
const moveBy = (amount, deltaC) => Math.round(((Number(amount) || 0) + deltaC / 100) * 1e10) / 1e10;
const kindOf = (a) => {
  if (a.allocation_kind === SETTLE || a.allocation_kind === REVERSAL) return a.allocation_kind;
  if (a.allocation_kind === 'part_removal' || String(a.allocation_key || '').startsWith('part_removal:')) return 'part_removal';
  return a.commitment_id && String(a.allocation_key || '').startsWith('alloc_') ? 'legacy_settlement' : 'other';
};
const keyOf = (prefix, k) => `${prefix}_${k ? String(k).replace(/[^\w-]/g, '').slice(0, 80) : crypto.randomUUID()}`;

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
  const [project, commitments, credits, allocations, depositInvoices, av, draftQty] = await Promise.all([
    db.getProject(project_id), db.findCommitments(project_id), db.findCredits(project_id),
    db.findAllocations(project_id), db.findDepositInvoices(project_id), db.availability(project_id), db.findDraftQty(project_id),
  ]);
  if (!project) throw fail(404, 'NOT_FOUND', 'Project not found');
  if (!av?.success || av.logic_version !== DEPOSIT_LOGIC_VERSION) throw new Error('Credit availability unavailable or version mismatch');
  const partIds = [...new Set(commitments.map((c) => c.part_id).filter(Boolean))];
  const parts = new Map((partIds.length ? await db.findParts(partIds) : []).map((p) => [p.id, p]));
  const active = allocations.filter((a) => !a.is_reversed);
  return { commitments, credits, allocations: active, parts, draftQty, av, depIds: new Set(depositInvoices.map((i) => i.id)),
    pendingIds: [...new Set(active.filter((a) => a.settlement_state === PENDING).map((a) => a.settlement_id))] };
}

// Canonical position of one part commitment (quantities first, valued at the commitment's unit retail).
function positionOf(c, st) {
  const unitC = cents(c.unit_retail_snapshot);
  const effReq = Math.max(0, (c.required_total || 0) - (c.qty_removed || 0));
  const invoicedQty = c.invoiced_qty || 0;
  const settledQty = c.credit_settled_qty || 0;
  const mine = st.allocations.filter((a) => a.commitment_id === c.id);
  const creditSettledC = mine.filter((a) => [SETTLE, REVERSAL, 'legacy_settlement'].includes(kindOf(a))).reduce((s, a) => s + cents(a.amount_applied), 0);
  const legacyOpen = c.billing_status !== 'paid' && mine.some((a) => kindOf(a) === 'legacy_settlement');
  const uninvoicedQty = lh(Math.max(0, effReq - invoicedQty));
  const draftQty = lh(Math.min(uninvoicedQty, st.draftQty.get(c.id) || 0));
  const eligibleQty = lh(Math.max(0, uninvoicedQty - draftQty));
  return { unitC, effReq, uninvoicedQty, draftQty, eligibleQty, eligibleC: Math.round(eligibleQty * unitC), legacyOpen,
    grossC: Math.round(effReq * unitC), draftC: Math.round(draftQty * unitC), creditSettledC, settledQty: lh(settledQty),
    invoiceBilledQty: lh(Math.max(0, invoicedQty - settledQty)), invoiceBilledC: Math.max(0, cents(c.invoiced_amount) - cents(c.credit_settled_amount)) };
}

function ineligibleReason(c, part, pos) {
  if (c.cancelled_at || c.commitment_status === 'cancelled') return 'PART_CANCELLED';
  if (!part) return 'PART_NOT_FOUND';
  if (c.billing_status === 'not_billable' || part.requires_client_billing === false || part.part_type === 'WARRANTY_REPLACEMENT') return 'NOT_CLIENT_BILLABLE';
  if (pos.unitC <= 0) return 'MISSING_RETAIL';
  if (pos.legacyOpen) return 'LEGACY_SETTLEMENT_REVIEW';
  if (pos.eligibleC <= 0) return pos.draftQty > TOL ? 'RESERVED_ON_DRAFTS' : 'NOTHING_LEFT_TO_SETTLE';
  return null;
}

// Largest amount ≤ capC on the invoice-line grid.
function gridFor(e, capC) {
  if (capC >= e.eligC) return { qty: e.eligQ, amountC: e.eligC };
  const qty = Math.min(e.eligQ, floor4(capC / e.pos.unitC));
  return { qty, amountC: Math.round(qty * e.pos.unitC) };
}

// Pure planning: never spends more than available general credit, per-row balances, or the part's eligible amount.
function buildPlan(st, { commitment_ids, mode, allocations: manual }) {
  let targets = st.commitments;
  if (commitment_ids?.length) targets = targets.filter((c) => commitment_ids.includes(c.id));
  const exps = targets.map((c) => {
    const pos = positionOf(c, st);
    const reason = ineligibleReason(c, st.parts.get(c.part_id), pos);
    return { c, pos, reason, eligC: reason ? 0 : pos.eligibleC, eligQ: reason ? 0 : pos.eligibleQty };
  });
  const rows = st.credits
    .filter((c) => cents(c.remaining_amount) >= 1 && (c.reversed_from_invoice_id || !st.depIds.has(c.source_invoice_id)))
    .sort(fifo);
  const availC = Math.max(0, cents(st.av.available_general));
  // Draw at most the whole cents a row really holds: a 10.005 row rounds to 10.01 for availability but yields only 10.00.
  const bal = new Map(rows.map((r) => [r.id, drawableC(r.remaining_amount)]));
  const pieces = [];
  const newBy = new Map();
  let budgetC = availC;

  if (mode === 'manual' && Array.isArray(manual)) {
    const byC = new Map();
    const byRow = new Map();
    for (const a of manual) {
      const c = cents(a?.amount);
      if (!a?.credit_ledger_id || c <= 0) continue;
      if (!a.commitment_id) throw fail(400, 'NOT_ELIGIBLE', 'Each allocation must name a part');
      const lb = bal.get(a.credit_ledger_id) ?? 0;
      const usedRow = (byRow.get(a.credit_ledger_id) || 0) + c;
      if (usedRow > lb) throw fail(400, 'EXCEEDS_LEDGER', `Allocation exceeds available general credit in ledger ${a.credit_ledger_id}`, { available: lb / 100, requested: usedRow / 100 });
      byRow.set(a.credit_ledger_id, usedRow);
      byC.set(a.commitment_id, (byC.get(a.commitment_id) || 0) + c);
      pieces.push({ credit_ledger_id: a.credit_ledger_id, commitment_id: a.commitment_id, amount_c: c });
    }
    const total = [...byC.values()].reduce((s, v) => s + v, 0);
    if (total > budgetC) throw fail(400, 'EXCEEDS_AVAILABLE_GENERAL_CREDIT', `Allocation exceeds available general project credit (${usd(budgetC)} after draft reservations).`, { available: budgetC / 100, requested: total / 100 });
    for (const [cid, amt] of byC) {
      const e = exps.find((x) => x.c.id === cid);
      if (!e || e.reason) throw fail(400, 'NOT_ELIGIBLE', `Part ${cid} cannot be settled (${e?.reason || 'not found'})`, { commitment_id: cid, reason: e?.reason || 'NOT_FOUND' });
      if (amt > e.eligC) throw fail(400, 'EXCEEDS_ELIGIBLE', `Only ${usd(e.eligC)} of this part can be settled (invoiced ${usd(e.pos.invoiceBilledC)}, on drafts ${usd(e.pos.draftC)}).`, { commitment_id: cid, eligible: e.eligC / 100, requested: amt / 100 });
      const g = gridFor(e, amt);
      if (g.amountC !== amt) throw fail(400, 'AMOUNT_PRECISION', `Use ${usd(g.amountC)}: the amount must match a part quantity at ${usd(e.pos.unitC)} each.`, { commitment_id: cid, suggested: g.amountC / 100 });
      newBy.set(cid, g);
    }
    budgetC -= total;
  } else if (mode === 'auto') {
    for (const e of exps.filter((x) => x.eligC > 0).sort((a, b) => b.eligC - a.eligC)) {
      const rowsTotal = rows.reduce((s, r) => s + bal.get(r.id), 0);
      const cap = Math.min(e.eligC, budgetC, rowsTotal);
      if (cap <= 0) break;
      const g = gridFor(e, cap);
      if (g.amountC <= 0 || g.qty <= 0) continue;
      let need = g.amountC;
      for (const r of rows) {
        if (need <= 0) break;
        const t = Math.min(need, bal.get(r.id));
        if (t > 0) { pieces.push({ credit_ledger_id: r.id, commitment_id: e.c.id, amount_c: t }); bal.set(r.id, bal.get(r.id) - t); need -= t; }
      }
      budgetC -= g.amountC;
      newBy.set(e.c.id, g);
    }
  }
  if (mode === 'manual') for (const p of pieces) bal.set(p.credit_ledger_id, bal.get(p.credit_ledger_id) - p.amount_c);

  // Quantity per entry: proportional, remainder on the last entry, so entries add up exactly to the part's settled qty.
  for (const [cid, g] of newBy) {
    const mine = pieces.filter((p) => p.commitment_id === cid);
    let left = g.qty;
    mine.forEach((p, i) => { p.qty = i === mine.length - 1 ? lh(left) : floor4(g.qty * p.amount_c / g.amountC); left = lh(left - p.qty); });
  }

  const per = exps.map((e) => {
    const part = st.parts.get(e.c.part_id);
    const n = newBy.get(e.c.id) || { amountC: 0, qty: 0 };
    const remC = Math.max(0, e.eligC - n.amountC);
    return { commitment_id: e.c.id, part_id: e.c.part_id, part_name: part?.part_name || null, part_number: part?.vendor_part_number || null,
      required_total: e.pos.effReq, unit_price: e.pos.unitC / 100, gross: e.pos.grossC / 100,
      invoiced: e.pos.invoiceBilledC / 100, invoiced_qty: e.pos.invoiceBilledQty, on_drafts: e.pos.draftC / 100, draft_qty: e.pos.draftQty,
      credit_settled_existing: e.pos.creditSettledC / 100, credit_settled_qty: e.pos.settledQty, eligible: e.eligC / 100, eligible_qty: e.eligQ,
      credit_applied_new: n.amountC / 100, qty_settled_new: n.qty, net: remC / 100,
      will_be_settled: n.amountC > 0 && remC === 0 && e.pos.draftQty <= TOL, ineligible_reason: e.reason };
  });
  const sum = (k) => exps.reduce((s, e) => s + e.pos[k], 0);
  return { pieces, per, rows, bal, availC, newBy, toApplyC: pieces.reduce((s, p) => s + p.amount_c, 0),
    totals: { grossC: sum('grossC'), invoicedC: sum('invoiceBilledC'), draftC: sum('draftC'), settledC: sum('creditSettledC'), eligibleC: exps.reduce((s, e) => s + e.eligC, 0) } };
}

function summaryOf(st, p) {
  return {
    credit_available: p.availC / 100, // canonical: general credit net of draft reservations
    general_credit_balance: st.av.general_balance,
    credit_reserved_by_drafts: Math.round((st.av.reserved_general + st.av.reserved_legacy) * 100) / 100,
    gross_exposure: p.totals.grossC / 100,
    total_invoiced: p.totals.invoicedC / 100,
    total_on_drafts: p.totals.draftC / 100,
    credit_already_applied: p.totals.settledC / 100,
    total_eligible: p.totals.eligibleC / 100,
    credit_to_apply: p.toApplyC / 100,
    eligible_after: Math.max(0, p.totals.eligibleC - p.toApplyC) / 100,
    allocations_count: p.pieces.length,
    commitments_to_settle: p.per.filter((c) => c.will_be_settled).length,
    commitments_partially_settled: p.per.filter((c) => c.credit_applied_new > 0 && !c.will_be_settled).length,
    incomplete_settlements: st.pendingIds.length,
  };
}

// Idempotently applies a settlement (+) or reversal (−) to the part's billing quantities.
async function reflect(db, commitmentId, sid, amountC, qty) {
  const c = await db.getCommitment(commitmentId);
  if (!c) throw new Error(`Part commitment ${commitmentId} not found`);
  const ids = c.credit_settlement_ids || [];
  if (ids.includes(sid)) return false;
  const effReq = Math.max(0, (c.required_total || 0) - (c.qty_removed || 0));
  const invoicedQty = lh((c.invoiced_qty || 0) + qty);
  const settledQty = lh((c.credit_settled_qty || 0) + qty);
  const settledC = cents(c.credit_settled_amount) + amountC;
  if (invoicedQty < -TOL || settledQty < -TOL || settledC < 0 || (qty > 0 && invoicedQty > effReq + TOL)) {
    throw fail(409, 'COMMITMENT_INCONSISTENT', `Part ${commitmentId} billing quantities no longer match this settlement.`);
  }
  const invoiceQty = lh(invoicedQty - settledQty);
  const full = effReq > 0 && effReq - invoicedQty <= TOL;
  const billing_status = full ? 'paid' : (c.billing_status === 'paid' ? (invoiceQty > TOL ? 'invoiced' : 'unbilled') : (c.billing_status || 'unbilled'));
  await db.updateCommitment(c.id, { invoiced_qty: invoicedQty, invoiced_amount: Math.max(0, cents(c.invoiced_amount) + amountC) / 100,
    credit_settled_qty: settledQty, credit_settled_amount: settledC / 100, credit_settlement_ids: [...ids, sid], billing_status });
  return true;
}

// Finishes every pending settlement/reversal on the project. Call under the billing lock.
async function reconcile(db, project_id) {
  const pending = (await db.findAllocations(project_id)).filter((a) => !a.is_reversed && a.settlement_state === PENDING);
  const groups = new Map();
  for (const a of pending) {
    const k = `${a.settlement_id}|${a.commitment_id}`;
    const g = groups.get(k) || { sid: a.settlement_id, cid: a.commitment_id, c: 0, q: 0 };
    g.c += cents(a.amount_applied); g.q += Number(a.qty_settled) || 0;
    groups.set(k, g);
  }
  let applied = 0;
  for (const g of groups.values()) if (await reflect(db, g.cid, g.sid, g.c, lh(g.q))) applied++;
  const sids = [...new Set(pending.map((a) => a.settlement_id))];
  for (const sid of sids) await db.allocationsCas({ project_id, settlement_id: sid, settlement_state: PENDING }, { settlement_state: DONE });
  return { settlements_completed: sids, parts_updated: applied };
}

async function reconcileOrFail(db, project_id) {
  const pending = (await db.findAllocations(project_id)).some((a) => !a.is_reversed && a.settlement_state === PENDING);
  if (!pending) return null;
  try { return await reconcile(db, project_id); } catch (e) {
    throw fail(409, 'SETTLEMENT_INCOMPLETE', `An earlier parts credit settlement could not be finished: ${e.message}. No credit has been spent twice; review the part before retrying.`);
  }
}

async function settle(db, payload, actor, nowIso) {
  const { project_id, mode = 'auto', dry_run = true } = payload;
  if (!project_id) throw fail(400, 'NO_PROJECT', 'project_id is required');

  if (dry_run) {
    const st = await loadState(db, project_id);
    const p = buildPlan(st, { ...payload, mode });
    return { success: true, dry_run: true, project_id, mode, logic_version: SETTLE_LOGIC_VERSION, summary: summaryOf(st, p),
      incomplete_settlement_ids: st.pendingIds,
      allocation_plan: p.pieces.map(({ amount_c, ...a }) => ({ ...a, amount_applied: amount_c / 100 })), per_commitment: p.per,
      available_credits: p.rows.map((c) => ({ id: c.id, original_amount: c.credit_amount, remaining_before: c.remaining_amount, remaining_after: p.bal.get(c.id) / 100 })) };
  }

  const settlement_id = keyOf('set', payload.request_key);
  const release = await acquireLock(db, project_id);
  try {
    const recovered = await reconcileOrFail(db, project_id);
    const prior = (await db.findAllocations(project_id)).filter((a) => a.settlement_id === settlement_id);
    if (prior.length) {
      const appliedC = prior.reduce((s, a) => s + cents(a.amount_applied), 0);
      return { success: true, duplicate: true, project_id, settlement_id, recovered, logic_version: SETTLE_LOGIC_VERSION,
        summary: { credit_applied_now: 0, credit_applied_by_request: appliedC / 100, allocations_created: 0, commitments_settled: 0 }, created_allocations: [], settled_commitments: [] };
    }
    // Recalculated inside the lock: no send, draft, deposit application or other settlement can interleave.
    const st = await loadState(db, project_id);
    const p = buildPlan(st, { ...payload, mode });
    const moves = [];
    const created = [];
    try {
      const byRow = new Map();
      for (const a of p.pieces) byRow.set(a.credit_ledger_id, (byRow.get(a.credit_ledger_id) || 0) + a.amount_c);
      for (const [id, takeC] of byRow) {
        const row = p.rows.find((r) => r.id === id);
        if (drawableC(row.remaining_amount) < takeC) throw fail(409, 'CREDIT_CHANGED', 'Credit balance changed. Nothing was applied; refresh and try again.');
        const after = moveBy(row.remaining_amount, -takeC);
        const won = await db.creditCas({ id, remaining_amount: row.remaining_amount }, { remaining_amount: after });
        if (won !== 1) throw fail(409, 'CREDIT_CHANGED', 'Credit balance changed while settling. Nothing was applied; refresh and try again.');
        moves.push({ id, before: row.remaining_amount, after });
      }
      for (const [i, a] of p.pieces.entries()) {
        const c = st.commitments.find((x) => x.id === a.commitment_id);
        created.push(await db.createAllocation({ project_id, credit_ledger_id: a.credit_ledger_id, commitment_id: a.commitment_id,
          amount_applied: a.amount_c / 100, qty_settled: a.qty, unit_retail_at_settlement: c.unit_retail_snapshot, allocation_mode: mode,
          allocation_kind: SETTLE, settlement_id, settlement_state: PENDING, allocation_key: `${settlement_id}:${i}`,
          actor_email: actor, recorded_at: nowIso, is_reversed: false }));
      }
    } catch (e) {
      for (const a of created) await db.deleteAllocation(a.id).catch((x) => console.error('[settle] allocation rollback failed', a.id, x.message));
      for (const m of moves.reverse()) await db.creditCas({ id: m.id, remaining_amount: m.after }, { remaining_amount: m.before })
        .catch((x) => console.error('[settle] ledger rollback failed', m.id, x.message));
      throw e;
    }

    // Credit is now spent exactly once. From here nothing is rolled back; an interruption leaves the entries pending.
    const failed = [];
    for (const [cid, g] of p.newBy) {
      await reflect(db, cid, settlement_id, g.amountC, g.qty).catch((e) => failed.push({ commitment_id: cid, error: e.message }));
    }
    if (!failed.length && created.length) {
      await db.allocationsCas({ project_id, settlement_id, settlement_state: PENDING }, { settlement_state: DONE }).catch((e) => failed.push({ step: 'complete', error: e.message }));
    }
    if (failed.length) {
      throw fail(409, 'SETTLEMENT_INCOMPLETE', `${usd(p.toApplyC)} of credit was applied, but the settlement did not finish. No credit will be spent again. Use "Finish settlement" to complete it; invoicing for this project is paused until then.`,
        { settlement_id, credit_applied: p.toApplyC / 100, failed });
    }
    const settled = p.per.filter((x) => x.will_be_settled).map((x) => x.commitment_id);
    const s = summaryOf(st, p);
    return { success: true, dry_run: false, project_id, mode, settlement_id, recovered, logic_version: SETTLE_LOGIC_VERSION,
      summary: { ...s, credit_applied_now: s.credit_to_apply, allocations_created: created.length, commitments_settled: settled.length },
      created_allocations: created.map((a) => a.id), settled_commitments: settled, per_commitment: p.per };
  } finally { await release(); }
}

// Why a settlement entry can or cannot be reversed by amountC. Pure.
function reversalCheck({ orig, allocs, c, row, depIds, amountC }) {
  const no = (code, message) => ({ ok: false, code, message });
  if (!orig) return no('NOT_FOUND', 'Settlement not found on this project.');
  const k = kindOf(orig);
  if (k === 'legacy_settlement') return no('LEGACY_SETTLEMENT', 'This settlement was recorded before reversals were supported and its part was marked invoiced in full, so it cannot be reversed automatically.');
  if (k !== SETTLE) return no('NOT_A_SETTLEMENT', 'Only parts credit settlements can be reversed here.');
  if (orig.settlement_state === PENDING) return no('SETTLEMENT_INCOMPLETE', 'Finish this settlement before reversing it.');
  const revs = allocs.filter((a) => kindOf(a) === REVERSAL && a.reverses_allocation_id === orig.id);
  const netC = cents(orig.amount_applied) + revs.reduce((s, a) => s + cents(a.amount_applied), 0);
  const netQ = lh((Number(orig.qty_settled) || 0) + revs.reduce((s, a) => s + (Number(a.qty_settled) || 0), 0));
  const base = { netC, netQ, reversedC: cents(orig.amount_applied) - netC };
  if (netC <= 0) return { ...base, ...no('ALREADY_REVERSED', 'This settlement has already been fully reversed.') };
  if (!(amountC > 0) || amountC > netC) return { ...base, ...no('EXCEEDS_REMAINING', `Up to ${usd(netC)} of this settlement can be reversed.`) };
  if (!c) return { ...base, ...no('PART_NOT_FOUND', 'The settled part no longer exists.') };
  if (c.cancelled_at || c.commitment_status === 'cancelled' || (c.qty_removed || 0) > 0) {
    return { ...base, ...no('PART_REMOVED', 'The part was removed or cancelled after it was settled; its credit is handled by the part removal workflow.') };
  }
  if (!(c.credit_settlement_ids || []).includes(orig.settlement_id)) return { ...base, ...no('NOT_REFLECTED', "The part's billing record does not include this settlement. Finish or review it first.") };
  const later = allocs.filter((a) => kindOf(a) === SETTLE && a.commitment_id === c.id && a.settlement_id !== orig.settlement_id && when(a) > when(orig));
  const laterNet = later.some((a) => cents(a.amount_applied) + allocs.filter((r) => kindOf(r) === REVERSAL && r.reverses_allocation_id === a.id).reduce((s, r) => s + cents(r.amount_applied), 0) > 0);
  if (laterNet) return { ...base, ...no('LATER_SETTLEMENT', 'A later credit settlement on this part must be reversed first.') };
  const unitC = cents(orig.unit_retail_at_settlement);
  if (cents(c.unit_retail_snapshot) !== unitC) return { ...base, ...no('PRICE_CHANGED', `The part's retail price changed since it was settled (${usd(unitC)} → ${usd(cents(c.unit_retail_snapshot))}). Reversing would reopen it at a different price.`) };
  const qty = amountC === netC ? netQ : Math.min(netQ, floor4(amountC / unitC));
  if (qty <= 0) return { ...base, ...no('AMOUNT_TOO_SMALL', 'The amount is smaller than the smallest part quantity.') };
  if (amountC !== netC && Math.round(qty * unitC) !== amountC) return { ...base, ...no('AMOUNT_PRECISION', `Use ${usd(Math.round(qty * unitC))}: the amount must match a part quantity at ${usd(unitC)} each.`) };
  if ((c.credit_settled_qty || 0) + TOL < qty || cents(c.credit_settled_amount) < amountC || (c.invoiced_qty || 0) + TOL < qty) {
    return { ...base, ...no('COMMITMENT_INCONSISTENT', "The part's billing record no longer matches this settlement (another workflow changed it). Review it before reversing.") };
  }
  if (!row) return { ...base, ...no('LEDGER_NOT_FOUND', 'The original credit record no longer exists.') };
  if (!row.reversed_from_invoice_id && depIds.has(row.source_invoice_id)) return { ...base, ...no('DEPOSIT_SOURCE', 'The original credit record is deposit credit; settlements never use deposit credit.') };
  if (cents(row.remaining_amount) + amountC > cents(row.credit_amount)) return { ...base, ...no('LEDGER_CONFLICT', 'Returning this amount would put more credit back than the original credit record held.') };
  return { ...base, ok: true, qty };
}

async function reverse(db, payload, actor, nowIso) {
  const { project_id, allocation_id } = payload;
  const reason = String(payload.reason || '').trim();
  const amountC = cents(payload.amount);
  if (!project_id || !allocation_id) throw fail(400, 'BAD_REQUEST', 'project_id and allocation_id are required');
  if (reason.length < 3) throw fail(400, 'REASON_REQUIRED', 'A reason is required to reverse a settlement.');
  if (amountC <= 0) throw fail(400, 'AMOUNT_REQUIRED', 'Enter the amount to reverse.');
  const reversal_id = keyOf('rev', payload.request_key);
  const release = await acquireLock(db, project_id);
  try {
    await reconcileOrFail(db, project_id);
    const allocs = (await db.findAllocations(project_id)).filter((a) => !a.is_reversed);
    const dup = allocs.find((a) => a.settlement_id === reversal_id);
    if (dup) return { success: true, duplicate: true, reversal_id, allocation_id: dup.id, amount_reversed: -cents(dup.amount_applied) / 100 };
    const orig = allocs.find((a) => a.id === allocation_id);
    const [c, row, depInv] = await Promise.all([orig?.commitment_id ? db.getCommitment(orig.commitment_id) : null,
      orig ? db.getCredit(orig.credit_ledger_id) : null, db.findDepositInvoices(project_id)]);
    const chk = reversalCheck({ orig, allocs, c, row, depIds: new Set(depInv.map((i) => i.id)), amountC });
    if (!chk.ok) throw fail(409, chk.code, chk.message);

    const before = row.remaining_amount;
    const after = moveBy(before, amountC);
    if ((await db.creditCas({ id: row.id, remaining_amount: before }, { remaining_amount: after })) !== 1) {
      throw fail(409, 'CREDIT_CHANGED', 'Credit balance changed. Nothing was reversed; refresh and try again.');
    }
    let entry;
    try {
      entry = await db.createAllocation({ project_id, credit_ledger_id: row.id, commitment_id: c.id, amount_applied: -amountC / 100, qty_settled: -chk.qty,
        unit_retail_at_settlement: orig.unit_retail_at_settlement, allocation_mode: 'manual', allocation_kind: REVERSAL, settlement_id: reversal_id,
        settlement_state: PENDING, allocation_key: `${reversal_id}:${orig.id}`, reverses_allocation_id: orig.id, reversal_reason: reason,
        reversed_by: actor, reversed_at: nowIso, actor_email: actor, recorded_at: nowIso, is_reversed: false });
    } catch (e) {
      await db.creditCas({ id: row.id, remaining_amount: after }, { remaining_amount: before }).catch((x) => console.error('[reverse] ledger rollback failed', x.message));
      throw e;
    }
    try {
      await reflect(db, c.id, reversal_id, -amountC, -chk.qty);
      await db.allocationsCas({ project_id, settlement_id: reversal_id, settlement_state: PENDING }, { settlement_state: DONE });
    } catch (e) {
      throw fail(409, 'SETTLEMENT_INCOMPLETE', `${usd(amountC)} of credit was returned, but the part was not updated. Use "Finish settlement" to complete it; invoicing for this project is paused until then.`, { reversal_id });
    }
    return { success: true, reversal_id, allocation_id: entry.id, reverses_allocation_id: orig.id, amount_reversed: amountC / 100,
      qty_reopened: chk.qty, credit_ledger_id: row.id, ledger_remaining_after: after };
  } finally { await release(); }
}

async function history(db, project_id) {
  const [allocsAll, commitments, credits, depInv] = await Promise.all([db.findAllocations(project_id), db.findCommitments(project_id), db.findCredits(project_id), db.findDepositInvoices(project_id)]);
  const allocs = allocsAll.filter((a) => !a.is_reversed);
  const cMap = new Map(commitments.map((c) => [c.id, c]));
  const rMap = new Map(credits.map((r) => [r.id, r]));
  const partIds = [...new Set(commitments.map((c) => c.part_id).filter(Boolean))];
  const parts = new Map((partIds.length ? await db.findParts(partIds) : []).map((p) => [p.id, p]));
  const depIds = new Set(depInv.map((i) => i.id));
  const settlements = allocs.filter((a) => [SETTLE, 'legacy_settlement'].includes(kindOf(a))).sort((a, b) => when(b).localeCompare(when(a))).map((a) => {
    const c = cMap.get(a.commitment_id);
    const reversals = allocs.filter((r) => kindOf(r) === REVERSAL && r.reverses_allocation_id === a.id)
      .map((r) => ({ id: r.id, amount: -cents(r.amount_applied) / 100, qty: r.qty_settled != null ? -Number(r.qty_settled) : null, reason: r.reversal_reason, by: r.reversed_by || r.actor_email, at: r.reversed_at || r.recorded_at, state: r.settlement_state }));
    const probe = reversalCheck({ orig: a, allocs, c, row: rMap.get(a.credit_ledger_id), depIds, amountC: Number.MAX_SAFE_INTEGER });
    const netC = probe.netC ?? cents(a.amount_applied);
    const chk = netC > 0 ? reversalCheck({ orig: a, allocs, c, row: rMap.get(a.credit_ledger_id), depIds, amountC: netC }) : probe;
    return { allocation_id: a.id, settlement_id: a.settlement_id || null, legacy: kindOf(a) === 'legacy_settlement', commitment_id: a.commitment_id,
      part_name: parts.get(c?.part_id)?.part_name || null, credit_ledger_id: a.credit_ledger_id, amount: cents(a.amount_applied) / 100,
      qty: a.qty_settled ?? null, net_amount: netC / 100, reversed_amount: (cents(a.amount_applied) - netC) / 100,
      status: a.settlement_state === PENDING ? 'incomplete' : netC <= 0 ? 'reversed' : reversals.length ? 'partially_reversed' : 'active',
      recorded_at: a.recorded_at || a.created_date, actor_email: a.actor_email || null, reversals,
      reversible: !!chk.ok, block_code: chk.ok ? null : chk.code, block_reason: chk.ok ? null : chk.message };
  });
  return { success: true, project_id, logic_version: SETTLE_LOGIC_VERSION, settlements,
    incomplete_settlement_ids: [...new Set(allocs.filter((a) => a.settlement_state === PENDING).map((a) => a.settlement_id))] };
}

function realDb(base44) {
  const sr = base44.asServiceRole.entities;
  const all = (E, q) => E.filter(q, 'created_date', 5000);
  return {
    getProject: async (id) => (await sr.Project.filter({ id }))[0] || null,
    projectCas: async (q, set) => (await sr.Project.updateMany(q, { $set: set })).updated,
    findCommitments: (project_id) => all(sr.PartCommitment, { project_id }),
    getCommitment: async (id) => (await sr.PartCommitment.filter({ id }))[0] || null,
    findParts: (ids) => sr.Part.filter({ id: { $in: ids } }, 'created_date', 5000),
    findCredits: (project_id) => all(sr.ProjectCreditLedger, { project_id }),
    getCredit: async (id) => (await sr.ProjectCreditLedger.filter({ id }))[0] || null,
    findAllocations: (project_id) => all(sr.CreditAllocation, { project_id }),
    findDepositInvoices: (project_id) => all(sr.ProjectInvoice, { project_id, invoice_type: 'deposit' }),
    // Same rule as resolveProjectBillableItems.loadDraftAllocations: part qty on status=draft invoices.
    findDraftQty: async (project_id) => {
      const drafts = await sr.ProjectInvoice.filter({ project_id, status: 'draft' });
      const m = new Map();
      if (!drafts.length) return m;
      const lines = await sr.ProjectInvoiceLine.filter({ invoice_id: { $in: drafts.map((d) => d.id) } }, 'sort_order', 5000);
      for (const l of lines) {
        const sid = l.source_id || l.part_commitment_id;
        if (l.type === 'part' && sid) m.set(sid, (m.get(sid) || 0) + (Number(l.qty) || 0));
      }
      return m;
    },
    availability: async (project_id) => (await base44.functions.invoke('projectDepositAction', { action: 'credit_availability', project_id })).data,
    creditCas: async (q, set) => (await sr.ProjectCreditLedger.updateMany(q, { $set: set })).updated,
    createAllocation: (d) => sr.CreditAllocation.create(d),
    deleteAllocation: (id) => sr.CreditAllocation.delete(id),
    allocationsCas: async (q, set) => (await sr.CreditAllocation.updateMany(q, { $set: set })).updated,
    updateCommitment: (id, d) => sr.PartCommitment.update(id, d),
  };
}

// ───────────── In-memory test harness (never touches real records) ─────────────
// Mock availability mirrors projectDepositAction pools(); simulated drafts/sends mirror createProjectInvoiceDraft and markInvoiceSent.
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
  for (const k of ['projects', 'invoices', 'lines', 'credits', 'allocations', 'commitments', 'parts']) T[k] = new Map((seed[k] || []).map((r) => [r.id, structuredClone(r)]));
  let n = 0;
  const match = (r, q) => Object.entries(q).every(([k, v]) => (r[k] ?? null) === (v ?? null));
  const cas = (tbl, q, set) => { let u = 0; for (const r of tbl.values()) if (match(r, q)) { Object.assign(r, structuredClone(set)); u++; } return u; };
  const rows = (tbl, q) => [...tbl.values()].filter((r) => match(r, q)).map((r) => structuredClone(r));
  return {
    T,
    getProject: async (id) => rows(T.projects, { id })[0] || null,
    projectCas: async (q, s) => cas(T.projects, q, s),
    findCommitments: async (project_id) => rows(T.commitments, { project_id }),
    getCommitment: async (id) => rows(T.commitments, { id })[0] || null,
    findParts: async (ids) => [...T.parts.values()].filter((p) => ids.includes(p.id)).map((p) => ({ ...p })),
    findCredits: async (project_id) => rows(T.credits, { project_id }),
    getCredit: async (id) => rows(T.credits, { id })[0] || null,
    findAllocations: async (project_id) => rows(T.allocations, { project_id }),
    findDepositInvoices: async (project_id) => rows(T.invoices, { project_id, invoice_type: 'deposit' }),
    findDraftQty: async (pid) => {
      const drafts = new Set([...T.invoices.values()].filter((i) => i.project_id === pid && i.status === 'draft').map((i) => i.id));
      const m = new Map();
      for (const l of T.lines.values()) if (drafts.has(l.invoice_id) && l.type === 'part') m.set(l.source_id, (m.get(l.source_id) || 0) + l.qty);
      return m;
    },
    availability: async (pid) => {
      const av = mockAvailability(T, pid);
      if (faults.afterAvailability) { faults.afterAvailability(T); faults.afterAvailability = null; }
      return av;
    },
    creditCas: async (q, s) => cas(T.credits, q, s),
    createAllocation: async (d) => {
      if (faults.allocationFailAt != null && T.allocations.size >= faults.allocationFailAt) throw new Error('simulated allocation failure');
      const r = { id: `a${++n}`, created_date: new Date(Date.now() + n).toISOString(), ...structuredClone(d) }; T.allocations.set(r.id, r); return { ...r };
    },
    deleteAllocation: async (id) => { T.allocations.delete(id); },
    allocationsCas: async (q, s) => {
      if (faults.completeFail) { faults.completeFail--; throw new Error('simulated completion failure'); }
      return cas(T.allocations, q, s);
    },
    updateCommitment: async (id, d) => {
      if (faults.commitmentFail) { faults.commitmentFail--; throw new Error('simulated part update failure'); }
      Object.assign(T.commitments.get(id), structuredClone(d));
    },
  };
}

// createProjectInvoiceDraft rules: lock-free in the mock (tests sequence calls); pending settlements block; qty ≤ uninvoiced − other drafts.
function simulateDraft(T, id, lines) {
  if ([...T.allocations.values()].some((a) => a.settlement_state === PENDING)) return { ok: false, code: 'SETTLEMENT_INCOMPLETE' };
  const drafts = new Set([...T.invoices.values()].filter((i) => i.status === 'draft').map((i) => i.id));
  for (const l of lines) {
    const c = T.commitments.get(l.source_id);
    const onOther = [...T.lines.values()].filter((x) => drafts.has(x.invoice_id) && x.source_id === l.source_id).reduce((s, x) => s + x.qty, 0);
    const avail = Math.max(0, (c.required_total - (c.qty_removed || 0)) - (c.invoiced_qty || 0) - onOther);
    if (l.qty > avail + 1e-9) return { ok: false, code: 'ALLOCATED_OR_INVOICED', avail };
  }
  T.invoices.set(id, { id, project_id: 'p1', invoice_type: 'progress', status: 'draft', credit_selection_mode: 'split', credit_proposed_general: 0, credit_proposed_deposit: 0 });
  lines.forEach((l, i) => T.lines.set(`${id}_${i}`, { id: `${id}_${i}`, invoice_id: id, type: 'part', source_id: l.source_id, qty: l.qty, line_total: Math.round(l.qty * cents(T.commitments.get(l.source_id).unit_retail_snapshot)) / 100 }));
  return { ok: true };
}

// markInvoiceSent rules: pending settlements block; line qty ≤ uninvoiced; credit drawn per kind; invoiced_qty += qty.
function simulateSend(T, invId) {
  if ([...T.allocations.values()].some((a) => a.settlement_state === PENDING)) return false;
  const inv = T.invoices.get(invId);
  const lines = [...T.lines.values()].filter((l) => l.invoice_id === invId);
  for (const l of lines) {
    const c = T.commitments.get(l.source_id);
    if (l.qty > (c.required_total - (c.qty_removed || 0)) - (c.invoiced_qty || 0) + 1e-9) return false;
  }
  const dep = new Set([...T.invoices.values()].filter((i) => i.invoice_type === 'deposit').map((i) => i.id));
  const kind = (c) => (!c.reversed_from_invoice_id && dep.has(c.source_invoice_id) ? 'deposit' : 'general');
  for (const [k, amt] of [['deposit', inv.credit_proposed_deposit || 0], ['general', inv.credit_proposed_general || 0]]) {
    let need = cents(amt);
    for (const c of [...T.credits.values()].filter((x) => kind(x) === k).sort(fifo)) {
      const t = Math.min(need, cents(c.remaining_amount)); c.remaining_amount = (cents(c.remaining_amount) - t) / 100; need -= t;
    }
    if (need > 0) return false;
  }
  for (const l of lines) {
    const c = T.commitments.get(l.source_id);
    c.invoiced_qty = lh((c.invoiced_qty || 0) + l.qty); c.invoiced_amount = (cents(c.invoiced_amount) + cents(l.line_total)) / 100; c.billing_status = 'invoiced';
  }
  inv.status = 'sent';
  return true;
}

async function runSelfTest() {
  const GEN = (amt, id = 'g1', extra = {}) => ({ id, project_id: 'p1', source_invoice_id: 'w1', credit_amount: amt, remaining_amount: amt, created_date: '2026-01-01', ...extra });
  const DEP = (amt) => ({ id: 'd1', project_id: 'p1', source_invoice_id: 'dep1', credit_amount: amt, remaining_amount: amt, created_date: '2025-12-01' });
  const PART = (retail, id = 'c1', extra = {}) => ({ id, project_id: 'p1', part_id: 'x', unit_retail_snapshot: retail, required_total: 1, invoiced_qty: 0, invoiced_amount: 0, billing_status: 'unbilled', ...extra });
  const DRAFT = (id, gen, extra = {}) => ({ id, project_id: 'p1', invoice_type: 'progress', status: 'draft', credit_selection_mode: 'split', credit_proposed_deposit: 0, credit_proposed_general: gen, credit_proposed: gen, ...extra });
  const LINE = (id, inv, cid, qty, unit) => ({ id, invoice_id: inv, type: 'part', source_id: cid, qty, line_total: qty * unit });
  const base = (o = {}) => ({ projects: [{ id: 'p1', billing_lock_token: o.lock ?? null, billing_lock_at: o.lock ? new Date().toISOString() : null }],
    invoices: [{ id: 'w1', project_id: 'p1', invoice_type: 'progress', status: 'paid' }, { id: 'dep1', project_id: 'p1', invoice_type: 'deposit', status: 'paid' }, ...(o.invoices || [])],
    lines: o.lines || [], credits: o.credits || [], allocations: o.allocations || [], commitments: o.commitments || [],
    parts: [{ id: 'x', part_name: 'Test part' }, { id: 'nb', part_name: 'Warranty', part_type: 'WARRANTY_REPLACEMENT' }] });
  const rem = (db, id) => db.T.credits.get(id).remaining_amount;
  const pc = (db, id = 'c1') => db.T.commitments.get(id);
  const unlocked = (db) => db.T.projects.get('p1').billing_lock_token == null;
  const allocSum = (db) => [...db.T.allocations.values()].reduce((s, a) => s + cents(a.amount_applied), 0);
  const nonNeg = (db) => [...db.T.credits.values()].every((c) => c.remaining_amount >= 0);
  const pending = (db) => [...db.T.allocations.values()].filter((a) => a.settlement_state === PENDING).length;
  const ACTOR = 'admin@test';
  const wrap = (pr) => pr.then((r) => ({ status: 200, body: r }), (e) => ({ status: e.http || 500, body: { code: e.code, error: e.message, ...e.extra } }));
  const call = (db, extra = {}) => wrap(settle(db, { project_id: 'p1', mode: 'auto', dry_run: false, ...extra }, ACTOR, new Date().toISOString()));
  const rev = (db, extra) => wrap(reverse(db, { project_id: 'p1', reason: 'Settled the wrong part', ...extra }, ACTOR, new Date().toISOString()));
  const preview = (db, extra = {}) => settle(db, { project_id: 'p1', dry_run: true, ...extra }, ACTOR);
  const eligible = async (db, id = 'c1') => (await preview(db)).per_commitment.find((c) => c.commitment_id === id);
  const firstSettle = (db) => [...db.T.allocations.values()].find((a) => a.allocation_kind === SETTLE);
  const results = [];
  const t = async (name, fn) => { try { results.push({ name, ...(await fn()) }); } catch (e) { results.push({ name, pass: false, error: e.message }); } };

  // ── Draft reservations of part amounts ──
  await t('1 part fully on a draft: nothing eligible, nothing settled', async () => {
    const db = mockDb(base({ credits: [GEN(2000)], commitments: [PART(100, 'c1', { required_total: 10 })], invoices: [DRAFT('dr1', 0)], lines: [LINE('l1', 'dr1', 'c1', 10, 100)] }));
    const r = await call(db);
    const e = await eligible(db);
    return { pass: r.status === 200 && r.body.summary.credit_applied_now === 0 && rem(db, 'g1') === 2000 && db.T.allocations.size === 0
      && e.on_drafts === 1000 && e.eligible === 0 && e.ineligible_reason === 'RESERVED_ON_DRAFTS' && simulateSend(db.T, 'dr1') && pc(db).invoiced_qty === 10 };
  });
  await t('2 $1,000 part with $700 on a draft: max $300 settles; sending the draft bills $700 once; nothing left to bill', async () => {
    const db = mockDb(base({ credits: [GEN(2000)], commitments: [PART(100, 'c1', { required_total: 10 })], invoices: [DRAFT('dr1', 0)], lines: [LINE('l1', 'dr1', 'c1', 7, 100)] }));
    const big = await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 400 }] });
    const r = await call(db);
    const after = { qty: pc(db).invoiced_qty, settled: pc(db).credit_settled_amount };
    const sent = simulateSend(db.T, 'dr1');
    const extraDraft = simulateDraft(db.T, 'dr9', [{ source_id: 'c1', qty: 0.0001 }]);
    return { pass: big.status === 400 && big.body.code === 'EXCEEDS_ELIGIBLE' && r.status === 200 && r.body.summary.credit_applied_now === 300 && rem(db, 'g1') === 1700
      && after.qty === 3 && after.settled === 300 && sent && pc(db).invoiced_qty === 10 && pc(db).invoiced_amount === 1000 && !extraDraft.ok && (await eligible(db)).eligible === 0, after };
  });
  await t('3 multiple drafts with the same part: both reservations excluded', async () => {
    const db = mockDb(base({ credits: [GEN(2000)], commitments: [PART(100, 'c1', { required_total: 10 })], invoices: [DRAFT('dr1', 0), DRAFT('dr2', 0)],
      lines: [LINE('l1', 'dr1', 'c1', 4, 100), LINE('l2', 'dr2', 'c1', 3, 100)] }));
    const r = await call(db);
    return { pass: r.status === 200 && r.body.summary.credit_applied_now === 300 && simulateSend(db.T, 'dr1') && simulateSend(db.T, 'dr2') && pc(db).invoiced_qty === 10 };
  });
  await t('4 draft cancellation releases its reserved part amount', async () => {
    const db = mockDb(base({ credits: [GEN(2000)], commitments: [PART(100, 'c1', { required_total: 10 })], invoices: [DRAFT('dr1', 0)], lines: [LINE('l1', 'dr1', 'c1', 7, 100)] }));
    const before = (await eligible(db)).eligible;
    db.T.invoices.get('dr1').status = 'cancelled';
    const r = await call(db);
    return { pass: before === 300 && r.status === 200 && r.body.summary.credit_applied_now === 1000 && pc(db).invoiced_qty === 10 && pc(db).billing_status === 'paid' };
  });
  await t('5 sent draft: invoiced amount is excluded and the remainder settles', async () => {
    const db = mockDb(base({ credits: [GEN(2000)], commitments: [PART(100, 'c1', { required_total: 10 })], invoices: [DRAFT('dr1', 0)], lines: [LINE('l1', 'dr1', 'c1', 6, 100)] }));
    simulateSend(db.T, 'dr1');
    const e = await eligible(db);
    const r = await call(db);
    return { pass: e.invoiced === 600 && e.on_drafts === 0 && e.eligible === 400 && r.body.summary.credit_applied_now === 400 && pc(db).invoiced_qty === 10 && pc(db).invoiced_amount === 1000 && pc(db).credit_settled_amount === 400 };
  });
  await t('6 partial settlement: remainder stays billable on the invoice grid; a new draft cannot claim settled qty', async () => {
    const db = mockDb(base({ credits: [GEN(250)], commitments: [PART(100, 'c1', { required_total: 10 })] }));
    const r = await call(db);
    const tooBig = simulateDraft(db.T, 'dr1', [{ source_id: 'c1', qty: 8 }]);
    const ok = simulateDraft(db.T, 'dr2', [{ source_id: 'c1', qty: 7.5 }]);
    return { pass: r.status === 200 && r.body.summary.credit_applied_now === 250 && pc(db).invoiced_qty === 2.5 && pc(db).credit_settled_qty === 2.5
      && pc(db).billing_status === 'unbilled' && !tooBig.ok && ok.ok && simulateSend(db.T, 'dr2') && pc(db).invoiced_qty === 10 && rem(db, 'g1') === 0 };
  });

  // ── Credit pools and availability (preserved) ──
  await t('7 credit reserved by drafts limits settlement', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(500)], invoices: [DRAFT('dr1', 100)] }));
    const r = await call(db);
    return { pass: r.status === 200 && r.body.summary.credit_available === 200 && r.body.summary.credit_applied_now === 200 && rem(db, 'g1') === 100 && simulateSend(db.T, 'dr1') && rem(db, 'g1') === 0 && nonNeg(db) && unlocked(db) };
  });
  await t('8 deposit and general separation: deposit never drawn, never restored into', async () => {
    const db = mockDb(base({ credits: [DEP(500), GEN(100)], commitments: [PART(400)] }));
    const r = await call(db);
    const bad = await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'd1', commitment_id: 'c1', amount: 50 }] });
    const a = firstSettle(db);
    const rv = await rev(db, { allocation_id: a.id, amount: 100 });
    return { pass: r.body.summary.credit_applied_now === 100 && rem(db, 'd1') === 500 && bad.status === 400 && bad.body.code === 'EXCEEDS_LEDGER'
      && rv.status === 200 && rem(db, 'g1') === 100 && rem(db, 'd1') === 500 };
  });
  await t('9 manual over availability rejected; nothing changed', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(500)], invoices: [DRAFT('dr1', 100)] }));
    const bad = await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 250 }] });
    return { pass: bad.status === 400 && bad.body.code === 'EXCEEDS_AVAILABLE_GENERAL_CREDIT' && rem(db, 'g1') === 300 && db.T.allocations.size === 0 && unlocked(db) };
  });
  await t('10 non-client-billable and cancelled parts are never settled', async () => {
    const db = mockDb(base({ credits: [GEN(1000)], commitments: [PART(100, 'c1', { part_id: 'nb' }), PART(100, 'c2', { cancelled_at: '2026-01-01' })] }));
    const r = await call(db);
    const p = await preview(db);
    return { pass: r.body.summary.credit_applied_now === 0 && p.per_commitment.map((c) => c.ineligible_reason).sort().join() === 'NOT_CLIENT_BILLABLE,PART_CANCELLED' };
  });

  // ── Concurrency ──
  await t('11 concurrent draft creation holds the lock: settlement refused; afterwards the draft qty is excluded', async () => {
    const db = mockDb(base({ lock: 'create_draft_x', credits: [GEN(1000)], commitments: [PART(100, 'c1', { required_total: 10 })] }));
    const r1 = await call(db);
    simulateDraft(db.T, 'dr1', [{ source_id: 'c1', qty: 6 }]);
    db.T.projects.get('p1').billing_lock_token = null;
    const r2 = await call(db);
    return { pass: r1.status === 409 && r1.body.code === 'BILLING_LOCKED' && db.T.allocations.size === 1 && r2.body.summary.credit_applied_now === 400 && simulateSend(db.T, 'dr1') && pc(db).invoiced_qty === 10 };
  });
  await t('12 settlement first, then a draft for the same qty is refused', async () => {
    const db = mockDb(base({ credits: [GEN(1000)], commitments: [PART(100, 'c1', { required_total: 10 })] }));
    await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 500 }] });
    const d = simulateDraft(db.T, 'dr1', [{ source_id: 'c1', qty: 6 }]);
    return { pass: !d.ok && d.avail === 5 && simulateDraft(db.T, 'dr2', [{ source_id: 'c1', qty: 5 }]).ok };
  });
  await t('13 concurrent invoice send holds the lock: refused; credit changed underneath rolls back fully', async () => {
    const db = mockDb(base({ lock: 'inv_send', credits: [GEN(300)], commitments: [PART(200)] }));
    const r1 = await call(db);
    const db2 = mockDb(base({ credits: [GEN(300)], commitments: [PART(200)] }), { afterAvailability: (T) => { T.credits.get('g1').remaining_amount = 50; } });
    const r2 = await call(db2);
    return { pass: r1.status === 409 && r1.body.code === 'BILLING_LOCKED' && rem(db, 'g1') === 300 && db.T.allocations.size === 0
      && r2.status === 409 && r2.body.code === 'CREDIT_CHANGED' && rem(db2, 'g1') === 50 && db2.T.allocations.size === 0 && pc(db2).invoiced_qty === 0 && unlocked(db2) };
  });
  await t('14 send after settlement: a draft line that overlaps settled qty cannot be sent', async () => {
    // Simulates a legacy draft created before this release: draft qty 10, then 3 settled (as old code allowed).
    const db = mockDb(base({ credits: [GEN(1000)], commitments: [PART(100, 'c1', { required_total: 10, invoiced_qty: 3, credit_settled_qty: 3, credit_settled_amount: 300, invoiced_amount: 300 })],
      invoices: [DRAFT('dr1', 0)], lines: [LINE('l1', 'dr1', 'c1', 10, 100)] }));
    return { pass: simulateSend(db.T, 'dr1') === false && pc(db).invoiced_qty === 3 };
  });

  // ── Interruption and idempotency ──
  await t('15 allocation write failure restores ledger (nothing applied)', async () => {
    const db = mockDb(base({ credits: [GEN(100, 'g1'), GEN(100, 'g2', { created_date: '2026-02-01' })], commitments: [PART(150)] }), { allocationFailAt: 1 });
    const r = await call(db);
    return { pass: r.status === 500 && rem(db, 'g1') === 100 && rem(db, 'g2') === 100 && db.T.allocations.size === 0 && pc(db).invoiced_qty === 0 && unlocked(db) };
  });
  await t('16 interrupted after credit allocated, before part update: reported incomplete, invoicing paused, retry finishes without spending again', async () => {
    const db = mockDb(base({ credits: [GEN(500)], commitments: [PART(100, 'c1', { required_total: 10 })] }), { commitmentFail: 1 });
    const r1 = await call(db, { request_key: 'k1' });
    const mid = { rem: rem(db, 'g1'), pending: pending(db), qty: pc(db).invoiced_qty, draft: simulateDraft(db.T, 'drX', [{ source_id: 'c1', qty: 1 }]).ok };
    const r2 = await call(db, { request_key: 'k1' });
    return { pass: r1.status === 409 && r1.body.code === 'SETTLEMENT_INCOMPLETE' && mid.rem === 0 && mid.pending === 1 && mid.qty === 0 && mid.draft === false
      && r2.status === 200 && r2.body.duplicate && r2.body.recovered?.parts_updated === 1 && rem(db, 'g1') === 0 && pending(db) === 0
      && pc(db).invoiced_qty === 5 && pc(db).credit_settled_amount === 500 && db.T.allocations.size === 1 && allocSum(db) === 50000 && unlocked(db), mid };
  });
  await t('17 interrupted after part update, before completion: reconcile does not double-apply', async () => {
    const db = mockDb(base({ credits: [GEN(500)], commitments: [PART(100, 'c1', { required_total: 10 })] }), { completeFail: 1 });
    const r1 = await call(db);
    const rel = await acquireLock(db, 'p1'); const rec = await reconcile(db, 'p1'); await rel();
    return { pass: r1.status === 409 && rec.parts_updated === 0 && rec.settlements_completed.length === 1 && pc(db).invoiced_qty === 5 && pc(db).credit_settlement_ids.length === 1 && pending(db) === 0 };
  });
  await t('18 duplicate retry with the same request key changes nothing', async () => {
    const db = mockDb(base({ credits: [GEN(1000)], commitments: [PART(100, 'c1', { required_total: 10 })] }));
    const a = await call(db, { request_key: 'same', mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 200 }] });
    const b = await call(db, { request_key: 'same', mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 200 }] });
    return { pass: a.status === 200 && b.status === 200 && b.body.duplicate && rem(db, 'g1') === 800 && db.T.allocations.size === 1 && pc(db).invoiced_qty === 2 };
  });

  // ── Reversal ──
  await t('19 valid partial then full reversal: compensating entries, original untouched, credit back to its row, part reopened', async () => {
    const db = mockDb(base({ credits: [GEN(300, 'g1'), GEN(1000, 'g2', { created_date: '2026-02-01' })], commitments: [PART(100, 'c1', { required_total: 10 })] }));
    await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'g2', commitment_id: 'c1', amount: 400 }] });
    const a = firstSettle(db);
    const snap = JSON.stringify(a);
    const r1 = await rev(db, { allocation_id: a.id, amount: 100, request_key: 'r1' });
    const mid = { qty: pc(db).invoiced_qty, rem: rem(db, 'g2') };
    const dup = await rev(db, { allocation_id: a.id, amount: 100, request_key: 'r1' });
    const r2 = await rev(db, { allocation_id: a.id, amount: 300 });
    const r3 = await rev(db, { allocation_id: a.id, amount: 1 });
    const h = await history(db, 'p1');
    return { pass: r1.status === 200 && mid.qty === 3 && mid.rem === 700 && dup.body.duplicate && r2.status === 200 && rem(db, 'g2') === 1000 && rem(db, 'g1') === 300
      && JSON.stringify(db.T.allocations.get(a.id)) === snap && allocSum(db) === 0 && pc(db).invoiced_qty === 0 && pc(db).credit_settled_amount === 0
      && pc(db).billing_status === 'unbilled' && r3.status === 409 && r3.body.code === 'ALREADY_REVERSED'
      && h.settlements[0].status === 'reversed' && h.settlements[0].reversals.length === 2 && (await eligible(db)).eligible === 1000 };
  });
  await t('20 full-settled part reversal restores status and reopens billing', async () => {
    const db = mockDb(base({ credits: [GEN(500)], commitments: [PART(500)] }));
    await call(db);
    const before = pc(db).billing_status;
    const r = await rev(db, { allocation_id: firstSettle(db).id, amount: 500 });
    return { pass: before === 'paid' && r.status === 200 && pc(db).billing_status === 'unbilled' && pc(db).invoiced_qty === 0 && rem(db, 'g1') === 500 };
  });
  await t('21 blocked reversals: later settlement, removed part, price change, legacy, over-amount, missing reason', async () => {
    const db = mockDb(base({ credits: [GEN(1000)], commitments: [PART(100, 'c1', { required_total: 10 })] }));
    await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 200 }] });
    const first = firstSettle(db);
    await call(db, { mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 100 }] });
    const later = await rev(db, { allocation_id: first.id, amount: 200 });
    const over = await rev(db, { allocation_id: first.id, amount: 250 });
    const noReason = await rev(db, { allocation_id: first.id, amount: 10, reason: '' });
    const db2 = mockDb(base({ credits: [GEN(500)], commitments: [PART(100, 'c1', { required_total: 5 })] }));
    await call(db2);
    pc(db2).qty_removed = 1;
    const removed = await rev(db2, { allocation_id: firstSettle(db2).id, amount: 100 });
    pc(db2).qty_removed = 0; pc(db2).unit_retail_snapshot = 120;
    const price = await rev(db2, { allocation_id: firstSettle(db2).id, amount: 100 });
    const db3 = mockDb(base({ credits: [GEN(300, 'g1', { credit_amount: 400 })], commitments: [PART(100, 'c1', { billing_status: 'paid', invoiced_qty: 1, invoiced_amount: 100 })],
      allocations: [{ id: 'old1', project_id: 'p1', credit_ledger_id: 'g1', commitment_id: 'c1', amount_applied: 100, is_reversed: false, allocation_key: 'alloc_hist' }] }));
    const legacy = await rev(db3, { allocation_id: 'old1', amount: 100 });
    const h3 = await history(db3, 'p1');
    const unchanged = rem(db, 'g1') === 700 && rem(db2, 'g1') === 0 && rem(db3, 'g1') === 300;
    return { pass: later.body.code === 'LATER_SETTLEMENT' && over.body.code === 'EXCEEDS_REMAINING' && noReason.body.code === 'REASON_REQUIRED'
      && removed.body.code === 'PART_REMOVED' && price.body.code === 'PRICE_CHANGED' && legacy.body.code === 'LEGACY_SETTLEMENT'
      && h3.settlements[0].reversible === false && unchanged && unlocked(db) && unlocked(db2) && unlocked(db3) };
  });
  await t('22 reversal never returns more than the credit row originally held', async () => {
    const db = mockDb(base({ credits: [GEN(500)], commitments: [PART(100, 'c1', { required_total: 5 })] }));
    await call(db);
    db.T.credits.get('g1').remaining_amount = 450; // e.g. a later financial event restored credit to the row
    const r = await rev(db, { allocation_id: firstSettle(db).id, amount: 100 });
    return { pass: r.status === 409 && r.body.code === 'LEDGER_CONFLICT' && rem(db, 'g1') === 450 && pc(db).invoiced_qty === 5 };
  });

  // ── Rounding ──
  await t('23 fractional-cent residue: rows under half a cent are ignored; nothing created or written off', async () => {
    const db = mockDb(base({ credits: [GEN(0.0000000000018, 'g1'), GEN(0.004, 'g2', { created_date: '2026-01-02' }), GEN(10.005, 'g3', { created_date: '2026-01-03' })], commitments: [PART(50)] }));
    const r = await call(db);
    const g3 = rem(db, 'g3');
    return { pass: r.body.summary.credit_available === 10.01 && r.body.summary.credit_applied_now === 10 && rem(db, 'g1') === 0.0000000000018 && rem(db, 'g2') === 0.004
      && g3 > 0.0049 && g3 < 0.0051 && nonNeg(db), g3 };
  });
  await t('24 partial amounts stay on the invoice-line grid (qty × unit retail in cents)', async () => {
    const db = mockDb(base({ credits: [GEN(1)], commitments: [PART(3)] }));
    const r = await call(db);
    const left = Math.round((1 - pc(db).invoiced_qty) * 300);
    const bad = await call(mockDb(base({ credits: [GEN(500)], commitments: [PART(1234.56)] })), { mode: 'manual', allocations: [{ credit_ledger_id: 'g1', commitment_id: 'c1', amount: 100.01 }] });
    return { pass: r.body.summary.credit_applied_now === 1 && pc(db).invoiced_qty === 0.3333 && left === 200 && bad.status === 400 && bad.body.code === 'AMOUNT_PRECISION' };
  });
  await t('dry run never writes or locks', async () => {
    const db = mockDb(base({ credits: [GEN(300)], commitments: [PART(200)] }));
    const r = await preview(db);
    return { pass: r.summary.credit_to_apply === 200 && rem(db, 'g1') === 300 && db.T.allocations.size === 0 && pc(db).invoiced_qty === 0 && unlocked(db) };
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
    const db = realDb(base44);
    const nowIso = new Date().toISOString();
    try {
      if (payload.action === 'history') return Response.json(await history(db, payload.project_id));
      if (payload.action === 'reverse') return Response.json(await reverse(db, payload, user.email, nowIso));
      if (payload.action === 'reconcile') {
        if (!payload.project_id) throw fail(400, 'NO_PROJECT', 'project_id is required');
        const release = await acquireLock(db, payload.project_id);
        try { return Response.json({ success: true, ...(await reconcileOrFail(db, payload.project_id) || { settlements_completed: [], parts_updated: 0 }) }); }
        finally { await release(); }
      }
      return Response.json(await settle(db, payload, user.email, nowIso));
    } catch (e) {
      if (e.http) return Response.json({ success: false, code: e.code, error: e.message, ...e.extra }, { status: e.http });
      throw e;
    }
  } catch (error) {
    console.error('applyProjectCreditToCommitments error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});