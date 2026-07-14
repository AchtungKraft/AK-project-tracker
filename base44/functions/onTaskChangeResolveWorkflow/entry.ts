import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Event-driven workflow recalculation.
 * Triggered by entity automation on Task create/update/delete.
 * Only resolves if the task's project has been initialized (has operational_state data).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { event, data, old_data } = body;
    if (!event || !data) {
      return Response.json({ skipped: true, reason: 'No event data' });
    }

    const projectId = data?.project_id || old_data?.project_id;
    if (!projectId) {
      return Response.json({ skipped: true, reason: 'No project_id on task' });
    }

    // Determine if this change could affect workflow state
    const workflowFields = [
      'status_id', 'dependencies', 'manual_override',
      'requires_customer_approval', 'customer_approval_request_id',
      'requires_vendor_work', 'vendor_service_commitment_id',
      'kanban_bucket_id', 'is_phase_required',
    ];

    if (event.type === 'update') {
      // Only resolve if a workflow-relevant field changed
      const changed = workflowFields.some(f => {
        const oldVal = JSON.stringify(old_data?.[f] ?? null);
        const newVal = JSON.stringify(data?.[f] ?? null);
        return oldVal !== newVal;
      });
      if (!changed) {
        return Response.json({ skipped: true, reason: 'No workflow-relevant fields changed' });
      }
    }

    // Check if project has been initialized (avoid resolving uninitiated projects)
    const sampleTasks = await base44.asServiceRole.entities.Task.filter({ project_id: projectId }, '-created_date', 3);
    const hasState = sampleTasks.some(t => t.operational_state);
    if (!hasState && event.type !== 'delete') {
      return Response.json({ skipped: true, reason: 'Project workflow not yet initialized' });
    }

    // Resolve the project workflow
    const result = await base44.asServiceRole.functions.invoke('resolveProjectWorkflow', {
      project_id: projectId,
      mode: 'resolve',
    });

    return Response.json({
      resolved: true,
      projectId,
      trigger: event.type,
      taskId: event.entity_id,
      tasksChanged: result.data?.summary?.tasksChanged || 0,
      tasksUnchanged: result.data?.summary?.tasksUnchanged || 0,
    });
  } catch (error) {
    console.error('onTaskChangeResolveWorkflow error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});