import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Automation: When MaterialInspection is updated to 'completed',
 * update the linked MaterialInstance condition_status based on repair_required flag.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    // Only process update events for MaterialInspection
    if (event?.entity_name !== 'MaterialInspection' || event?.type !== 'update') {
      return Response.json({ skipped: true, reason: 'Not a MaterialInspection update' });
    }

    // Only process when status changes to 'completed'
    if (data?.inspection_status !== 'completed') {
      return Response.json({ skipped: true, reason: 'Inspection not completed' });
    }

    // Get the material instance ID
    const materialInstanceId = data?.material_instance_id;
    if (!materialInstanceId) {
      return Response.json({ skipped: true, reason: 'No material_instance_id linked' });
    }

    // Determine new condition status based on repair_required
    const newConditionStatus = data?.repair_required ? 'repair_required' : 'ready';

    // Update the material instance
    await base44.asServiceRole.entities.MaterialInstance.update(materialInstanceId, {
      condition_status: newConditionStatus
    });

    return Response.json({ 
      success: true, 
      material_instance_id: materialInstanceId,
      new_condition_status: newConditionStatus
    });
  } catch (error) {
    console.error('Error updating inspection status:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});