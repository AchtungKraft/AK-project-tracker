import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Migration function to backfill part_category_id from category string names.
 * Matches existing category strings to PartCategory records and populates the ID reference.
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
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // Default to dry run for safety

    // Fetch all parts and categories
    const [allParts, allCategories] = await Promise.all([
      base44.asServiceRole.entities.Part.list(),
      base44.asServiceRole.entities.PartCategory.list()
    ]);

    // Build category name -> id map (case-insensitive)
    const categoryNameToId = {};
    for (const cat of allCategories) {
      categoryNameToId[cat.name.toLowerCase().trim()] = cat.id;
    }

    // Find parts that need migration (have category string but no part_category_id)
    const partsNeedingMigration = allParts.filter(p => {
      // Has a category string but no part_category_id
      return p.category && typeof p.category === 'string' && p.category.trim() !== '' && !p.part_category_id;
    });

    const result = {
      dry_run: dryRun,
      scanned: allParts.length,
      categories_found: allCategories.length,
      needs_migration: partsNeedingMigration.length,
      migrated: 0,
      not_matched: [],
      details: []
    };

    for (const part of partsNeedingMigration) {
      const categoryName = part.category.toLowerCase().trim();
      const matchedCategoryId = categoryNameToId[categoryName];

      if (matchedCategoryId) {
        result.details.push({
          part_id: part.id,
          part_name: part.part_name,
          category_string: part.category,
          matched_category_id: matchedCategoryId,
          status: 'matched'
        });

        if (!dryRun) {
          await base44.asServiceRole.entities.Part.update(part.id, {
            part_category_id: matchedCategoryId
          });
          result.migrated++;
        }
      } else {
        result.not_matched.push({
          part_id: part.id,
          part_name: part.part_name,
          category_string: part.category
        });
        result.details.push({
          part_id: part.id,
          part_name: part.part_name,
          category_string: part.category,
          matched_category_id: null,
          status: 'no_match'
        });
      }
    }

    // Also report parts that already have part_category_id
    const alreadyMigrated = allParts.filter(p => p.part_category_id);
    result.already_have_id = alreadyMigrated.length;

    return Response.json(result);

  } catch (error) {
    console.error('Error in migratePartCategoryIds:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});