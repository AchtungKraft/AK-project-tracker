import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * executeServiceAction - Service Commitment Mutation Engine
 * Handles lifecycle transitions, line item CRUD, and totals recomputation.
 * 
 * Actions: CREATE, UPDATE_STATUS, UPDATE_COST, DELETE,
 *          ADD_LINE_ITEM, UPDATE_LINE_ITEM, DELETE_LINE_ITEM, RECOMPUTE_TOTALS,
 *          CREATE_SERVICE_VENDOR
 * 
 * Services do NOT interact with inventory, stock, or allocation logic.
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
      case 'CREATE_WITH_LINE_ITEMS':
        result = await createWithLineItems(base44, user, payload);
        break;
      case 'UPDATE_STATUS':
        result = await updateStatus(base44, user, payload);
        break;
      case 'UPDATE_COST':
        result = await updateCost(base44, user, payload);
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

// ── RECOMPUTE TOTALS ──
async function recomputeTotals(base44, commitmentId) {
  if (!commitmentId) throw new Error('commitment_id required');
  const lineItems = await base44.asServiceRole.entities.ServiceLineItem.filter({ service_commitment_id: commitmentId });
  
  let totalCost = 0;
  let totalBillable = 0;
  for (const li of lineItems) {
    const qty = li.quantity || 1;
    totalCost += (li.cost || 0) * qty;
    totalBillable += (li.billing_rate || 0) * qty;
  }

  await base44.asServiceRole.entities.ServiceCommitment.update(commitmentId, {
    total_cost: Math.round(totalCost * 100) / 100,
    total_billable: Math.round(totalBillable * 100) / 100,
  });

  return { commitment_id: commitmentId, total_cost: totalCost, total_billable: totalBillable, line_count: lineItems.length, action: 'TOTALS_RECOMPUTED' };
}

// ── CREATE (bare commitment — no legacy cost fields) ──
async function createServiceCommitment(base44, user, payload) {
  const { project_id, service_id, description, vendor_id, quantity, notes } = payload;
  if (!project_id || !service_id || !description) throw new Error('project_id, service_id, and description required');

  const commitment = await base44.asServiceRole.entities.ServiceCommitment.create({
    project_id,
    service_id,
    description,
    vendor_id: vendor_id || null,
    quantity: quantity || 1,
    status: 'planned',
    notes: notes || null,
    total_cost: 0,
    total_billable: 0,
  });

  return { commitment, action: 'CREATED' };
}

// ── CREATE WITH LINE ITEMS (atomic: commitment + N line items + recompute) ──
async function createWithLineItems(base44, user, payload) {
  const { project_id, service_id, description, vendor_id, quantity, notes, line_items } = payload;
  if (!project_id || !service_id || !description) throw new Error('project_id, service_id, and description required');
  if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
    throw new Error('At least one line item is required');
  }

  // Validate each line item has cost or billing_rate
  for (let i = 0; i < line_items.length; i++) {
    const li = line_items[i];
    if (!li.type || !li.description) throw new Error(`Line item ${i + 1}: type and description required`);
    if (!(li.cost > 0) && !(li.billing_rate > 0)) {
      throw new Error(`Line item ${i + 1}: cost or billing_rate must be > 0`);
    }
  }

  // 1. Create commitment (no legacy cost fields)
  const commitment = await base44.asServiceRole.entities.ServiceCommitment.create({
    project_id,
    service_id,
    description,
    vendor_id: vendor_id || null,
    quantity: quantity || 1,
    status: 'planned',
    notes: notes || null,
    total_cost: 0,
    total_billable: 0,
  });

  // 2. Create line items
  const createdLines = [];
  for (let i = 0; i < line_items.length; i++) {
    const li = line_items[i];
    const created = await base44.asServiceRole.entities.ServiceLineItem.create({
      service_commitment_id: commitment.id,
      type: li.type,
      description: li.description,
      vendor_id: li.vendor_id || null,
      cost: li.cost || 0,
      billing_rate: li.billing_rate || 0,
      quantity: li.quantity || 1,
      sort_order: i + 1,
      notes: li.notes || null,
    });
    createdLines.push(created);
  }

  // 3. Recompute totals
  const totals = await recomputeTotals(base44, commitment.id);

  console.log(`[CREATE_WITH_LINE_ITEMS] commitment=${commitment.id} lines=${createdLines.length} cost=${totals.total_cost} billable=${totals.total_billable} by=${user.email}`);

  return {
    commitment,
    line_items: createdLines,
    totals,
    action: 'CREATED_WITH_LINE_ITEMS',
  };
}

// ── UPDATE STATUS ──
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
  if (new_status === 'billed') updates.billed_date = now;

  await base44.asServiceRole.entities.ServiceCommitment.update(commitment_id, updates);
  return { commitment_id, old_status: c.status, new_status, action: 'STATUS_UPDATED' };
}

// ── UPDATE COST (legacy) ──
async function updateCost(base44, user, payload) {
  const { commitment_id, estimated_cost, actual_cost } = payload;
  if (!commitment_id) throw new Error('commitment_id required');

  const updates = {};
  if (estimated_cost !== undefined) updates.estimated_cost = estimated_cost;
  if (actual_cost !== undefined) updates.actual_cost = actual_cost;

  await base44.asServiceRole.entities.ServiceCommitment.update(commitment_id, updates);
  return { commitment_id, updates, action: 'COST_UPDATED' };
}

// ── UPDATE SERVICE (core fields) ──
async function updateService(base44, user, payload) {
  const { commitment_id, service_id, vendor_id, description, notes, quantity } = payload;
  if (!commitment_id) throw new Error('commitment_id required');

  const [c] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: commitment_id });
  if (!c) throw new Error('ServiceCommitment not found');
  if (c.status === 'billed') throw new Error('Cannot edit a billed service commitment');

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
  if (c.status === 'billed') throw new Error('Cannot delete a billed service commitment');

  // Delete related line items
  const lineItems = await base44.asServiceRole.entities.ServiceLineItem.filter({ service_commitment_id: commitment_id });
  for (const li of lineItems) {
    await base44.asServiceRole.entities.ServiceLineItem.delete(li.id);
  }

  // Delete legacy ServicePurchaseLineItem if any
  const legacyItems = await base44.asServiceRole.entities.ServicePurchaseLineItem.filter({ service_commitment_id: commitment_id });
  for (const li of legacyItems) {
    await base44.asServiceRole.entities.ServicePurchaseLineItem.delete(li.id);
  }

  await base44.asServiceRole.entities.ServiceCommitment.delete(commitment_id);
  return { commitment_id, action: 'DELETED' };
}

// ── ADD LINE ITEM ──
async function addLineItem(base44, user, payload) {
  const { service_commitment_id, type, description, vendor_id, cost, billing_rate, quantity, notes } = payload;
  if (!service_commitment_id || !type || !description) throw new Error('service_commitment_id, type, and description required');

  // Get current max sort_order
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

  // Recompute commitment totals
  const totals = await recomputeTotals(base44, service_commitment_id);

  return { line_item: lineItem, totals, action: 'LINE_ITEM_ADDED' };
}

// ── UPDATE LINE ITEM ──
async function updateLineItem(base44, user, payload) {
  const { line_item_id, ...updates } = payload;
  if (!line_item_id) throw new Error('line_item_id required');

  const [li] = await base44.asServiceRole.entities.ServiceLineItem.filter({ id: line_item_id });
  if (!li) throw new Error('ServiceLineItem not found');

  const allowed = ['type', 'description', 'vendor_id', 'cost', 'billing_rate', 'quantity', 'sort_order', 'notes'];
  const safeUpdates = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) safeUpdates[key] = updates[key];
  }

  await base44.asServiceRole.entities.ServiceLineItem.update(line_item_id, safeUpdates);

  // Recompute commitment totals
  const totals = await recomputeTotals(base44, li.service_commitment_id);

  return { line_item_id, updates: safeUpdates, totals, action: 'LINE_ITEM_UPDATED' };
}

// ── DELETE LINE ITEM ──
async function deleteLineItem(base44, user, payload) {
  const { line_item_id } = payload;
  if (!line_item_id) throw new Error('line_item_id required');

  const [li] = await base44.asServiceRole.entities.ServiceLineItem.filter({ id: line_item_id });
  if (!li) throw new Error('ServiceLineItem not found');

  const commitmentId = li.service_commitment_id;
  await base44.asServiceRole.entities.ServiceLineItem.delete(line_item_id);

  // Recompute commitment totals
  const totals = await recomputeTotals(base44, commitmentId);

  return { line_item_id, commitment_id: commitmentId, totals, action: 'LINE_ITEM_DELETED' };
}

// ── REASSIGN PROJECT ──
async function reassignProject(base44, user, payload) {
  const { commitment_id, new_project_id } = payload;
  if (!commitment_id || !new_project_id) throw new Error('commitment_id and new_project_id required');

  // Admin-only check
  if (user.role !== 'admin') {
    throw new Error('Only admins can reassign services to different projects');
  }

  const [c] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: commitment_id });
  if (!c) throw new Error('ServiceCommitment not found');
  if (c.status === 'billed') throw new Error('Cannot reassign a billed service commitment');

  const old_project_id = c.project_id;
  if (old_project_id === new_project_id) {
    return { commitment_id, message: 'Project unchanged', action: 'NO_CHANGE' };
  }

  // Verify new project exists
  const [newProject] = await base44.asServiceRole.entities.Project.filter({ id: new_project_id });
  if (!newProject) throw new Error('Target project not found');

  // Update the commitment
  await base44.asServiceRole.entities.ServiceCommitment.update(commitment_id, {
    project_id: new_project_id,
  });

  // Audit log
  console.log(`[REASSIGN_PROJECT] commitment=${commitment_id} from=${old_project_id} to=${new_project_id} by=${user.email}`);

  return {
    commitment_id,
    old_project_id,
    new_project_id,
    new_project_name: newProject.name,
    action: 'PROJECT_REASSIGNED',
  };
}

// ── CREATE SERVICE VENDOR (inline) ──
async function createServiceVendor(base44, user, payload) {
  const { name, category, contact_name, contact_email, contact_phone } = payload;
  if (!name) throw new Error('name required');

  const vendor = await base44.asServiceRole.entities.ServiceVendor.create({
    name,
    category: category || 'general',
    contact_name: contact_name || null,
    contact_email: contact_email || null,
    contact_phone: contact_phone || null,
    is_active: true,
  });

  return { vendor, action: 'SERVICE_VENDOR_CREATED' };
}