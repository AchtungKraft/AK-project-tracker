import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * updatePartPricing - PHASE 15 Part Pricing Update Service
 * 
 * This is the CANONICAL way to update Part pricing.
 * 
 * Enforces pricing_mode invariants:
 * - Matrix mode: retail_override=null, applied_markup_pct required
 * - Manual mode: retail_override required, applied_markup_pct=null
 * 
 * If cost changes and open commitments exist:
 * - Sets needs_cost_review flag
 * - Emits COST_CHANGED_WITH_OPEN_COMMITMENTS event
 * - Does NOT auto-update existing commitments
 * 
 * Input:
 *   part_id: string
 *   pricing_mode: "matrix" | "manual"
 *   cost: number (optional)
 *   retail_override: number (required if manual mode)
 * 
 * Output:
 *   { success: true, part_id, pricing_mode, retail_effective, open_commitments_flagged }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { part_id, pricing_mode, cost, retail_override } = await req.json();

    if (!part_id) {
      return Response.json({ 
        error: 'PART_ID_REQUIRED' 
      }, { status: 400 });
    }

    // Fetch part
    const [part] = await base44.entities.Part.filter({ id: part_id });
    if (!part) {
      return Response.json({ 
        error: 'PART_NOT_FOUND',
        part_id
      }, { status: 404 });
    }

    const old_cost = part.cost ?? 0;
    const new_cost = cost !== undefined ? Number(cost) : old_cost;
    const mode = pricing_mode || part.pricing_mode || 'matrix';

    // Build update data
    const updateData = {
      pricing_mode: mode,
      last_cost_update_at: new Date().toISOString(),
      last_cost_update_by: user.email
    };

    if (cost !== undefined) {
      updateData.cost = new_cost;
    }

    // === PRICING MODE LOGIC ===
    
    if (mode === 'matrix') {
      // HARD VALIDATION
      if (new_cost <= 0) {
        return Response.json({
          error: 'PRICING_MODE_CONFLICT',
          message: 'Matrix pricing requires cost > 0',
          pricing_mode: 'matrix',
          cost: new_cost
        }, { status: 400 });
      }

      // Compute retail from matrix
      const matrixResponse = await base44.functions.invoke('computeRetailFromMatrix', { cost: new_cost });
      
      if (!matrixResponse.data.success) {
        return Response.json({
          error: 'MATRIX_COMPUTATION_FAILED',
          message: matrixResponse.data.message || matrixResponse.data.error,
          cost: new_cost
        }, { status: 400 });
      }

      // Apply matrix results
      updateData.retail_matrix_price = matrixResponse.data.retail_matrix_price;
      updateData.applied_markup_pct = matrixResponse.data.applied_markup_pct;
      updateData.retail_override = null; // HARD CLEAR
      
    } else if (mode === 'manual') {
      // HARD VALIDATION
      if (retail_override === undefined || retail_override === null || Number(retail_override) <= 0) {
        return Response.json({
          error: 'PRICING_MODE_CONFLICT',
          message: 'Manual pricing requires retail_override > 0',
          pricing_mode: 'manual',
          retail_override
        }, { status: 400 });
      }

      updateData.retail_override = Number(retail_override);
      updateData.applied_markup_pct = null; // HARD CLEAR
      
    } else {
      return Response.json({
        error: 'INVALID_PRICING_MODE',
        message: `pricing_mode must be "matrix" or "manual", got: ${mode}`
      }, { status: 400 });
    }

    // === COST CHANGE DRIFT PROTECTION ===
    let open_commitments_flagged = false;
    
    if (cost !== undefined && new_cost !== old_cost) {
      // Check for open commitments
      const openCommitments = await base44.entities.PartCommitment.filter({
        part_id,
        commitment_status: { $nin: ['cancelled', 'closed', 'installed'] }
      });

      if (openCommitments.length > 0) {
        updateData.needs_cost_review = true;
        open_commitments_flagged = true;

        // Emit lifecycle event
        await base44.asServiceRole.entities.LifecycleEvent.create({
          commitment_id: null, // Part-level event
          event_type: 'COST_CHANGED_WITH_OPEN_COMMITMENTS',
          trigger_source: 'PRICING_UPDATE',
          triggered_by: user.email,
          actor_email: user.email,
          part_id,
          old_values: JSON.stringify({ cost: old_cost }),
          new_values: JSON.stringify({ cost: new_cost }),
          metadata: JSON.stringify({ 
            open_commitments_count: openCommitments.length,
            commitments: openCommitments.map(c => c.id)
          }),
          event_date: new Date().toISOString()
        });
      }
    }

    // Validate before persisting
    const validationResponse = await base44.functions.invoke('validatePartPricing', { 
      part_data: { ...part, ...updateData } 
    });

    if (!validationResponse.data.valid) {
      return Response.json({
        error: 'VALIDATION_FAILED',
        message: 'Pricing validation failed',
        violations: validationResponse.data.violations
      }, { status: 400 });
    }

    // Update part
    await base44.asServiceRole.entities.Part.update(part_id, updateData);

    // Compute effective retail
    const retail_effective = mode === 'manual' 
      ? updateData.retail_override 
      : updateData.retail_matrix_price;

    return Response.json({
      success: true,
      part_id,
      pricing_mode: mode,
      cost: new_cost,
      retail_effective,
      applied_markup_pct: updateData.applied_markup_pct,
      open_commitments_flagged,
      needs_cost_review: updateData.needs_cost_review || false,
      message: open_commitments_flagged 
        ? 'Pricing updated - open commitments flagged for review'
        : 'Pricing updated successfully'
    });

  } catch (error) {
    console.error('updatePartPricing error:', error);
    return Response.json({ 
      error: 'UPDATE_FAILED',
      message: error.message 
    }, { status: 500 });
  }
});