import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const DONE_STATUS_ID = '6913f57422230d8c7ee2ef54';
const IN_PROGRESS_STATUS_ID = '6913f57422230d8c7ee2ef52';
const REVIEW_STATUS_ID = '6913f57422230d8c7ee2ef53';
const QA_STATUS_ID = '6914ae57ed93061844fb7cc0';

const S = {
  NOT_STARTED: 'NOT_STARTED', READY: 'READY', IN_PROGRESS: 'IN_PROGRESS',
  WAITING_ON_PARTS: 'WAITING_ON_PARTS', WAITING_ON_VENDOR: 'WAITING_ON_VENDOR',
  WAITING_ON_CUSTOMER: 'WAITING_ON_CUSTOMER', BLOCKED: 'BLOCKED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED',
};

function detectCycles(taskMap) {
  const visited = new Set();
  const inStack = new Set();
  const cycles = [];
  function dfs(id, path) {
    if (inStack.has(id)) { cycles.push([...path, id]); return; }
    if (visited.has(id)) return;
    visited.add(id); inStack.add(id);
    const t = taskMap.get(id);
    if (t?.dependencies) for (const d of t.dependencies) dfs(d, [...path, id]);
    inStack.delete(id);
  }
  for (const id of taskMap.keys()) dfs(id, []);
  return cycles;
}

function resolveOne(task, taskMap, bucketMap, phaseOrder, partAvail, scMap, approvalMap) {
  const reasons = [];

  if (task.status_id === DONE_STATUS_ID)
    return { state: S.COMPLETED, reasons, isActionable: false };

  // Manual override
  if (task.manual_override) {
    const mo = task.manual_override;
    if (mo.type === 'HOLD') {
      reasons.push({ type: 'MANUAL_HOLD', label: 'On hold: ' + (mo.reason || 'No reason') });
      return { state: S.BLOCKED, reasons, isActionable: false, isOverride: true };
    }
    if (mo.type === 'FORCE_BLOCKED') {
      reasons.push({ type: 'MANUAL_HOLD', label: 'Force blocked: ' + (mo.reason || 'No reason') });
      return { state: S.BLOCKED, reasons, isActionable: false, isOverride: true };
    }
  }

  const isInProgress = task.status_id === IN_PROGRESS_STATUS_ID;
  const isReview = task.status_id === REVIEW_STATUS_ID || task.status_id === QA_STATUS_ID;

  // Dependencies
  if (task.dependencies?.length) {
    for (const depId of task.dependencies) {
      const dep = taskMap.get(depId);
      if (!dep) { reasons.push({ type: 'DATA_CONFIGURATION', label: 'Unknown dependency', relatedTaskId: depId }); continue; }
      if (dep.status_id !== DONE_STATUS_ID)
        reasons.push({ type: 'DEPENDENCY', label: 'Blocked by ' + dep.name, relatedTaskId: depId });
    }
  }

  // Phase eligibility
  const bucket = task.kanban_bucket_id ? bucketMap.get(task.kanban_bucket_id) : null;
  if (bucket) {
    if (bucket.progression_mode === 'manual' && !bucket.is_active)
      reasons.push({ type: 'PHASE', label: 'Phase "' + bucket.name + '" not active' });
    if (bucket.progression_mode === 'sequential') {
      for (const prev of phaseOrder) {
        if (prev.project_id === bucket.project_id && prev.order < bucket.order && prev.is_required !== false && prev._status !== 'completed')
          reasons.push({ type: 'PHASE', label: 'Waiting for phase "' + prev.name + '"' });
      }
    }
  }

  // Parts
  if (partAvail[task.id]) {
    for (const p of partAvail[task.id]) {
      if (p.status === 'unavailable')
        reasons.push({ type: 'PART', label: 'Waiting for ' + p.partName, relatedEntityId: p.partId });
      else if (p.status === 'ordered')
        reasons.push({ type: 'PURCHASE_ORDER', label: p.partName + ' on order', relatedEntityId: p.commitmentId });
    }
  }

  // Vendor
  if (task.requires_vendor_work && task.vendor_service_commitment_id) {
    const sc = scMap.get(task.vendor_service_commitment_id);
    if (sc && sc.status !== 'completed' && sc.status !== 'billed')
      reasons.push({ type: 'VENDOR', label: 'Waiting for ' + (sc.description || 'vendor work'), relatedEntityId: sc.id });
  }

  // Customer approval
  if (task.requires_customer_approval && task.customer_approval_request_id) {
    const r = approvalMap.get(task.customer_approval_request_id);
    if (r && (r.status === 'posted' || r.status === 'draft'))
      reasons.push({ type: 'CUSTOMER_APPROVAL', label: 'Waiting for customer: ' + r.title, relatedEntityId: r.id });
    if (r && r.status === 'changes_requested')
      reasons.push({ type: 'CUSTOMER_APPROVAL', label: 'Changes requested: ' + r.title, relatedEntityId: r.id });
  }

  // Force ready override
  if (task.manual_override?.type === 'FORCE_READY')
    return { state: S.READY, reasons, isActionable: true, isOverride: true };

  const hasDep = reasons.some(r => r.type === 'DEPENDENCY');
  const hasPart = reasons.some(r => r.type === 'PART' || r.type === 'PURCHASE_ORDER');
  const hasVendor = reasons.some(r => r.type === 'VENDOR');
  const hasCust = reasons.some(r => r.type === 'CUSTOMER_APPROVAL');
  const hasPhase = reasons.some(r => r.type === 'PHASE');
  const hasAny = reasons.length > 0;

  if (isInProgress) {
    if (hasCust) return { state: S.WAITING_ON_CUSTOMER, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasVendor) return { state: S.WAITING_ON_VENDOR, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasPart) return { state: S.WAITING_ON_PARTS, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasDep || hasPhase) return { state: S.BLOCKED, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasAny) return { state: S.BLOCKED, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    return { state: S.IN_PROGRESS, reasons, isActionable: true };
  }
  if (isReview) return { state: S.REVIEW_REQUIRED, reasons, isActionable: true };

  if (hasCust) return { state: S.WAITING_ON_CUSTOMER, reasons, isActionable: false };
  if (hasVendor) return { state: S.WAITING_ON_VENDOR, reasons, isActionable: false };
  if (hasPart) return { state: S.WAITING_ON_PARTS, reasons, isActionable: false };
  if (hasDep || hasPhase || hasAny) return { state: S.BLOCKED, reasons, isActionable: false };
  return { state: S.READY, reasons, isActionable: true };
}

function phaseRollup(bucket, tasks) {
  const pt = tasks.filter(t => t.kanban_bucket_id === bucket.id);
  const req = pt.filter(t => t.is_phase_required !== false);
  const done = pt.filter(t => t.status_id === DONE_STATUS_ID);
  const ready = pt.filter(t => t._rs?.state === S.READY);
  const ip = pt.filter(t => t._rs?.state === S.IN_PROGRESS);
  const blocked = pt.filter(t => [S.BLOCKED, S.WAITING_ON_PARTS, S.WAITING_ON_VENDOR, S.WAITING_ON_CUSTOMER].includes(t._rs?.state));
  const wp = pt.filter(t => t._rs?.state === S.WAITING_ON_PARTS);
  const wv = pt.filter(t => t._rs?.state === S.WAITING_ON_VENDOR);
  const wc = pt.filter(t => t._rs?.state === S.WAITING_ON_CUSTOMER);
  const est = pt.reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const act = pt.reduce((s, t) => s + (t.actual_hours || 0), 0);
  const rem = pt.filter(t => t.status_id !== DONE_STATUS_ID).reduce((s, t) => s + Math.max((t.estimated_hours || 0) - (t.actual_hours || 0), 0), 0);
  const reqDone = req.filter(t => t.status_id === DONE_STATUS_ID).length;
  const pct = req.length > 0 ? Math.round((reqDone / req.length) * 100) : 0;

  let status = 'not_started';
  if (pt.length === 0) status = 'not_configured';
  else if (req.length > 0 && reqDone === req.length) status = 'completed';
  else if (ip.length > 0 || done.length > 0) status = 'in_progress';

  return {
    totalTaskCount: pt.length, requiredTaskCount: req.length, completedTaskCount: done.length,
    readyTaskCount: ready.length, inProgressTaskCount: ip.length, blockedTaskCount: blocked.length,
    waitingOnPartsCount: wp.length, waitingOnVendorCount: wv.length, waitingOnCustomerCount: wc.length,
    estimatedHours: est, actualHours: act, remainingHours: rem, completionPercent: pct, phaseStatus: status,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const project_id = body.project_id;
    const dry_run = body.dry_run || false;
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const [tasks, buckets, tpLinks, scs, fbReqs, commits, parts] = await Promise.all([
      base44.asServiceRole.entities.Task.filter({ project_id }),
      base44.asServiceRole.entities.ProjectKanbanBucket.filter({ project_id }),
      base44.asServiceRole.entities.TaskPartLink.filter({ project_id }),
      base44.asServiceRole.entities.ServiceCommitment.filter({ project_id }),
      base44.asServiceRole.entities.ClientFeedbackRequest.filter({ project_id }),
      base44.asServiceRole.entities.PartCommitment.filter({ project_id }),
      base44.asServiceRole.entities.Part.list('-created_date', 500),
    ]);

    const taskMap = new Map(); tasks.forEach(t => taskMap.set(t.id, t));
    const bucketMap = new Map(); buckets.forEach(b => bucketMap.set(b.id, b));
    const scMap = new Map(); scs.forEach(s => scMap.set(s.id, s));
    const approvalMap = new Map(); fbReqs.forEach(r => approvalMap.set(r.id, r));
    const partMap = new Map(); parts.forEach(p => partMap.set(p.id, p));
    const commitMap = new Map(); commits.forEach(c => commitMap.set(c.id, c));

    const phaseOrder = buckets.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Cycles
    const cycles = detectCycles(taskMap);
    const warnings = cycles.length > 0 ? [{
      type: 'CIRCULAR_DEPENDENCY',
      message: cycles.length + ' circular dependency chain(s)',
      details: cycles.map(c => c.map(id => taskMap.get(id)?.name || id).join(' → ')),
    }] : [];

    // Part availability
    const partAvail = {};
    tpLinks.forEach(l => {
      if (!partAvail[l.task_id]) partAvail[l.task_id] = [];
      const part = partMap.get(l.part_id);
      const commit = l.commitment_id ? commitMap.get(l.commitment_id) : null;
      let status = 'available';
      if (commit) {
        const covered = (commit.reserved_from_stock || 0) + (commit.covered_from_po || 0);
        if (covered < (commit.required_total || 0))
          status = commit.covered_from_po > 0 ? 'ordered' : 'unavailable';
      }
      partAvail[l.task_id].push({ partId: l.part_id, partName: part?.part_name || 'Unknown', commitmentId: l.commitment_id, status });
    });

    // Pre-calc phase statuses for sequential checks
    for (const b of phaseOrder) {
      const pt = tasks.filter(t => t.kanban_bucket_id === b.id);
      const req = pt.filter(t => t.is_phase_required !== false);
      const reqDone = req.filter(t => t.status_id === DONE_STATUS_ID).length;
      if (pt.length === 0) b._status = 'not_configured';
      else if (req.length > 0 && reqDone === req.length) b._status = 'completed';
      else if (pt.some(t => t.status_id === DONE_STATUS_ID || t.status_id === IN_PROGRESS_STATUS_ID)) b._status = 'in_progress';
      else b._status = 'not_started';
    }

    // Resolve tasks
    const taskResults = [];
    const now = new Date().toISOString();
    for (const task of tasks) {
      const r = resolveOne(task, taskMap, bucketMap, phaseOrder, partAvail, scMap, approvalMap);
      task._rs = r;
      taskResults.push({
        taskId: task.id, taskName: task.name, manualStatus: task.status_id,
        operationalState: r.state, blockingReasons: r.reasons,
        isActionable: r.isActionable, isOverride: r.isOverride || false,
        executionState: r.executionState || null, bucketId: task.kanban_bucket_id,
        assignedTo: task.assigned_team_member_id, dependencyCount: task.dependencies?.length || 0,
      });
    }

    // Phase rollups
    const phaseRollups = phaseOrder.map(b => ({
      bucketId: b.id, bucketName: b.name, order: b.order, color: b.color,
      progressionMode: b.progression_mode || 'dependency_driven',
      isRequired: b.is_required !== false, isActive: b.is_active !== false,
      ...phaseRollup(b, tasks),
    }));

    // Persist
    if (!dry_run) {
      const updates = [];
      for (const tr of taskResults) {
        const t = taskMap.get(tr.taskId);
        if (t.operational_state !== tr.operationalState || JSON.stringify(t.blocking_reasons || []) !== JSON.stringify(tr.blockingReasons))
          updates.push(base44.asServiceRole.entities.Task.update(tr.taskId, {
            operational_state: tr.operationalState, blocking_reasons: tr.blockingReasons, state_resolved_at: now,
          }));
      }
      for (const pr of phaseRollups) {
        const b = bucketMap.get(pr.bucketId);
        if (b && b.phase_status !== pr.phaseStatus)
          updates.push(base44.asServiceRole.entities.ProjectKanbanBucket.update(pr.bucketId, { phase_status: pr.phaseStatus }));
      }
      await Promise.all(updates);
    }

    const summary = { projectId: project_id, totalTasks: tasks.length, totalPhases: buckets.length, stateDistribution: {}, warnings };
    for (const tr of taskResults) summary.stateDistribution[tr.operationalState] = (summary.stateDistribution[tr.operationalState] || 0) + 1;

    return Response.json({ summary, tasks: taskResults, phases: phaseRollups, warnings });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});