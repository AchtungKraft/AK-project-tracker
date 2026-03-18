import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * purgeLegacyPartProjectRequirements
 * 
 * PHASE 1 - CANONICAL SUPPLY RESET
 * 
 * Hard delete ALL records from PartProjectRequirement.
 * This entity is deprecated - PartCommitment is now the ONLY authoritative source
 * for part-to-project assignment.
 * 
 * ADMIN ONLY - Requires admin privileges
 */

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
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const timestamp = new Date().toISOString();
    console.log(`🗑️ Starting PartProjectRequirement purge at ${timestamp}`);

    // Fetch all legacy requirements
    const requirements = await base44.asServiceRole.entities.PartProjectRequirement.list();
    const totalCount = requirements.length;

    console.log(`📊 Found ${totalCount} PartProjectRequirement records to delete`);

    if (totalCount === 0) {
      return Response.json({
        deleted_count: 0,
        status: 'COMPLETE',
        message: 'No PartProjectRequirement records found - already clean',
        timestamp
      });
    }

    // Delete all records
    let deletedCount = 0;
    const errors = [];

    for (const req of requirements) {
      try {
        await base44.asServiceRole.entities.PartProjectRequirement.delete(req.id);
        deletedCount++;
        
        // Log progress every 50 records
        if (deletedCount % 50 === 0) {
          console.log(`🗑️ Deleted ${deletedCount}/${totalCount} records...`);
        }
      } catch (err) {
        errors.push({ id: req.id, error: err.message });
      }
    }

    console.log(`✅ Purge complete: ${deletedCount} records deleted`);

    return Response.json({
      deleted_count: deletedCount,
      status: errors.length === 0 ? 'COMPLETE' : 'COMPLETE_WITH_ERRORS',
      total_found: totalCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp
    });

  } catch (error) {
    console.error("Purge error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});