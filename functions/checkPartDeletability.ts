import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Check if a part can be deleted (vs must be archived)
 * Returns usage data and deletion eligibility
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { part_id } = await req.json();

    if (!part_id) {
      return Response.json({ error: 'part_id is required' }, { status: 400 });
    }

    // Check for usage across various entities
    const [
      purchaseLineItems,
      commitments,
      installedParts,
      taskPartLinks,
      inventoryItems,
    ] = await Promise.all([
      base44.asServiceRole.entities.PartPurchaseLineItem.filter({ part_id }),
      base44.asServiceRole.entities.PartCommitment.filter({ part_id }),
      base44.asServiceRole.entities.InstalledPart.filter({ part_id }),
      base44.asServiceRole.entities.TaskPartLink.filter({ part_id }),
      base44.asServiceRole.entities.InventoryItem.filter({ part_id }),
    ]);

    // Calculate total inventory quantity
    const totalInventoryQty = inventoryItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

    const usageData = {
      purchaseLineItemCount: purchaseLineItems.length,
      commitmentCount: commitments.length,
      installCount: installedParts.length,
      taskLinkCount: taskPartLinks.length,
      inventoryQty: totalInventoryQty,
    };

    // Part can only be deleted if it has no usage
    const canDelete = 
      usageData.purchaseLineItemCount === 0 &&
      usageData.commitmentCount === 0 &&
      usageData.installCount === 0 &&
      usageData.taskLinkCount === 0 &&
      usageData.inventoryQty === 0;

    const reasons = [];
    if (usageData.purchaseLineItemCount > 0) {
      reasons.push(`${usageData.purchaseLineItemCount} purchase order line item(s)`);
    }
    if (usageData.commitmentCount > 0) {
      reasons.push(`${usageData.commitmentCount} commitment(s)`);
    }
    if (usageData.installCount > 0) {
      reasons.push(`${usageData.installCount} installation record(s)`);
    }
    if (usageData.taskLinkCount > 0) {
      reasons.push(`${usageData.taskLinkCount} task link(s)`);
    }
    if (usageData.inventoryQty > 0) {
      reasons.push(`${usageData.inventoryQty} unit(s) in inventory`);
    }

    return Response.json({
      part_id,
      canDelete,
      mustArchive: !canDelete,
      usageData,
      reasons,
      message: canDelete 
        ? 'Part can be safely deleted' 
        : `Part cannot be deleted because it has: ${reasons.join(', ')}. Please archive instead.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});