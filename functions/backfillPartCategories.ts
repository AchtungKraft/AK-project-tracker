import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const DEFAULT_CATEGORY = 'Uncategorized';

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
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true; // Default to false for this function

    // Fetch all parts
    const allParts = await base44.asServiceRole.entities.Part.list();

    // Find parts with missing/empty/whitespace-only categories
    const partsNeedingBackfill = allParts.filter(p => {
      const cat = p.category;
      return cat === null || cat === undefined || (typeof cat === 'string' && cat.trim() === '');
    });

    const result = {
      dry_run: dryRun,
      scanned: allParts.length,
      needs_update: partsNeedingBackfill.length,
      updated: 0,
      details: partsNeedingBackfill.map(p => ({
        id: p.id,
        part_name: p.part_name,
        current_category: p.category
      }))
    };

    if (!dryRun) {
      for (const part of partsNeedingBackfill) {
        await base44.asServiceRole.entities.Part.update(part.id, {
          category: DEFAULT_CATEGORY
        });
        result.updated++;
      }
    }

    return Response.json(result);

  } catch (error) {
    console.error('Error in backfillPartCategories:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});