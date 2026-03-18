/**
 * verifyTestLifecycleResidue - Check for remaining TEST_PART_LIFECYCLE records (v2)
 * 
 * Returns counts of remaining test data across all relevant entities.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
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

    const body = await req.json().catch(() => ({}));
    const { include_quarantined = false } = body;

    const TEST_MARKER = 'TEST_PART_LIFECYCLE';

    // =========================================================================
    // Check Parts
    // =========================================================================
    const allParts = await base44.asServiceRole.entities.Part.list();
    const matchingParts = allParts.filter(p => {
      if (!include_quarantined && p.is_quarantined) return false;
      return p.part_name?.includes(TEST_MARKER) || p.vendor_part_number?.includes(TEST_MARKER);
    });

    const strictMatchParts = matchingParts.filter(p => p.part_name?.startsWith(TEST_MARKER));
    const containsMatchParts = matchingParts.filter(p => 
      !p.part_name?.startsWith(TEST_MARKER) && 
      (p.part_name?.includes(TEST_MARKER) || p.vendor_part_number?.includes(TEST_MARKER))
    );

    // Get part IDs for cascade check
    const matchingPartIds = new Set(matchingParts.map(p => p.id));

    // =========================================================================
    // Check Commitments
    // =========================================================================
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.list();
    const matchingCommitments = allCommitments.filter(c => {
      if (!include_quarantined && c.is_quarantined) return false;
      return matchingPartIds.has(c.part_id);
    });

    const commitmentIds = new Set(matchingCommitments.map(c => c.id));

    // =========================================================================
    // Check Line Items
    // =========================================================================
    const allLineItems = await base44.asServiceRole.entities.PartPurchaseLineItem.list();
    const matchingLineItems = allLineItems.filter(li => {
      if (!include_quarantined && li.is_quarantined) return false;
      return commitmentIds.has(li.commitment_id) || matchingPartIds.has(li.part_id);
    });

    // =========================================================================
    // Check Requirements
    // =========================================================================
    const allRequirements = await base44.asServiceRole.entities.PartProjectRequirement.list();
    const matchingRequirements = allRequirements.filter(r => {
      if (!include_quarantined && r.is_quarantined) return false;
      return matchingPartIds.has(r.part_id);
    });

    // =========================================================================
    // Check Inventory
    // =========================================================================
    const allInventory = await base44.asServiceRole.entities.InventoryItem.list();
    const matchingInventory = allInventory.filter(i => {
      if (!include_quarantined && i.is_quarantined) return false;
      return matchingPartIds.has(i.part_id);
    });

    // =========================================================================
    // Check Installed Parts
    // =========================================================================
    const allInstalled = await base44.asServiceRole.entities.InstalledPart.list();
    const matchingInstalled = allInstalled.filter(ip => {
      if (!include_quarantined && ip.is_quarantined) return false;
      return commitmentIds.has(ip.commitment_id);
    });

    // =========================================================================
    // Check Pool Allocations
    // =========================================================================
    const allAllocations = await base44.asServiceRole.entities.PoolAllocation.list();
    const matchingAllocations = allAllocations.filter(a => {
      if (!include_quarantined && a.is_reversed) return false;
      return commitmentIds.has(a.commitment_id);
    });

    // =========================================================================
    // Build result
    // =========================================================================
    const result = {
      timestamp: new Date().toISOString(),
      include_quarantined,
      test_marker: TEST_MARKER,
      residue_found: false,
      counts: {
        parts_strict: strictMatchParts.length,
        parts_contains: containsMatchParts.length,
        parts_total: matchingParts.length,
        commitments: matchingCommitments.length,
        line_items: matchingLineItems.length,
        requirements: matchingRequirements.length,
        inventory_items: matchingInventory.length,
        installed_parts: matchingInstalled.length,
        pool_allocations: matchingAllocations.length
      },
      samples: {
        parts: matchingParts.slice(0, 5).map(p => ({
          id: p.id,
          part_name: p.part_name,
          is_quarantined: p.is_quarantined || false
        })),
        commitments: matchingCommitments.slice(0, 5).map(c => ({
          id: c.id,
          part_id: c.part_id,
          is_quarantined: c.is_quarantined || false
        }))
      }
    };

    result.residue_found = 
      result.counts.parts_total > 0 ||
      result.counts.commitments > 0 ||
      result.counts.line_items > 0 ||
      result.counts.requirements > 0 ||
      result.counts.inventory_items > 0 ||
      result.counts.installed_parts > 0;

    return Response.json(result);

  } catch (error) {
    console.error('verifyTestLifecycleResidue error:', error);
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});