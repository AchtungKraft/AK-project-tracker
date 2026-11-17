import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * rebalanceAllParts - Admin function to rebalance all parts
 *
 * Delegates each part to rebalancePartReservations so bulk and single-part standalone rebalancing
 * share one allocation rule (including the AK STOCK holding rule) instead of a parallel copy.
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
    const timestamp = new Date().toISOString();

    const [allParts, allCommitments] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartCommitment.list(),
    ]);

    const partIds = [...new Set(allCommitments
      .filter(c => c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed')
      .map(c => c.part_id))];

    const results = {
      parts_scanned: allParts.length,
      parts_with_commitments: partIds.length,
      parts_processed: 0,
      parts_updated: 0,
      commitments_updated: 0,
      violations_found: 0,
      errors: [],
      details: []
    };

    for (const partId of partIds) {
      const part = allParts.find(p => p.id === partId);
      if (!part) {
        results.errors.push({ part_id: partId, error: 'Part not found' });
        results.violations_found++;
        continue;
      }
      results.parts_processed++;
      try {
        const res = await base44.asServiceRole.functions.invoke('rebalancePartReservations', { part_id: partId, dry_run });
        const updates = res.data?.updates || [];
        if (updates.length > 0) {
          if (!dry_run) { results.parts_updated++; results.commitments_updated += updates.length; }
          results.details.push({ part_id: partId, part_name: part.part_name, commitments_updated: updates.length, updates });
        }
      } catch (err) {
        results.violations_found++;
        results.errors.push({ part_id: partId, part_name: part.part_name, error: err.response?.data?.error || err.message });
      }
    }

    return Response.json({
      success: results.violations_found === 0,
      mode: dry_run ? 'DRY_RUN' : 'EXECUTED',
      timestamp,
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