import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TEST_MARKER = 'TEST_PART_LIFECYCLE';

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
    const dryRun = body.dry_run !== false; // Default to true for safety

    // Find all test parts
    const allParts = await base44.asServiceRole.entities.Part.list();
    const testParts = allParts.filter(p => 
      p.part_name && p.part_name.includes(TEST_MARKER)
    );
    const testPartIds = new Set(testParts.map(p => p.id));

    // Find related commitments
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.list();
    const relatedCommitments = allCommitments.filter(c => testPartIds.has(c.part_id));

    // Find related line items
    const allLineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.list();
    const relatedLineItems = allLineItems.filter(li => testPartIds.has(li.part_id));

    // Find related requirements
    const allRequirements = await base44.asServiceRole.entities.PartProjectRequirement.list();
    const relatedRequirements = allRequirements.filter(r => testPartIds.has(r.part_id));

    // Find related build assignments
    const allBuildAssignments = await base44.asServiceRole.entities.PartBuildAssignment.list();
    const relatedBuildAssignments = allBuildAssignments.filter(ba => testPartIds.has(ba.part_id));

    const result = {
      dry_run: dryRun,
      parts_found: testParts.length,
      commitments_found: relatedCommitments.length,
      line_items_found: relatedLineItems.length,
      requirements_found: relatedRequirements.length,
      build_assignments_found: relatedBuildAssignments.length,
      deleted: false,
      details: {
        part_ids: testParts.map(p => ({ id: p.id, name: p.part_name })),
        commitment_ids: relatedCommitments.map(c => c.id),
        line_item_ids: relatedLineItems.map(li => li.id),
        requirement_ids: relatedRequirements.map(r => r.id),
        build_assignment_ids: relatedBuildAssignments.map(ba => ba.id)
      }
    };

    if (!dryRun) {
      // Delete in dependency order: line items, commitments, requirements, build assignments, then parts
      for (const li of relatedLineItems) {
        await base44.asServiceRole.entities.PartPurchaseLineItem.delete(li.id);
      }

      for (const c of relatedCommitments) {
        await base44.asServiceRole.entities.PartCommitment.delete(c.id);
      }

      for (const r of relatedRequirements) {
        await base44.asServiceRole.entities.PartProjectRequirement.delete(r.id);
      }

      for (const ba of relatedBuildAssignments) {
        await base44.asServiceRole.entities.PartBuildAssignment.delete(ba.id);
      }

      for (const p of testParts) {
        await base44.asServiceRole.entities.Part.delete(p.id);
      }

      result.deleted = true;
    }

    return Response.json(result);

  } catch (error) {
    console.error('Error in purgeTestLifecycleParts:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});