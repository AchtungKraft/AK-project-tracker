import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all parts and commitments
    const allParts = await base44.asServiceRole.entities.Part.list();
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.list();

    // Build part lookup map
    const partsMap = new Map();
    for (const p of allParts) {
      partsMap.set(p.id, p);
    }

    // Count parts with null categories
    const nullCategoryParts = allParts.filter(p => p.category === null || p.category === undefined);

    // Count parts with empty string categories
    const emptyCategoryParts = allParts.filter(p => 
      typeof p.category === 'string' && p.category.trim() === ''
    );

    // Count parts with whitespace-only categories
    const whitespaceCategoryParts = allParts.filter(p =>
      typeof p.category === 'string' && p.category.length > 0 && p.category.trim() === ''
    );

    // Count commitments that reference missing parts
    const commitmentsWithMissingPart = allCommitments.filter(c => !partsMap.has(c.part_id));

    // Count commitments whose parts have invalid categories
    const commitmentsWithInvalidCategory = allCommitments.filter(c => {
      const part = partsMap.get(c.part_id);
      if (!part) return false; // Already counted in missing
      const cat = part.category;
      return cat === null || cat === undefined || (typeof cat === 'string' && cat.trim() === '');
    });

    // Get distinct categories for analysis
    const distinctCategories = [...new Set(allParts.map(p => p.category))];

    // Determine pass/fail status
    const hasCategoryIssues = nullCategoryParts.length > 0 || emptyCategoryParts.length > 0;
    const hasOrphanCommitments = commitmentsWithMissingPart.length > 0;
    const status = (hasCategoryIssues || hasOrphanCommitments) ? 'FAIL' : 'PASS';

    const result = {
      status,
      total_parts: allParts.length,
      total_commitments: allCommitments.length,
      null_category_parts: nullCategoryParts.length,
      empty_category_parts: emptyCategoryParts.length,
      whitespace_category_parts: whitespaceCategoryParts.length,
      commitments_with_missing_part: commitmentsWithMissingPart.length,
      commitments_with_invalid_category: commitmentsWithInvalidCategory.length,
      distinct_categories: distinctCategories,
      details: {
        null_category_part_ids: nullCategoryParts.map(p => ({ id: p.id, name: p.part_name })),
        empty_category_part_ids: emptyCategoryParts.map(p => ({ id: p.id, name: p.part_name })),
        orphan_commitment_ids: commitmentsWithMissingPart.map(c => ({ id: c.id, part_id: c.part_id })),
        invalid_category_commitment_ids: commitmentsWithInvalidCategory.map(c => ({
          id: c.id,
          part_id: c.part_id,
          part_name: partsMap.get(c.part_id)?.part_name
        }))
      }
    };

    return Response.json(result);

  } catch (error) {
    console.error('Error in verifyPartCategoryIntegrity:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});