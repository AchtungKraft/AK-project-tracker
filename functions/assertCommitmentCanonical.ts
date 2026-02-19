import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * assertCommitmentCanonical - Validates commitment has canonical fields set
 * 
 * This is a guard function to be called at key flow entry points.
 * It throws if the commitment is missing required_total (the canonical quantity field).
 * 
 * Usage: Call before any supply action to ensure data integrity.
 * 
 * Returns:
 * - success: true if valid
 * - throws with LEGACY_DATA_DETECTED if invalid
 */

const LEGACY_QTY_FIELDS = [
  'qty_committed',
  'qty_reserved', 
  'qty_to_order',
  'qty_ordered',
  'qty_received',
  'qty_allocated'
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commitment_id, commitment_ids } = await req.json();
    
    // Support single or batch validation
    const idsToCheck = commitment_ids || (commitment_id ? [commitment_id] : []);
    
    if (idsToCheck.length === 0) {
      return Response.json({ 
        error: 'commitment_id or commitment_ids required' 
      }, { status: 400 });
    }

    const results = [];
    const violations = [];

    for (const id of idsToCheck) {
      const [commitment] = await base44.entities.PartCommitment.filter({ id });
      
      if (!commitment) {
        violations.push({
          commitment_id: id,
          reason_code: 'NOT_FOUND',
          message: `Commitment ${id} not found`
        });
        continue;
      }

      // Check if required_total is set (canonical field)
      const hasCanonicalRequired = commitment.required_total !== null && 
                                    commitment.required_total !== undefined;

      if (!hasCanonicalRequired) {
        // Check if legacy fields have data
        const legacyFieldsWithData = LEGACY_QTY_FIELDS.filter(f => 
          commitment[f] !== null && 
          commitment[f] !== undefined && 
          commitment[f] > 0
        );

        violations.push({
          commitment_id: id,
          reason_code: 'LEGACY_DATA_DETECTED',
          message: 'Commitment missing required_total (canonical field). Must migrate before proceeding.',
          legacy_fields_present: legacyFieldsWithData,
          suggested_action: 'Run migration or set required_total via executeSupplyAction'
        });
        continue;
      }

      // Validate canonical invariants
      const reserved = commitment.reserved_from_stock ?? 0;
      const covered_po = commitment.covered_from_po ?? 0;
      const installed = commitment.qty_installed ?? 0;
      const required = commitment.required_total ?? 0;

      const warnings = [];

      // Installed can't exceed reserved
      if (installed > reserved) {
        warnings.push({
          type: 'INSTALLED_EXCEEDS_RESERVED',
          message: `qty_installed (${installed}) > reserved_from_stock (${reserved})`
        });
      }

      // Total coverage can't exceed required
      const totalCoverage = reserved + covered_po;
      if (totalCoverage > required) {
        warnings.push({
          type: 'OVER_COVERED',
          message: `Total coverage (${totalCoverage}) > required_total (${required})`
        });
      }

      results.push({
        commitment_id: id,
        is_canonical: true,
        required_total: required,
        reserved_from_stock: reserved,
        covered_from_po: covered_po,
        qty_installed: installed,
        warnings: warnings.length > 0 ? warnings : null
      });
    }

    const allValid = violations.length === 0;
    const hasWarnings = results.some(r => r.warnings && r.warnings.length > 0);

    return Response.json({
      success: allValid,
      canonical_valid: allValid,
      has_warnings: hasWarnings,
      checked_count: idsToCheck.length,
      valid_count: results.length,
      violation_count: violations.length,
      results,
      violations,
      // If there are violations, provide a clear error for the caller
      ...(violations.length > 0 && {
        error_code: 'CANONICAL_VALIDATION_FAILED',
        error_message: `${violations.length} commitment(s) failed canonical validation. Use executeSupplyAction dispatcher for all quantity mutations.`
      })
    });

  } catch (error) {
    console.error("assertCommitmentCanonical error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});