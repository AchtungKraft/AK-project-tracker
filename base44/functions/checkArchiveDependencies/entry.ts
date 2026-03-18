import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CHECK ARCHIVE DEPENDENCIES
 * 
 * Warns user if archived part still has:
 * - Remaining inventory
 * - Open commitments
 * - Pending installs
 * 
 * Returns: { can_archive: boolean, warnings: [], dependencies: {} }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { part_id } = payload;
    
    if (!part_id) {
      return Response.json({ error: 'part_id is required' }, { status: 400 });
    }

    if (!part_id) {
      return Response.json({ error: 'part_id is required' }, { status: 400 });
    }

    // Fetch part
    const parts = await base44.asServiceRole.entities.Part.filter({ id: part_id });
    const part = parts[0];
    
    if (!part) {
      return Response.json({ error: 'Part not found' }, { status: 404 });
    }

    const warnings = [];
    const dependencies = {
      inventory_items: [],
      open_commitments: [],
      pending_task_links: [],
      total_inventory_qty: 0,
    };

    // Check inventory
    const inventoryItems = await base44.asServiceRole.entities.InventoryItem.filter({ part_id });
    const itemsWithQty = inventoryItems.filter(i => (i.quantity_on_hand || 0) > 0);
    
    if (itemsWithQty.length > 0) {
      const totalQty = itemsWithQty.reduce((sum, i) => sum + (i.quantity_on_hand || 0), 0);
      dependencies.inventory_items = itemsWithQty.map(i => ({
        id: i.id,
        location_id: i.location_id,
        quantity_on_hand: i.quantity_on_hand,
      }));
      dependencies.total_inventory_qty = totalQty;
      warnings.push({
        type: 'inventory',
        severity: 'warning',
        message: `Part has ${totalQty} units remaining in inventory across ${itemsWithQty.length} location(s)`,
      });
    }

    // Check open commitments
    const commitments = await base44.asServiceRole.entities.PartCommitment.filter({ part_id });
    const openCommitments = commitments.filter(c => 
      !['cancelled', 'installed', 'closed'].includes(c.commitment_status)
    );
    
    if (openCommitments.length > 0) {
      dependencies.open_commitments = openCommitments.map(c => ({
        id: c.id,
        project_id: c.project_id,
        qty_committed: c.qty_committed,
        qty_installed: c.qty_installed,
        commitment_status: c.commitment_status,
      }));
      warnings.push({
        type: 'commitments',
        severity: 'warning',
        message: `Part has ${openCommitments.length} open commitment(s) not yet fully installed`,
      });
    }

    // Check pending task links
    const taskLinks = await base44.asServiceRole.entities.TaskPartLink.filter({ part_id });
    const pendingLinks = taskLinks.filter(l => l.install_status !== 'complete');
    
    if (pendingLinks.length > 0) {
      dependencies.pending_task_links = pendingLinks.map(l => ({
        id: l.id,
        task_id: l.task_id,
        qty_allocated: l.qty_allocated,
        qty_installed: l.qty_installed,
        install_status: l.install_status,
      }));
      warnings.push({
        type: 'task_links',
        severity: 'warning',
        message: `Part has ${pendingLinks.length} pending task link(s) awaiting installation`,
      });
    }

    // Determine if archiving is recommended
    const hasBlockingDependencies = warnings.some(w => w.severity === 'error');
    const can_archive = !hasBlockingDependencies;

    return Response.json({
      can_archive,
      has_warnings: warnings.length > 0,
      warnings,
      dependencies,
      part_id,
      part_name: part.part_name,
      is_already_archived: part.is_archived || false,
    });

  } catch (error) {
    console.error('checkArchiveDependencies error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});