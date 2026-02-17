import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * verifyPartCategoryIntegrity - Check all Parts have valid category
 * 
 * Returns PASS if all parts have non-empty category
 * Returns FAIL if any parts have null/undefined/empty category
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

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parts = await base44.asServiceRole.entities.Part.list();

    const invalid = parts.filter(p =>
      !p.category ||
      typeof p.category !== 'string' ||
      p.category.trim() === ''
    );

    const invalidSamples = invalid.slice(0, 10).map(p => ({
      id: p.id,
      part_name: p.part_name,
      category: p.category,
      is_archived: p.is_archived
    }));

    return Response.json({
      status: invalid.length === 0 ? 'PASS' : 'FAIL',
      parts_scanned: parts.length,
      invalid_parts: invalid.length,
      execution_safe: invalid.length === 0,
      invalid_samples: invalid.length > 0 ? invalidSamples : undefined,
      repair_action: invalid.length > 0 
        ? "base44.functions.invoke('backfillPartCategories', { dry_run: false })"
        : undefined
    });

  } catch (error) {
    console.error('verifyPartCategoryIntegrity error:', error);
    return Response.json({
      status: 'ERROR',
      error: error.message
    }, { status: 500 });
  }
});