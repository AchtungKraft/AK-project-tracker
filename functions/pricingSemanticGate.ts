import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await req.json();
    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Fetch commitments for this project
    const commitments = await base44.entities.PartCommitment.filter({ project_id: projectId });
    
    // Get unique part IDs
    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    
    // Fetch all parts
    const allParts = await base44.entities.Part.filter({});
    const partsMap = {};
    for (const p of allParts) {
      partsMap[p.id] = p;
    }

    const failingCommitments = [];
    const failingPartsMap = {};

    for (const c of commitments) {
      const part = partsMap[c.part_id];
      const issues = [];

      // Check commitment-level issues
      if (c.unit_retail_snapshot === null || c.unit_retail_snapshot === undefined) {
        issues.push('MISSING_UNIT_RETAIL_SNAPSHOT');
      }
      if (c.unit_cost_snapshot === null || c.unit_cost_snapshot === undefined) {
        issues.push('MISSING_UNIT_COST_SNAPSHOT');
      }
      if (c.unit_retail_snapshot === 0 && c.required_total > 0) {
        issues.push('ZERO_RETAIL_WITH_QTY');
      }

      // Check part-level pricing integrity
      if (part) {
        const pricingMode = part.pricing_mode || 'matrix';
        
        if (pricingMode === 'manual') {
          if (part.retail_override === null || part.retail_override === undefined) {
            issues.push('MANUAL_MODE_MISSING_OVERRIDE');
          }
        } else if (pricingMode === 'matrix') {
          if (part.retail_matrix_price === null || part.retail_matrix_price === undefined) {
            issues.push('MATRIX_MODE_MISSING_MATRIX_PRICE');
          }
          if (part.applied_markup_pct === null || part.applied_markup_pct === undefined) {
            issues.push('MATRIX_MODE_MISSING_MARKUP');
          }
        }

        if (part.cost === null || part.cost === undefined) {
          issues.push('MISSING_COST');
        }

        // Track failing parts
        if (issues.length > 0 && !failingPartsMap[part.id]) {
          const partIssues = [];
          if (pricingMode === 'manual' && (part.retail_override === null || part.retail_override === undefined)) {
            partIssues.push('MANUAL_MODE_MISSING_OVERRIDE');
          }
          if (pricingMode === 'matrix' && (part.retail_matrix_price === null || part.retail_matrix_price === undefined)) {
            partIssues.push('MATRIX_MODE_MISSING_MATRIX_PRICE');
          }
          if (pricingMode === 'matrix' && (part.applied_markup_pct === null || part.applied_markup_pct === undefined)) {
            partIssues.push('MATRIX_MODE_MISSING_MARKUP');
          }
          if (part.cost === null || part.cost === undefined) {
            partIssues.push('MISSING_COST');
          }
          
          if (partIssues.length > 0) {
            failingPartsMap[part.id] = {
              part_id: part.id,
              part_name: part.part_name,
              pricing_mode: pricingMode,
              cost: part.cost,
              retail_override: part.retail_override,
              retail_matrix_price: part.retail_matrix_price,
              applied_markup_pct: part.applied_markup_pct,
              issue_reason: partIssues.join(', '),
            };
          }
        }
      } else {
        issues.push('PART_NOT_FOUND');
      }

      if (issues.length > 0) {
        failingCommitments.push({
          commitment_id: c.id,
          part_id: c.part_id,
          part_name: part?.part_name || 'Unknown',
          pricing_mode: part?.pricing_mode || 'unknown',
          cost: part?.cost,
          retail_override: part?.retail_override,
          retail_matrix_price: part?.retail_matrix_price,
          applied_markup_pct: part?.applied_markup_pct,
          unit_retail_snapshot: c.unit_retail_snapshot,
          unit_cost_snapshot: c.unit_cost_snapshot,
          required_total: c.required_total,
          issue_reason: issues.join(', '),
        });
      }
    }

    const failingParts = Object.values(failingPartsMap);

    return Response.json({
      failing_commitments: failingCommitments,
      failing_parts: failingParts,
      total_failures: failingCommitments.length + failingParts.length,
      summary: {
        commitments_checked: commitments.length,
        commitments_failing: failingCommitments.length,
        parts_failing: failingParts.length,
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});