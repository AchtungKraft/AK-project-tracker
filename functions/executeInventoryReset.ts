import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * executeInventoryReset - Admin function to reset inventory
 * 
 * Phase 12R: DESTRUCTIVE ACTION - requires confirm_token from previewInventoryReset
 * 
 * Behavior:
 * - For each part in scope:
 *   - Set physical_stock = 0
 *   - Set all related commitment.reserved_from_stock = 0
 *   - Recompute to_order via canonical rebalance
 * - Writes audit records
 * - Runs validateSupplyIntegrity after completion
 * 
 * Guardrails:
 * - REQUIRES confirm_token from a recent previewInventoryReset call
 * - Never deletes commitments; only resets inventory + reservations
 * - Default is dry_run=true
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin check
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { 
      scope = 'all', 
      part_ids = [], 
      vendor_id, 
      project_id,
      confirm_token,
      dry_run = true 
    } = body;
    
    const timestamp = new Date().toISOString();
    const batch_id = `reset_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // GUARDRAIL: Require confirm_token for non-dry-run execution
    if (!dry_run && !confirm_token) {
      return Response.json({ 
        error: 'CONFIRM_TOKEN_REQUIRED: Run previewInventoryReset first and pass the preview_token as confirm_token',
        help: 'This is a destructive operation. Preview first to see what will be affected.'
      }, { status: 400 });
    }

    // PHASE 12R-HARDENING: Load and validate token from persisted entity
    let tokenRecord = null;
    let partsWithStock = [];
    let totalPhysicalStock = 0;
    let affectedCommitments = [];
    
    if (!dry_run && confirm_token) {
      // Load token from entity
      const tokens = await base44.entities.InventoryResetToken.filter({ token: confirm_token });
      tokenRecord = tokens[0];
      
      if (!tokenRecord) {
        return Response.json({ 
          error: 'INVALID_CONFIRM_TOKEN: Token not found. Run previewInventoryReset first.'
        }, { status: 400 });
      }
      
      // Check if already used
      if (tokenRecord.used_at) {
        return Response.json({ 
          error: 'TOKEN_ALREADY_USED: This preview token has already been consumed.',
          used_at: tokenRecord.used_at,
          used_by: tokenRecord.used_by
        }, { status: 400 });
      }
      
      // Check expiration
      if (new Date(tokenRecord.expires_at) < new Date()) {
        return Response.json({ 
          error: 'CONFIRM_TOKEN_EXPIRED: Preview token has expired. Run previewInventoryReset again.'
        }, { status: 400 });
      }
      
      // Verify scope parameters match
      const storedParams = tokenRecord.scope_params || {};
      if (tokenRecord.scope !== scope) {
        return Response.json({ 
          error: 'SCOPE_MISMATCH: Request scope does not match preview scope.',
          expected_scope: tokenRecord.scope,
          received_scope: scope
        }, { status: 400 });
      }
      
      // Use stored part_ids as authoritative source
      const authoritative_part_ids = tokenRecord.part_ids_affected || [];
      
      if (authoritative_part_ids.length > 0) {
        const allParts = await base44.entities.Part.filter({ id: { $in: authoritative_part_ids } });
        partsWithStock = allParts.filter(p => (p.physical_stock ?? 0) > 0);
      }
      
      totalPhysicalStock = partsWithStock.reduce((sum, p) => sum + (p.physical_stock ?? 0), 0);
      
      // Get commitments for these parts
      if (authoritative_part_ids.length > 0) {
        const allCommitments = await base44.entities.PartCommitment.list();
        affectedCommitments = allCommitments.filter(c => 
          authoritative_part_ids.includes(c.part_id) &&
          c.commitment_status !== 'cancelled' &&
          c.commitment_status !== 'closed'
        );
      }
      
      // Mark token as used
      await base44.asServiceRole.entities.InventoryResetToken.update(tokenRecord.id, {
        used_at: timestamp,
        used_by: user.email
      });
      
    } else {
      // DRY RUN: Fetch parts based on scope (original logic)
      let partsToReset = [];
      
      if (scope === 'all') {
        partsToReset = await base44.entities.Part.list();
      } else if (scope === 'part_ids' && part_ids.length > 0) {
        partsToReset = await base44.entities.Part.filter({ id: { $in: part_ids } });
      } else if (scope === 'vendor_id' && vendor_id) {
        partsToReset = await base44.entities.Part.filter({ default_vendor_id: vendor_id });
      } else if (scope === 'project_id' && project_id) {
        const commitments = await base44.entities.PartCommitment.filter({ project_id });
        const partIdsFromProject = [...new Set(commitments.map(c => c.part_id))];
        if (partIdsFromProject.length > 0) {
          partsToReset = await base44.entities.Part.filter({ id: { $in: partIdsFromProject } });
        }
      } else {
        return Response.json({ error: 'Invalid scope or missing parameters' }, { status: 400 });
      }

      partsWithStock = partsToReset.filter(p => (p.physical_stock ?? 0) > 0);
      totalPhysicalStock = partsWithStock.reduce((sum, p) => sum + (p.physical_stock ?? 0), 0);

      const partIdsInScope = partsToReset.map(p => p.id);
      if (partIdsInScope.length > 0) {
        const allCommitments = await base44.entities.PartCommitment.list();
        affectedCommitments = allCommitments.filter(c => 
          partIdsInScope.includes(c.part_id) &&
          c.commitment_status !== 'cancelled' &&
          c.commitment_status !== 'closed'
        );
      }
    }

    // DRY RUN - just return what would happen
    if (dry_run) {
      return Response.json({
        success: true,
        dry_run: true,
        timestamp,
        message: "DRY RUN - no changes made. Pass dry_run=false with confirm_token to execute.",
        scope,
        summary: {
          parts_to_reset: partsWithStock.length,
          total_stock_to_remove: totalPhysicalStock,
          commitments_to_update: affectedCommitments.length
        }
      });
    }

    // EXECUTE RESET
    const results = {
      parts_reset: 0,
      commitments_updated: 0,
      errors: []
    };

    // 1. Reset all parts' physical_stock to 0
    for (const part of partsWithStock) {
      try {
        await base44.asServiceRole.entities.Part.update(part.id, {
          physical_stock: 0
        });
        
        // Create audit log
        await base44.asServiceRole.entities.InventoryAuditLog.create({
          part_id: part.id,
          action_type: 'RESET',
          qty_delta: -(part.physical_stock ?? 0),
          old_qty: part.physical_stock ?? 0,
          new_qty: 0,
          notes: `Inventory reset batch ${batch_id}`,
          performed_by: user.email,
          performed_at: timestamp
        });
        
        results.parts_reset++;
      } catch (err) {
        results.errors.push({ part_id: part.id, error: err.message });
      }
    }

    // 2. Update all commitments: reserved_from_stock = 0, recompute to_order
    for (const commitment of affectedCommitments) {
      try {
        const required = commitment.required_total ?? commitment.qty_committed ?? 0;
        const covered_po = commitment.covered_from_po ?? 0;
        const new_to_order = Math.max(0, required - covered_po);
        
        await base44.asServiceRole.entities.PartCommitment.update(commitment.id, {
          reserved_from_stock: 0,
          qty_reserved: 0,
          qty_to_order: new_to_order,
          last_recomputed_at: timestamp,
          commitment_version: (commitment.commitment_version ?? 0) + 1
        });
        
        results.commitments_updated++;
      } catch (err) {
        results.errors.push({ commitment_id: commitment.id, error: err.message });
      }
    }

    // 3. PHASE 12R-HARDENING: Invoke rebalance for each affected part
    const rebalanceResults = [];
    const uniquePartIds = [...new Set(partsWithStock.map(p => p.id))];
    
    for (const part_id of uniquePartIds) {
      try {
        const rebalanceResponse = await base44.asServiceRole.functions.invoke('rebalancePartReservations', {
          part_id,
          dry_run: false
        });
        rebalanceResults.push({ part_id, success: true, result: rebalanceResponse.data });
      } catch (err) {
        rebalanceResults.push({ part_id, success: false, error: err.message });
        results.errors.push({ part_id, error: `Rebalance failed: ${err.message}` });
      }
    }

    // 4. Run validateSupplyIntegrity
    let validationResult = null;
    try {
      const validationResponse = await base44.asServiceRole.functions.invoke('validateSupplyIntegrity', {});
      validationResult = validationResponse.data;
    } catch (err) {
      validationResult = { error: err.message };
    }

    return Response.json({
      success: results.errors.length === 0,
      dry_run: false,
      timestamp,
      batch_id,
      executed_by: user.email,
      
      scope,
      scope_params: { part_ids: part_ids.length, vendor_id, project_id },
      
      results: {
        parts_reset: results.parts_reset,
        total_stock_removed: totalPhysicalStock,
        commitments_updated: results.commitments_updated,
        errors: results.errors
      },
      
      validation_after_reset: validationResult?.summary || validationResult,
      
      rebalance_summary: {
        parts_rebalanced: rebalanceResults.filter(r => r.success).length,
        rebalance_errors: rebalanceResults.filter(r => !r.success).length
      },
      
      token_used: tokenRecord ? {
        token: tokenRecord.token,
        created_at: tokenRecord.created_date,
        used_at: timestamp
      } : null,
      
      message: results.errors.length === 0 
        ? `✅ Reset complete: ${results.parts_reset} parts, ${results.commitments_updated} commitments, ${rebalanceResults.filter(r => r.success).length} rebalanced`
        : `⚠️ Reset completed with ${results.errors.length} errors`
    });

  } catch (error) {
    console.error("executeInventoryReset error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});