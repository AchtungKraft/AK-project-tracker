import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Admin-only. The ONLY write path for RetainerAccount / RetainerRate / RetainerLedgerEntry
// (entity RLS blocks all browser writes). Money is integer cents throughout.
const MAX_CENTS = 100_000_000_00; // $100M sanity cap
const err = (status, error, extra = {}) => Response.json({ error, ...extra }, { status });
const txId = () => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const r = crypto.getRandomValues(new Uint8Array(4));
  return `RTL-${d}-${[...r].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};
const isCents = (v) => Number.isSafeInteger(v) && Math.abs(v) <= MAX_CENTS;

async function sumBalance(db, retainerId) {
  let total = 0, cursor;
  do {
    const page = await db.RetainerLedgerEntry.filter({ retainer_account_id: retainerId }, { limit: 500, cursor, fields: ['amount_cents'] });
    for (const e of page.items) total += e.amount_cents;
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return total;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return err(401, 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'Only admins can manage retainers.');
    const db = base44.asServiceRole.entities;
    const body = await req.json();
    const { action } = body;
    const now = new Date().toISOString();

    const getRetainer = async (id) => {
      if (typeof id !== 'string' || !id) return null;
      return (await db.RetainerAccount.filter({ id }, { limit: 1 })).items[0] || null;
    };

    if (action === 'create_account') {
      const { client_account_id, designated_project_id = null, notes = '' } = body;
      if (typeof client_account_id !== 'string' || !client_account_id) return err(400, 'client_account_id required.');
      const ca = (await db.ClientAccount.filter({ id: client_account_id }, { limit: 1 })).items[0];
      if (!ca) return err(404, 'Client account not found.');
      if ((await db.RetainerAccount.filter({ client_account_id }, { limit: 1 })).items.length) return err(409, 'This client already has a retainer account.', { code: 'EXISTS' });
      if (designated_project_id) {
        const p = (await db.Project.filter({ id: designated_project_id }, { limit: 1, fields: ['client_account_id'] })).items[0];
        if (!p) return err(400, 'Designated project not found.');
        if (p.client_account_id !== client_account_id) return err(400, 'Designated project must be linked to this client account.');
      }
      const created = await db.RetainerAccount.create({ client_account_id, designated_project_id: designated_project_id || null, status: 'active', currency: 'USD', notes, created_by_email: user.email, updated_by_email: user.email });
      // Concurrency check: keep the earliest if two creates raced
      const all = (await db.RetainerAccount.filter({ client_account_id }, { sort: 'created_date', limit: 10 })).items;
      if (all.length > 1 && all[0].id !== created.id) {
        await db.RetainerAccount.delete(created.id);
        return err(409, 'This client already has a retainer account.', { code: 'EXISTS' });
      }
      return Response.json({ retainer: created });
    }

    if (action === 'update_account') {
      const r = await getRetainer(body.retainer_account_id);
      if (!r) return err(404, 'Retainer not found.');
      const patch = { updated_by_email: user.email };
      if ('designated_project_id' in body) {
        const pid = body.designated_project_id || null;
        if (pid) {
          const p = (await db.Project.filter({ id: pid }, { limit: 1, fields: ['client_account_id'] })).items[0];
          if (!p || p.client_account_id !== r.client_account_id) return err(400, 'Designated project must be an existing project linked to this client account.');
        }
        patch.designated_project_id = pid;
      }
      if ('status' in body) {
        if (!['active', 'inactive'].includes(body.status)) return err(400, 'Invalid status.');
        patch.status = body.status;
      }
      if ('notes' in body) patch.notes = String(body.notes || '');
      return Response.json({ retainer: await db.RetainerAccount.update(r.id, patch) });
    }

    if (action === 'set_rate') {
      const { labor_group_id, negotiated_rate_cents, note = '' } = body;
      const r = await getRetainer(body.retainer_account_id);
      if (!r) return err(404, 'Retainer not found.');
      if (!isCents(negotiated_rate_cents) || negotiated_rate_cents < 0) return err(400, 'Negotiated rate must be a non-negative whole number of cents.');
      const lg = (await db.ScopeLaborGroup.filter({ id: labor_group_id }, { limit: 1 })).items[0];
      if (!lg) return err(404, 'Labor group not found.');
      // Standard rate stored in dollars on ScopeLaborGroup; convert via string to avoid float drift
      const std = Math.round(Number((Number(lg.hourly_rate) || 0).toFixed(2)) * 100);
      const discount = std > 0 ? Math.round(((std - negotiated_rate_cents) * 10000) / std) : 0;
      const prior = (await db.RetainerRate.filter({ retainer_account_id: r.id, labor_group_id, is_active: true }, { limit: 50 })).items;
      // Create the new rate first so a mid-way failure never leaves zero active rates
      const created = await db.RetainerRate.create({
        retainer_account_id: r.id, labor_group_id, labor_group_name_snapshot: lg.name,
        standard_rate_cents_snapshot: std, negotiated_rate_cents, discount_bps_snapshot: discount,
        is_active: true, set_by_email: user.email, set_at: now, note,
      });
      const res = await Promise.allSettled(prior.map((p) => db.RetainerRate.update(p.id, { is_active: false, superseded_at: now })));
      const failed = res.filter((x) => x.status === 'rejected').length;
      return Response.json({ rate: created, superseded: prior.length - failed, supersede_failed: failed });
    }

    if (action === 'record_entry') {
      const { entry_type, amount_cents, reason, external_reference = '', idempotency_key } = body;
      const r = await getRetainer(body.retainer_account_id);
      if (!r) return err(404, 'Retainer not found.');
      if (!['deposit', 'adjustment'].includes(entry_type)) return err(400, 'Only deposits and adjustments are allowed.');
      if (typeof idempotency_key !== 'string' || idempotency_key.length < 16 || idempotency_key.length > 100) return err(400, 'Valid idempotency_key required.');
      if (!isCents(amount_cents) || amount_cents === 0) return err(400, 'Amount must be a non-zero whole number of cents.');
      if (entry_type === 'deposit' && amount_cents < 0) return err(400, 'Deposits must be positive.');
      if (typeof reason !== 'string' || reason.trim().length < 3) return err(400, 'A reason (3+ characters) is required.');

      const existing = (await db.RetainerLedgerEntry.filter({ idempotency_key }, { limit: 1 })).items[0];
      if (existing) {
        if (existing.retainer_account_id !== r.id || existing.amount_cents !== amount_cents || existing.entry_type !== entry_type) {
          return err(409, 'Idempotency key was already used for a different transaction.', { code: 'KEY_REUSED' });
        }
        return Response.json({ entry: existing, duplicate: true, balance_cents: await sumBalance(db, r.id) });
      }
      if (r.status !== 'active') return err(400, 'Retainer is inactive.');
      if (amount_cents < 0) {
        const bal = await sumBalance(db, r.id);
        if (bal + amount_cents < 0) return err(400, `Adjustment would make the balance negative (current ${(bal / 100).toFixed(2)}).`);
      }
      const created = await db.RetainerLedgerEntry.create({
        transaction_id: txId(), retainer_account_id: r.id, client_account_id: r.client_account_id,
        entry_type, amount_cents, reason: reason.trim(), external_reference: String(external_reference).trim(),
        actor_id: user.id, actor_email: user.email, recorded_at: now, idempotency_key,
      });
      // Race guard: if two requests with the same key both passed the check, keep only the earliest
      const same = (await db.RetainerLedgerEntry.filter({ idempotency_key }, { sort: 'created_date', limit: 10 })).items;
      if (same.length > 1 && same[0].id !== created.id) {
        await db.RetainerLedgerEntry.delete(created.id);
        return Response.json({ entry: same[0], duplicate: true, balance_cents: await sumBalance(db, r.id) });
      }
      console.log(`retainer ${entry_type} ${created.transaction_id} ${amount_cents}c by ${user.email}`);
      return Response.json({ entry: created, duplicate: false, balance_cents: await sumBalance(db, r.id) });
    }

    if (action === 'get_balance') {
      const r = await getRetainer(body.retainer_account_id);
      if (!r) return err(404, 'Retainer not found.');
      return Response.json({ balance_cents: await sumBalance(db, r.id) });
    }

    return err(400, 'Unknown action.');
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});