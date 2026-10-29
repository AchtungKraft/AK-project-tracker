import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Admin-only write path for project labor billing rate and task labor classification.
// Never touches time entries, services or invoices.
const TYPES = ['UNCLASSIFIED', 'BILLABLE', 'INCLUDED_IN_SERVICE', 'NON_BILLABLE'];
const MAX_RATE = 100000;
const err = (status, error) => Response.json({ error }, { status });
const validRate = (v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_RATE);
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return err(401, 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'Only admins can change labor billing.');
    const db = base44.asServiceRole.entities;
    const { action, project_id, rate, task_ids, billing_type, service_commitment_id, rate_override } = await req.json().catch(() => ({}));
    if (typeof project_id !== 'string' || !project_id) return err(400, 'project_id is required');
    const project = (await db.Project.filter({ id: project_id }))[0];
    if (!project) return err(404, 'Project not found');
    const now = new Date().toISOString();

    if (action === 'set_project_rate') {
      if (!validRate(rate)) return err(400, 'Rate must be a non-negative number (or null to clear).');
      await db.Project.update(project_id, { labor_billing_rate: round2(rate), labor_rate_set_by: user.email, labor_rate_set_at: now });
      return Response.json({ success: true, labor_billing_rate: round2(rate) });
    }

    if (action === 'classify_tasks') {
      if (!Array.isArray(task_ids) || !task_ids.length || task_ids.length > 500) return err(400, 'task_ids must be 1–500 ids');
      if (!TYPES.includes(billing_type)) return err(400, 'Invalid billing_type');
      if (rate_override !== undefined && !validRate(rate_override)) return err(400, 'Rate override must be a non-negative number (or null to clear).');
      const tasks = await db.Task.filter({ id: { $in: task_ids } });
      if (tasks.length !== new Set(task_ids).size || tasks.some((t) => t.project_id !== project_id)) return err(400, 'Every task must belong to this project.');
      let svcId = null;
      if (billing_type === 'INCLUDED_IN_SERVICE') {
        if (typeof service_commitment_id !== 'string' || !service_commitment_id) return err(400, 'Select the service that includes this labor.');
        const svc = (await db.ServiceCommitment.filter({ id: service_commitment_id }))[0];
        if (!svc || svc.project_id !== project_id) return err(400, 'Service must belong to this project.');
        svcId = svc.id;
      }
      const patch = { labor_billing_type: billing_type, labor_service_commitment_id: svcId, labor_classified_by: user.email, labor_classified_at: now };
      if (rate_override !== undefined) patch.labor_rate_override = round2(rate_override);
      await db.Task.bulkUpdate(tasks.map((t) => ({ id: t.id, ...patch })));
      return Response.json({ success: true, updated: tasks.length });
    }

    return err(400, 'Unknown action');
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});