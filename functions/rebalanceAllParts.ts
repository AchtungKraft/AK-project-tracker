import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * rebalanceAllParts - Admin function to rebalance all parts
 * 
 * Phase 9G: Iterates all parts and calls rebalancePartReservations.
 * Returns summary of parts processed and any violations found.
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

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const dry_run = body.dry_run !== false;

    // Fetch all parts
    const allParts = await base44.asServiceRole.entities.Part.list();
    
    // Fetch all commitments to find which parts have commitments
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.list();
    const partsWithCommitments = new Set(
      allCommitments
        .filter(c => c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed')
        .map(c => c.part_id)
    );

    const results = {
      parts_scanned: allParts.length,
      parts_with_commitments: partsWithCommitments.size,
      parts_processed: 0,
      parts_updated: 0,
      commitments_updated: 0,
      violations_found: 0,
      errors: [],
      details: []
    };

    // Process each part that has commitments
    for (const part of allParts) {
      if (!partsWithCommitments.has(part.id)) {
        continue;
      }

      results.parts_processed++;

      try {
        const rebalanceResult = await base44.asServiceRole.functions.invoke('rebalancePartReservations', {
          part_id: part.id,
          dry_run
        });

        const data = rebalanceResult.data;
        
        if (data.error) {
          results.violations_found++;
          results.errors.push({
            part_id: part.id,
            part_name: part.part_name,
            error: data.error
          });
        } else if (data.commitments_updated > 0) {
          results.parts_updated++;
          results.commitments_updated += data.commitments_updated;
          results.details.push({
            part_id: part.id,
            part_name: part.part_name,
            commitments_updated: data.commitments_updated,
            updates: data.updates
          });
        }
      } catch (error) {
        results.violations_found++;
        results.errors.push({
          part_id: part.id,
          part_name: part.part_name,
          error: error.message
        });
      }
    }

    return Response.json({
      success: results.violations_found === 0,
      mode: dry_run ? 'DRY_RUN' : 'EXECUTED',
      timestamp: new Date().toISOString(),
      executed_by: user.email,
      summary: {
        parts_scanned: results.parts_scanned,
        parts_with_commitments: results.parts_with_commitments,
        parts_processed: results.parts_processed,
        parts_updated: results.parts_updated,
        commitments_updated: results.commitments_updated,
        violations_found: results.violations_found
      },
      errors: results.errors,
      details: results.details,
      message: results.violations_found === 0 
        ? `Processed ${results.parts_processed} parts, updated ${results.commitments_updated} commitments`
        : `Found ${results.violations_found} violations`
    });

  } catch (error) {
    console.error("rebalanceAllParts error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});