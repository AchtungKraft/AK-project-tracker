/**
 * poValidationGuards.js
 * ─────────────────────
 * Canonical, shared PO integrity validation.
 *
 * Every PO creation and PO deletion/cancellation path MUST call these
 * guards before mutating data.  UI-only checks are duplicates of these;
 * these are the source of truth.
 *
 * Usage (from another backend function via inline import):
 *   — This file is a standalone Deno.serve endpoint so it can be tested
 *     independently, but the exported-via-response helpers are inlined
 *     into other functions.  Copy the guard functions directly into any
 *     file that needs them (each function is deployed independently —
 *     local imports are not supported).
 *
 * CANONICAL RULES:
 *   PO_CREATE: Every line item MUST have unit_cost > 0
 *   PO_DELETE / PO_CANCEL: Order.billing_status MUST === 'Not Invoiced'
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  // Health / smoke-test endpoint
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, line_items, order_id } = await req.json();

    if (action === 'validate_po_create') {
      const result = validatePOLineItems(line_items || []);
      return Response.json(result);
    }

    if (action === 'validate_po_delete') {
      if (!order_id) return Response.json({ error: 'order_id required' }, { status: 400 });
      const [order] = await base44.asServiceRole.entities.Order.filter({ id: order_id });
      if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });
      const result = validatePODeletion(order);
      return Response.json(result);
    }

    return Response.json({ error: 'Unknown action. Use validate_po_create or validate_po_delete' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Validate PO line items before creation.
 * Returns { valid: boolean, errors: Array<{ commitment_id, reason_code, message }> }
 *
 * CANONICAL RULE: Every line MUST have unit_cost > 0.
 * Missing cost or $0 cost is a hard block — not a warning.
 */
function validatePOLineItems(lineItems) {
  const errors = [];
  for (const item of lineItems) {
    const cost = Number(item.unit_cost);
    const id = item.commitment_id || item.id || 'unknown';
    const name = item.part_name || item.part?.part_name || '';

    if (cost === null || cost === undefined || !Number.isFinite(cost)) {
      errors.push({
        commitment_id: id,
        reason_code: 'MISSING_COST',
        part_name: name,
        message: `Missing cost for ${name || id}`,
      });
    } else if (cost <= 0) {
      errors.push({
        commitment_id: id,
        reason_code: 'ZERO_COST',
        part_name: name,
        message: `$0 cost for ${name || id} — cannot create PO line with zero cost`,
      });
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate PO before deletion or cancellation.
 * Returns { valid: boolean, error?: { reason_code, message } }
 *
 * CANONICAL RULE: billing_status MUST be 'Not Invoiced' (or absent/null).
 */
function validatePODeletion(order) {
  const bs = order.billing_status;
  if (bs && bs !== 'Not Invoiced') {
    return {
      valid: false,
      error: {
        reason_code: 'PO_INVOICED',
        message: `Cannot delete/cancel PO — billing status is "${bs}". Remove invoice first.`,
        billing_status: bs,
      },
    };
  }
  return { valid: true };
}