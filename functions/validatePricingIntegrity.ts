import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * validatePricingIntegrity - PHASE 15 Pricing Integrity Validator
 * 
 * Performs comprehensive pricing validation across Parts and Commitments.
 * 
 * For Parts:
 * - pricing_mode consistency
 * - No manual + markup together
 * - No matrix without applied_markup_pct
 * - Negative margin flagged
 * 
 * For Commitments:
 * - unit_cost_snapshot exists
 * - unit_retail_snapshot exists
 * - planned totals match snapshot * required_total
 * - Negative margin flagged
 * 
 * Input:
 *   scope: "all" | "parts" | "commitments" | "part" | "commitment"
 *   part_id: string (if scope=part)
 *   commitment_id: string (if scope=commitment)
 * 
 * Output:
 *   {
 *     pricing_status: "OK" | "VIOLATIONS",
 *     violations: [{ entity_type, entity_id, code, message }],
 *     summary: { parts_checked, commitments_checked, violations_found }
 *   }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { scope = 'all', part_id, commitment_id } = await req.json();

    const violations = [];
    let parts_checked = 0;
    let commitments_checked = 0;

    // === PART VALIDATION ===
    
    const validatePart = (part) => {
      parts_checked++;
      const pricing_mode = part.pricing_mode || 'matrix';
      const cost = part.cost ?? 0;
      const retail_override = part.retail_override;
      const retail_matrix = part.retail_matrix_price;
      const markup_pct = part.applied_markup_pct;

      // Matrix mode checks
      if (pricing_mode === 'matrix') {
        if (retail_override !== null && retail_override !== undefined) {
          violations.push({
            entity_type: 'Part',
            entity_id: part.id,
            part_name: part.part_name,
            code: 'MATRIX_WITH_OVERRIDE',
            message: `Matrix pricing has retail_override=${retail_override}, must be null`,
            severity: 'ERROR'
          });
        }

        if (markup_pct === null || markup_pct === undefined) {
          violations.push({
            entity_type: 'Part',
            entity_id: part.id,
            part_name: part.part_name,
            code: 'MATRIX_WITHOUT_MARKUP',
            message: 'Matrix pricing missing applied_markup_pct',
            severity: 'ERROR'
          });
        }

        if (cost > 0 && (!retail_matrix || retail_matrix <= 0)) {
          violations.push({
            entity_type: 'Part',
            entity_id: part.id,
            part_name: part.part_name,
            code: 'MATRIX_WITHOUT_RETAIL',
            message: `Matrix pricing with cost=${cost} but retail_matrix_price=${retail_matrix}`,
            severity: 'ERROR'
          });
        }
      }

      // Manual mode checks
      if (pricing_mode === 'manual') {
        if (!retail_override || retail_override <= 0) {
          violations.push({
            entity_type: 'Part',
            entity_id: part.id,
            part_name: part.part_name,
            code: 'MANUAL_WITHOUT_OVERRIDE',
            message: `Manual pricing requires retail_override > 0, got ${retail_override}`,
            severity: 'ERROR'
          });
        }

        if (markup_pct !== null && markup_pct !== undefined) {
          violations.push({
            entity_type: 'Part',
            entity_id: part.id,
            part_name: part.part_name,
            code: 'MANUAL_WITH_MARKUP',
            message: `Manual pricing has applied_markup_pct=${markup_pct}, must be null`,
            severity: 'ERROR'
          });
        }
      }

      // Negative margin check
      const retail_eff = pricing_mode === 'manual' ? retail_override : retail_matrix;
      if (cost > 0 && retail_eff > 0 && retail_eff < cost) {
        violations.push({
          entity_type: 'Part',
          entity_id: part.id,
          part_name: part.part_name,
          code: 'NEGATIVE_MARGIN',
          message: `Retail ${retail_eff} < cost ${cost}`,
          severity: 'WARNING',
          margin_pct: ((retail_eff - cost) / retail_eff) * 100
        });
      }
    };

    // === COMMITMENT VALIDATION ===
    
    const validateCommitment = (commitment) => {
      commitments_checked++;
      const unit_cost = commitment.unit_cost_snapshot;
      const unit_retail = commitment.unit_retail_snapshot;
      const required = commitment.required_total ?? 0;
      const planned_cost = commitment.planned_cost_total;
      const planned_retail = commitment.planned_retail_total;

      // Snapshot existence
      if (unit_cost === null || unit_cost === undefined) {
        violations.push({
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          code: 'MISSING_COST_SNAPSHOT',
          message: 'Commitment missing unit_cost_snapshot',
          severity: 'ERROR'
        });
      }

      if (unit_retail === null || unit_retail === undefined) {
        violations.push({
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          code: 'MISSING_RETAIL_SNAPSHOT',
          message: 'Commitment missing unit_retail_snapshot',
          severity: 'ERROR'
        });
      }

      // Planned totals match
      if (unit_cost && Math.abs((planned_cost || 0) - (unit_cost * required)) > 0.01) {
        violations.push({
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          code: 'COST_TOTAL_MISMATCH',
          message: `planned_cost_total=${planned_cost} != unit_cost_snapshot=${unit_cost} * required_total=${required}`,
          severity: 'ERROR',
          expected: unit_cost * required,
          actual: planned_cost
        });
      }

      if (unit_retail && Math.abs((planned_retail || 0) - (unit_retail * required)) > 0.01) {
        violations.push({
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          code: 'RETAIL_TOTAL_MISMATCH',
          message: `planned_retail_total=${planned_retail} != unit_retail_snapshot=${unit_retail} * required_total=${required}`,
          severity: 'ERROR',
          expected: unit_retail * required,
          actual: planned_retail
        });
      }

      // Negative margin
      if (unit_cost > 0 && unit_retail > 0 && unit_retail < unit_cost) {
        violations.push({
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          code: 'NEGATIVE_MARGIN',
          message: `unit_retail=${unit_retail} < unit_cost=${unit_cost}`,
          severity: 'WARNING',
          margin_pct: ((unit_retail - unit_cost) / unit_retail) * 100
        });
      }
    };

    // === RUN VALIDATION ===

    if (scope === 'all' || scope === 'parts') {
      const parts = await base44.entities.Part.list();
      parts.forEach(validatePart);
    }

    if (scope === 'part' && part_id) {
      const [part] = await base44.entities.Part.filter({ id: part_id });
      if (part) validatePart(part);
    }

    if (scope === 'all' || scope === 'commitments') {
      const commitments = await base44.entities.PartCommitment.filter({
        commitment_status: { $nin: ['cancelled', 'closed'] }
      });
      commitments.forEach(validateCommitment);
    }

    if (scope === 'commitment' && commitment_id) {
      const [commitment] = await base44.entities.PartCommitment.filter({ id: commitment_id });
      if (commitment) validateCommitment(commitment);
    }

    // === RETURN RESULTS ===

    const pricing_status = violations.length === 0 ? 'OK' : 'VIOLATIONS';
    const errors = violations.filter(v => v.severity === 'ERROR');
    const warnings = violations.filter(v => v.severity === 'WARNING');

    return Response.json({
      pricing_status,
      violations,
      summary: {
        parts_checked,
        commitments_checked,
        violations_found: violations.length,
        errors_count: errors.length,
        warnings_count: warnings.length
      },
      errors,
      warnings,
      is_healthy: errors.length === 0
    });

  } catch (error) {
    console.error('validatePricingIntegrity error:', error);
    return Response.json({ 
      error: 'VALIDATION_FAILED',
      message: error.message 
    }, { status: 500 });
  }
});