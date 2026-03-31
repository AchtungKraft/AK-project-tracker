import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * executeServiceAction - Service Commitment Mutation Engine
 * Handles lifecycle transitions for project services (shipping, plating, etc.)
 * 
 * Actions: CREATE, UPDATE_STATUS, UPDATE_COST, DELETE
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
      case 'UPDATE_STATUS':
        result = await updateStatus(base44, user, payload);
        break;
      case 'UPDATE_COST':
        result = await updateCost(base44, user, payload);
        break;
      case 'DELETE':
        result = await deleteServiceCommitment(base44, user, payload);
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

async function createServiceCommitment(base44, user, payload) {
  const { project_id, service_id, description, vendor_id, estimated_cost, quantity, notes } = payload;
  if (!project_id || !service_id || !description) throw new Error('project_id, service_id, and description required');

  const commitment = await base44.asServiceRole.entities.ServiceCommitment.create({
    project_id,
    service_id,
    description,
    vendor_id: vendor_id || null,
    estimated_cost: estimated_cost || 0,
    quantity: quantity || 1,
    status: 'planned',
    notes: notes || null,
  });

  return { commitment, action: 'CREATED' };
}

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

async function updateCost(base44, user, payload) {
  const { commitment_id, estimated_cost, actual_cost } = payload;
  if (!commitment_id) throw new Error('commitment_id required');

  const updates = {};
  if (estimated_cost !== undefined) updates.estimated_cost = estimated_cost;
  if (actual_cost !== undefined) updates.actual_cost = actual_cost;

  await base44.asServiceRole.entities.ServiceCommitment.update(commitment_id, updates);
  return { commitment_id, updates, action: 'COST_UPDATED' };
}

async function deleteServiceCommitment(base44, user, payload) {
  const { commitment_id } = payload;
  if (!commitment_id) throw new Error('commitment_id required');

  const [c] = await base44.asServiceRole.entities.ServiceCommitment.filter({ id: commitment_id });
  if (!c) throw new Error('ServiceCommitment not found');
  if (c.status === 'billed') throw new Error('Cannot delete a billed service commitment');

  // Delete related line items first
  const lineItems = await base44.asServiceRole.entities.ServicePurchaseLineItem.filter({ service_commitment_id: commitment_id });
  for (const li of lineItems) {
    await base44.asServiceRole.entities.ServicePurchaseLineItem.delete(li.id);
  }

  await base44.asServiceRole.entities.ServiceCommitment.delete(commitment_id);
  return { commitment_id, action: 'DELETED' };
}