/**
 * applyReceivingToOrderAndCommitment.js
 * 
 * DEPRECATED — PHASE 0 STABILIZATION
 * 
 * This function is DEPRECATED as of Phase 0.
 * All receiving MUST go through executeSupplyAction.RECEIVE.
 * 
 * This stub remains to prevent 404 errors from any lingering UI references.
 * It redirects callers to the canonical receiving path.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    
    console.warn('[PHASE0_DEPRECATED] applyReceivingToOrderAndCommitment called — redirecting to executeSupplyAction.RECEIVE');
    console.warn('[PHASE0_DEPRECATED] Caller should migrate to executeSupplyAction with action_type=RECEIVE');
    
    // Redirect to canonical receiving path
    const { 
      line_item_id, 
      qty_received, 
      location_id = null,
      order_id = null 
    } = payload;
    
    if (!line_item_id || !qty_received) {
      return Response.json({ 
        error: 'DEPRECATED: This function is deprecated. Use executeSupplyAction with action_type=RECEIVE instead.',
        migration_guide: {
          new_function: 'executeSupplyAction',
          payload_format: {
            action_type: 'RECEIVE',
            payload: { line_item_id: 'xxx', qty_received: 1, location_id: 'optional' }
          }
        }
      }, { status: 400 });
    }

    // Forward to canonical path
    const result = await base44.functions.invoke('executeSupplyAction', {
      action_type: 'RECEIVE',
      payload: {
        line_item_id,
        qty_received,
        location_id,
        order_id
      }
    });

    // Pass through result with deprecation warning
    return Response.json({
      ...result.data,
      _deprecated_warning: 'applyReceivingToOrderAndCommitment is deprecated. Migrate to executeSupplyAction with action_type=RECEIVE.'
    });

  } catch (error) {
    console.error('applyReceivingToOrderAndCommitment (deprecated) error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});