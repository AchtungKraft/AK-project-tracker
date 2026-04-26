import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * executeServiceAction - Service Commitment Mutation Engine
 * 
 * STABILIZED: Phases 1-9
 * - Line items are the ONLY source of truth for cost
 * - Planned vs actual cost tracking (planned_cost frozen at creation)
 * - Hard lock after billing on ALL line item mutations
 * - Unified billing signal: is_billed + invoice_id
 * - Internal vs external cost split in recompute
 * - Duplicate warning on create
 * - Legacy migration action
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action_type, ...payload } = await req.json();
    if (!action_type) return Response.json({ error: 'action_type required' }, { status: 400 });

    let result;
    switch (action_type) {
      case 'CREATE':
        result = await createServiceCommitment(base44, user, payload);
        break;
      case 'UPDATE_STATUS':
        result = await updateStatus(base44, user, payload);
        break;
      case 'UPDATE_SERVICE':
        result = await updateService(base44, user, payload);
        break;
      case 'REASSIGN_PROJECT':
        result = await reassignProject(base44, user, payload);
        break;
      case 'DELETE':
        result = await deleteServiceCommitment(base44, user, payload);
        break;
      case 'ADD_LINE_ITEM':
        result = await addLineItem(base44, user, payload);
        break;
      case 'UPDATE_LINE_ITEM':
        result = await updateLineItem(base44, user, payload);
        break;
      case 'DELETE_LINE_ITEM':
        result = await deleteLineItem(base44, user, payload);
        break;
      case 'RECOMPUTE_TOTALS':
        result = await recomputeTotals(base44, payload.commitment_id);
        break;
      case 'CREATE_SERVICE_VENDOR':
        result = await createServiceVendor(base44, user, payload);
        break;
      case 'MIGRATE_LEGACY':
        result = await migrateLegacyCommitments(base44, user);
        break;
      default:
        return Response.json({ error: `Unknown action_type: ${action_type}` }, { status: 400 });
    }

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('executeServiceAction error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});

const VALID_TRANSITIONS = {
  planned: ['ordered'],
  ordered: ['completed', 'planned'],
  completed: ['billed', 'ordered'],
  billed: [],
};

// ══════════════════════════════════════════════════════════════
// PHASE 3: BILLING LOCK GUARD
// Checks both is_billed and status === 'billed'
// ══════════════════════════════════════════════════════════════
function isBillingLocked(commitment) {
  return commitment.status === 'billed' || commitment.is_billed === true;
}

function assertNotBillingLocked(commitment) {
  if (isBillingLocked(commitment)) {
    throw new Error('Service is locked after billing. Line items cannot be added, edited, or deleted.');
  }
}

// ── RECOMPUTE TOTALS (PHASE 7: internal/external split) ──
async function recomputeTotals(base44, commitmentId) {
  if (!commitmentId) throw new Error('commitment_id required');

  // PHASE 3: Check billing lock before recompute
  const [commitment] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: commitmentId });
  if (commitment && isBillingLocked(commitment)) {
    // Allow read-only recompute for diagnostics but don't write
    const lineItems = await base44.asServiceRole.entities.ServiceLineItem.filter({ service_commitment_id: commitmentId });
    let totalCost = 0, totalBillable = 0, externalCost = 0, internalCost = 0;
    for (const li of lineItems) {
      const qty = li.quantity || 1;
      const lineCost = (li.cost || 0) * qty;
      totalCost += lineCost;
      totalBillable += (li.billing_rate || 0) * qty;
      if (li.type === 'internal_labor') internalCost += lineCost;
      else externalCost += lineCost;
    }
    return { commitment_id: commitmentId, total_cost: totalCost, total_billable: totalBillable, external_cost: externalCost, internal_cost: internalCost, line_count: lineItems.length, action: 'TOTALS_READ_ONLY_LOCKED' };
  }

  const lineItems = await base44.asServiceRole.entities.ServiceLineItem.filter({ service_commitment_id: commitmentId });
  
  let totalCost = 0, totalBillable = 0, externalCost = 0, internalCost = 0;
  for (const li of lineItems) {
    const qty = li.quantity || 1;
    const lineCost = (li.cost || 0) * qty;
    totalCost += lineCost;
    totalBillable += (li.billing_rate || 0) * qty;
    // PHASE 7: Split by type
    if (li.type === 'internal_labor') internalCost += lineCost;
    else externalCost += lineCost;
  }

  const r2 = n => Math.round(n * 100) / 100;
  await base44.asServiceRole.entities.ServiceCommitment.update(commitmentId, {
    total_cost: r2(totalCost),
    total_billable: r2(totalBillable),
  });

  return { commitment_id: commitmentId, total_cost: r2(totalCost), total_billable: r2(totalBillable), external_cost: r2(externalCost), internal_cost: r2(internalCost), line_count: lineItems.length, action: 'TOTALS_RECOMPUTED' };
}

// ── CREATE (PHASE 2: planned snapshot + PHASE 9: duplicate warning) ──
async function createServiceCommitment(base44, user, payload) {
  const { project_id, service_id, description, vendor_id, quantity, notes, line_items } = payload;
  if (!project_id || !service_id || !description) throw new Error('project_id, service_id, and description required');

  // ── Service must have a vendor group ──
  const [service] = await base44.asServiceRole.entities.Service.filter({ id: service_id });
  if (!service) throw new Error('Service not found');
  if (!service.preferred_vendor_group_id) throw new Error('Service must have a vendor group assigned in Admin');

  // ── Vendor ↔ Group validation ──
  if (vendor_id) {
    const [vendor] = await base44.asServiceRole.entities.ServiceVendor.filter({ id: vendor_id });
    if (!vendor) throw new Error('Vendor not found');
    if (!vendor.vendor_group_id) throw new Error(`Vendor "${vendor.name}" has no vendor group assigned`);
    if (vendor.vendor_group_id !== service.preferred_vendor_group_id) {
      throw new Error(`Vendor "${vendor.name}" does not belong to the service's vendor group.`);
    }
  }

  if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
    throw new Error('At least one line item is required');
  }

  for (let i = 0; i < line_items.length; i++) {
    const li = line_items[i];
    if (!li.type || !li.description) throw new Error(`Line item ${i + 1}: type and description required`);
    if (!(li.cost > 0) && !(li.billing_rate > 0)) {
      throw new Error(`Line item ${i + 1}: cost or billing_rate must be > 0`);
    }
  }

  // PHASE 9: Duplicate detection (warn, don't block)
  let duplicate_warning = null;
  const recent = await base44.asServiceRole.entities.ServiceCommitment.filter({ project_id, service_id });
  const similar = recent.find(c => c.description?.toLowerCase().trim() === description.toLowerCase().trim());
  if (similar) {
    duplicate_warning = `A service "${description}" already exists on this project (created ${similar.created_date?.slice(0, 10) || 'unknown'}). Proceeding anyway.`;
    console.warn(`[CREATE DUPLICATE WARNING] ${duplicate_warning} by=${user.email}`);
  }

  // PHASE 2: Compute planned cost/billable from initial line items
  let plannedCost = 0, plannedBillable = 0;
  for (const li of line_items) {
    const cost = li.cost || 0;
    const billing_rate = li.billing_rate ?? cost;
    const qty = li.quantity || 1;
    plannedCost += cost * qty;
    plannedBillable += billing_rate * qty;
  }
  const r2 = n => Math.round(n * 100) / 100;

  let commitment;
  try {
    commitment = await base44.asServiceRole.entities.ServiceCommitment.create({
      project_id,
      service_id,
      description,
      vendor_id: vendor_id || null,
      quantity: quantity || 1,
      status: 'planned',
      notes: notes || null,
      total_cost: 0,
      total_billable: 0,
      // PHASE 2: Freeze planned snapshot
      planned_cost: r2(plannedCost),
      planned_billable: r2(plannedBillable),
    });

    const createdLines = [];
    for (let i = 0; i < line_items.length; i++) {
      const li = line_items[i];
      const cost = li.cost || 0;
      const billing_rate = li.billing_rate ?? cost;
      const created = await base44.asServiceRole.entities.ServiceLineItem.create({
        service_commitment_id: commitment.id,
        type: li.type,
        description: li.description,
        vendor_id: li.vendor_id || null,
        cost,
        billing_rate,
        quantity: li.quantity || 1,
        sort_order: i + 1,
        notes: li.notes || null,
      });
      createdLines.push(created);
    }

    const totals = await recomputeTotals(base44, commitment.id);
    console.log(`[CREATE] commitment=${commitment.id} lines=${createdLines.length} cost=${totals.total_cost} planned_cost=${r2(plannedCost)} by=${user.email}`);

    return {
      commitment,
      line_items: createdLines,
      totals,
      duplicate_warning,
      action: 'CREATED',
    };
  } catch (err) {
    if (commitment?.id) {
      try {
        await base44.asServiceRole.entities.ServiceCommitment.delete(commitment.id);
        console.log(`[CREATE ROLLBACK] Deleted orphan commitment=${commitment.id}`);
      } catch (rollbackErr) {
        console.error(`[CREATE ROLLBACK FAILED] commitment=${commitment.id}:`, rollbackErr.message);
      }
    }
    throw err;
  }
}

// ── UPDATE STATUS (PHASE 4: unified billing signal) ──
async function updateStatus(base44, user, payload) {
  const { commitment_id, new_status } = payload;
  if (!commitment_id || !new_status) throw new Error('commitment_id and new_status required');

  const [c] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: commitment_id });
  if (!c) throw new Error('ServiceCommitment not found');

  const allowed = VALID_TRANSITIONS[c.status] || [];
  if (!allowed.includes(new_status)) {
    throw new Error(`Cannot transition from ${c.status} to ${new_status}. Allowed: ${allowed.join(', ')}`);
  }

  const updates = { status: new_status };
  const now = new Date().toISOString().slice(0, 10);
  if (new_status === 'ordered') updates.ordered_date = now;
  if (new_status === 'completed') updates.completed_date = now;
  // PHASE 4: When status transitions to billed, also set is_billed = true
  if (new_status === 'billed') {
    updates.billed_date = now;
    updates.is_billed = true;
  }

  await base44.asServiceRole.entities.ServiceCommitment.update(commitment_id, updates);
  return { commitment_id, old_status: c.status, new_status, action: 'STATUS_UPDATED' };
}

// ── UPDATE SERVICE (core fields) ──
async function updateService(base44, user, payload) {
  const { commitment_id, service_id, vendor_id, description, notes, quantity } = payload;
  if (!commitment_id) throw new Error('commitment_id required');

  const [c] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: commitment_id });
  if (!c) throw new Error('ServiceCommitment not found');
  assertNotBillingLocked(c);

  const effectiveServiceId = service_id || c.service_id;
  const effectiveVendorId = vendor_id !== undefined ? vendor_id : c.vendor_id;
  const [svcRecord] = await base44.asServiceRole.entities.Service.filter({ id: effectiveServiceId });
  if (!svcRecord) throw new Error('Service not found');
  if (!svcRecord.preferred_vendor_group_id) throw new Error('Service must have a vendor group assigned in Admin');
  if (effectiveVendorId) {
    const [vendor] = await base44.asServiceRole.entities.ServiceVendor.filter({ id: effectiveVendorId });
    if (!vendor) throw new Error('Vendor not found');
    if (!vendor.vendor_group_id) throw new Error(`Vendor "${vendor.name}" has no vendor group assigned`);
    if (vendor.vendor_group_id !== svcRecord.preferred_vendor_group_id) {
      throw new Error(`Vendor "${vendor.name}" does not belong to the service's vendor group.`);
    }
  }

  const updates = {};
  if (service_id !== undefined) updates.service_id = service_id;
  if (vendor_id !== undefined) updates.vendor_id = vendor_id || null;
  if (description !== undefined) {
    if (!description.trim()) throw new Error('description cannot be empty');
    updates.description = description.trim();
  }
  if (notes !== undefined) updates.notes = notes || null;
  if (quantity !== undefined) {
    if (quantity < 1) throw new Error('quantity must be at least 1');
    updates.quantity = quantity;
  }

  if (Object.keys(updates).length === 0) throw new Error('No fields to update');

  await base44.asServiceRole.entities.ServiceCommitment.update(commitment_id, updates);
  console.log(`[UPDATE_SERVICE] commitment=${commitment_id} by=${user.email} fields=${Object.keys(updates).join(',')}`);
  return { commitment_id, updates, action: 'SERVICE_UPDATED' };
}

// ── DELETE ──
async function deleteServiceCommitment(base44, user, payload) {
  const { commitment_id } = payload;
  if (!commitment_id) throw new Error('commitment_id required');

  const [c] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: commitment_id });
  if (!c) throw new Error('ServiceCommitment not found');
  assertNotBillingLocked(c);

  const lineItems = await base44.asServiceRole.entities.ServiceLineItem.filter({ service_commitment_id: commitment_id });
  for (const li of lineItems) {
    await base44.asServiceRole.entities.ServiceLineItem.delete(li.id);
  }

  const legacyItems = await base44.asServiceRole.entities.ServicePurchaseLineItem.filter({ service_commitment_id: commitment_id });
  for (const li of legacyItems) {
    await base44.asServiceRole.entities.ServicePurchaseLineItem.delete(li.id);
  }

  await base44.asServiceRole.entities.ServiceCommitment.delete(commitment_id);
  return { commitment_id, action: 'DELETED' };
}

// ── ADD LINE ITEM (PHASE 3: billing lock) ──
async function addLineItem(base44, user, payload) {
  const { service_commitment_id, type, description, vendor_id, cost, billing_rate, quantity, notes } = payload;
  if (!service_commitment_id || !type || !description) throw new Error('service_commitment_id, type, and description required');

  // PHASE 3: Hard lock
  const [commitment] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: service_commitment_id });
  if (!commitment) throw new Error('ServiceCommitment not found');
  assertNotBillingLocked(commitment);

  const existing = await base44.asServiceRole.entities.ServiceLineItem.filter({ service_commitment_id });
  const maxOrder = existing.reduce((max, li) => Math.max(max, li.sort_order || 0), 0);

  const lineItem = await base44.asServiceRole.entities.ServiceLineItem.create({
    service_commitment_id,
    type,
    description,
    vendor_id: vendor_id || null,
    cost: cost || 0,
    billing_rate: billing_rate || 0,
    quantity: quantity || 1,
    sort_order: maxOrder + 1,
    notes: notes || null,
  });

  const totals = await recomputeTotals(base44, service_commitment_id);
  return { line_item: lineItem, totals, action: 'LINE_ITEM_ADDED' };
}

// ── UPDATE LINE ITEM (PHASE 3: billing lock) ──
async function updateLineItem(base44, user, payload) {
  const { line_item_id, ...updates } = payload;
  if (!line_item_id) throw new Error('line_item_id required');

  const [li] = await base44.asServiceRole.entities.ServiceLineItem.filter({ id: line_item_id });
  if (!li) throw new Error('ServiceLineItem not found');

  // PHASE 3: Hard lock
  const [commitment] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: li.service_commitment_id });
  if (commitment) assertNotBillingLocked(commitment);

  const allowed = ['type', 'description', 'vendor_id', 'cost', 'billing_rate', 'quantity', 'sort_order', 'notes'];
  const safeUpdates = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) safeUpdates[key] = updates[key];
  }

  await base44.asServiceRole.entities.ServiceLineItem.update(line_item_id, safeUpdates);
  const totals = await recomputeTotals(base44, li.service_commitment_id);

  return { line_item_id, updates: safeUpdates, totals, action: 'LINE_ITEM_UPDATED' };
}

// ── DELETE LINE ITEM (PHASE 3: billing lock) ──
async function deleteLineItem(base44, user, payload) {
  const { line_item_id } = payload;
  if (!line_item_id) throw new Error('line_item_id required');

  const [li] = await base44.asServiceRole.entities.ServiceLineItem.filter({ id: line_item_id });
  if (!li) throw new Error('ServiceLineItem not found');

  // PHASE 3: Hard lock
  const [commitment] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: li.service_commitment_id });
  if (commitment) assertNotBillingLocked(commitment);

  const commitmentId = li.service_commitment_id;
  await base44.asServiceRole.entities.ServiceLineItem.delete(line_item_id);
  const totals = await recomputeTotals(base44, commitmentId);

  return { line_item_id, commitment_id: commitmentId, totals, action: 'LINE_ITEM_DELETED' };
}

// ── REASSIGN PROJECT ──
async function reassignProject(base44, user, payload) {
  const { commitment_id, new_project_id } = payload;
  if (!commitment_id || !new_project_id) throw new Error('commitment_id and new_project_id required');

  if (user.role !== 'admin') {
    throw new Error('Only admins can reassign services to different projects');
  }

  const [c] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: commitment_id });
  if (!c) throw new Error('ServiceCommitment not found');
  assertNotBillingLocked(c);

  const old_project_id = c.project_id;
  if (old_project_id === new_project_id) {
    return { commitment_id, message: 'Project unchanged', action: 'NO_CHANGE' };
  }

  const [newProject] = await base44.asServiceRole.entities.Project.filter({ id: new_project_id });
  if (!newProject) throw new Error('Target project not found');

  await base44.asServiceRole.entities.ServiceCommitment.update(commitment_id, { project_id: new_project_id });
  console.log(`[REASSIGN_PROJECT] commitment=${commitment_id} from=${old_project_id} to=${new_project_id} by=${user.email}`);

  return { commitment_id, old_project_id, new_project_id, new_project_name: newProject.name, action: 'PROJECT_REASSIGNED' };
}

// ── CREATE SERVICE VENDOR ──
async function createServiceVendor(base44, user, payload) {
  const { name, vendor_group_id, contact_name, contact_email, contact_phone } = payload;
  if (!name) throw new Error('name required');
  if (!vendor_group_id) throw new Error('vendor_group_id required');

  const [group] = await base44.asServiceRole.entities.VendorGroup.filter({ id: vendor_group_id });
  if (!group) throw new Error('Vendor group not found');
  if (group.vendor_type !== 'SERVICE') throw new Error('Vendor group must be of type SERVICE');

  const vendor = await base44.asServiceRole.entities.ServiceVendor.create({
    name,
    vendor_group_id,
    contact_name: contact_name || null,
    contact_email: contact_email || null,
    contact_phone: contact_phone || null,
    is_active: true,
  });

  return { vendor, action: 'SERVICE_VENDOR_CREATED' };
}

// ══════════════════════════════════════════════════════════════
// PHASE 8: LEGACY DATA MIGRATION
// For commitments with total_cost=0, no line items, but legacy fields set
// ══════════════════════════════════════════════════════════════
async function migrateLegacyCommitments(base44, user) {
  if (user.role !== 'admin') throw new Error('Admin only');

  const allCommitments = await base44.asServiceRole.entities.ServiceCommitment.list('-created_date', 500);
  const allLineItems = await base44.asServiceRole.entities.ServiceLineItem.list('-created_date', 5000);
  
  const lineItemsByCommitment = new Map();
  for (const li of allLineItems) {
    if (!lineItemsByCommitment.has(li.service_commitment_id)) {
      lineItemsByCommitment.set(li.service_commitment_id, []);
    }
    lineItemsByCommitment.get(li.service_commitment_id).push(li);
  }

  let migrated = 0, skipped = 0;
  const results = [];

  for (const c of allCommitments) {
    const hasLineItems = (lineItemsByCommitment.get(c.id) || []).length > 0;
    const hasTotalCost = (c.total_cost || 0) > 0;
    const legacyCost = c.actual_cost ?? c.estimated_cost ?? 0;

    if (hasLineItems || hasTotalCost || legacyCost <= 0) {
      skipped++;
      continue;
    }

    // Create a line item from legacy cost
    await base44.asServiceRole.entities.ServiceLineItem.create({
      service_commitment_id: c.id,
      type: 'vendor_cost',
      description: `Migrated from legacy cost (${c.description || 'service'})`,
      cost: legacyCost,
      billing_rate: legacyCost,
      quantity: c.quantity || 1,
      sort_order: 1,
      notes: `Auto-migrated from estimated_cost=${c.estimated_cost ?? 0} actual_cost=${c.actual_cost ?? 0}`,
    });

    // Recompute totals (skip if billed — just update the totals)
    const r2 = n => Math.round(n * 100) / 100;
    const totalCost = legacyCost * (c.quantity || 1);
    await base44.asServiceRole.entities.ServiceCommitment.update(c.id, {
      total_cost: r2(totalCost),
      total_billable: r2(totalCost),
      planned_cost: r2(totalCost),
      planned_billable: r2(totalCost),
    });

    migrated++;
    results.push({ id: c.id, description: c.description, legacy_cost: legacyCost, new_total: r2(totalCost) });
    console.log(`[MIGRATE_LEGACY] commitment=${c.id} legacy_cost=${legacyCost} → total_cost=${r2(totalCost)}`);
  }

  return { action: 'LEGACY_MIGRATION_COMPLETE', migrated, skipped, total: allCommitments.length, results };
}