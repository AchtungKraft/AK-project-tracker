import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * validatePartPricing - PHASE 15 Pricing Mode Validator
 * 
 * Enforces HARD invariants for Part pricing_mode:
 * 
 * pricing_mode = "matrix":
 *   MUST: retail_override = null
 *   MUST: retail_matrix_price != null && > 0
 *   MUST: applied_markup_pct != null
 *   
 * pricing_mode = "manual":
 *   MUST: retail_override != null && > 0
 *   MUST: applied_markup_pct = null
 * 
 * HARD FAIL on violations - no silent corrections.
 * 
 * Input:
 *   part_data: object - part fields to validate
 * 
 * Output:
 *   { valid: true } OR { error: "PRICING_MODE_CONFLICT", violations: [...] }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { part_data } = await req.json();

    if (!part_data) {
      return Response.json({ 
        error: 'PART_DATA_REQUIRED',
        message: 'part_data object required'
      }, { status: 400 });
    }

    const violations = [];
    const pricing_mode = part_data.pricing_mode || 'matrix';
    const cost = part_data.cost ?? 0;

    // === MATRIX MODE VALIDATION ===
    if (pricing_mode === 'matrix') {
      // retail_override MUST be null
      if (part_data.retail_override !== null && part_data.retail_override !== undefined) {
        violations.push({
          code: 'MATRIX_WITH_OVERRIDE',
          message: 'pricing_mode=matrix must have retail_override=null',
          field: 'retail_override',
          current_value: part_data.retail_override
        });
      }

      // applied_markup_pct MUST exist
      if (part_data.applied_markup_pct === null || part_data.applied_markup_pct === undefined) {
        violations.push({
          code: 'MATRIX_WITHOUT_MARKUP',
          message: 'pricing_mode=matrix requires applied_markup_pct',
          field: 'applied_markup_pct',
          current_value: null
        });
      }

      // retail_matrix_price MUST exist and be positive (if cost > 0)
      if (cost > 0 && (!part_data.retail_matrix_price || part_data.retail_matrix_price <= 0)) {
        violations.push({
          code: 'MATRIX_WITHOUT_RETAIL',
          message: 'pricing_mode=matrix with cost > 0 requires retail_matrix_price > 0',
          field: 'retail_matrix_price',
          current_value: part_data.retail_matrix_price
        });
      }

      // cost MUST be > 0 for matrix pricing
      if (cost <= 0) {
        violations.push({
          code: 'MATRIX_WITHOUT_COST',
          message: 'pricing_mode=matrix requires cost > 0',
          field: 'cost',
          current_value: cost
        });
      }
    }

    // === MANUAL MODE VALIDATION ===
    if (pricing_mode === 'manual') {
      // retail_override MUST exist and be positive
      if (!part_data.retail_override || part_data.retail_override <= 0) {
        violations.push({
          code: 'MANUAL_WITHOUT_OVERRIDE',
          message: 'pricing_mode=manual requires retail_override > 0',
          field: 'retail_override',
          current_value: part_data.retail_override
        });
      }

      // applied_markup_pct MUST be null
      if (part_data.applied_markup_pct !== null && part_data.applied_markup_pct !== undefined) {
        violations.push({
          code: 'MANUAL_WITH_MARKUP',
          message: 'pricing_mode=manual must have applied_markup_pct=null',
          field: 'applied_markup_pct',
          current_value: part_data.applied_markup_pct
        });
      }
    }

    // === RETURN VALIDATION RESULT ===
    if (violations.length > 0) {
      return Response.json({
        valid: false,
        error: 'PRICING_MODE_CONFLICT',
        message: 'Part pricing validation failed - mode conflicts detected',
        pricing_mode,
        violations,
        resolution: pricing_mode === 'matrix' 
          ? 'Remove retail_override and ensure cost > 0'
          : 'Set retail_override > 0 and remove applied_markup_pct'
      }, { status: 400 });
    }

    // Compute effective retail for display
    const retail_effective = pricing_mode === 'manual' 
      ? part_data.retail_override 
      : part_data.retail_matrix_price;

    return Response.json({
      valid: true,
      pricing_mode,
      retail_effective,
      cost,
      margin_pct: retail_effective > 0 && cost > 0 
        ? ((retail_effective - cost) / retail_effective) * 100
        : null
    });

  } catch (error) {
    console.error('validatePartPricing error:', error);
    return Response.json({ 
      error: 'VALIDATION_FAILED',
      message: error.message 
    }, { status: 500 });
  }
});