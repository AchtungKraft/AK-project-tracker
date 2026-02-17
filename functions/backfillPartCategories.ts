import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * backfillPartCategories - Backfill null/empty categories with "Uncategorized"
 * 
 * Usage:
 *   dry_run=true  - Preview what would be updated
 *   dry_run=false - Actually update the records
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
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
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run !== false; // Default to dry_run=true for safety

    const parts = await base44.asServiceRole.entities.Part.list();
    
    const partsToUpdate = [];
    
    for (const part of parts) {
      const category = part.category;
      
      // Check if category is null, undefined, or empty string
      if (!category || (typeof category === 'string' && category.trim() === '')) {
        partsToUpdate.push({
          id: part.id,
          part_name: part.part_name,
          current_category: category,
          new_category: 'Uncategorized'
        });
      }
    }

    // Perform updates if not dry run
    let updated = 0;
    const errors = [];

    if (!dry_run) {
      for (const item of partsToUpdate) {
        try {
          await base44.asServiceRole.entities.Part.update(item.id, {
            category: 'Uncategorized'
          });
          updated++;
        } catch (err) {
          errors.push({
            part_id: item.id,
            part_name: item.part_name,
            error: err.message
          });
        }
      }
    }

    return Response.json({
      status: 'OK',
      dry_run,
      parts_scanned: parts.length,
      parts_needing_update: partsToUpdate.length,
      parts_updated: dry_run ? 0 : updated,
      errors: errors.length > 0 ? errors : undefined,
      sample_updates: partsToUpdate.slice(0, 10),
      message: dry_run 
        ? `Found ${partsToUpdate.length} parts with null/empty category. Run with dry_run=false to update.`
        : `Updated ${updated} of ${partsToUpdate.length} parts to category="Uncategorized".`
    });

  } catch (error) {
    console.error('backfillPartCategories error:', error);
    return Response.json({
      status: 'ERROR',
      error: error.message
    }, { status: 500 });
  }
});