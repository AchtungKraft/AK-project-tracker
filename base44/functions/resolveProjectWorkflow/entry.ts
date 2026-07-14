import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ── Status Mapping ──
const KNOWN_IDS = {
  DONE: '6913f57422230d8c7ee2ef54',
  IN_PROGRESS: '6913f57422230d8c7ee2ef52',
  REVIEW: '6913f57422230d8c7ee2ef53',
  QA: '6914ae57ed93061844fb7cc0',
  TODO: '6913f57422230d8c7ee2ef51',
};

function buildStatusMapping(statusList) {
  const taskStatuses = statusList.filter(s => s.scope === 'Task' && s.active);
  const map = { doneIds: new Set(), inProgressIds: new Set(), reviewIds: new Set(), cancelledIds: new Set(), todoIds: new Set() };
  const warnings = [];
  for (const s of taskStatuses) {
    const l = (s.label || '').toLowerCase().trim();
    if (l === 'done' || l === 'completed' || l === 'complete') map.doneIds.add(s.id);
    else if (l === 'in progress' || l === 'in-progress' || l === 'active') map.inProgressIds.add(s.id);
    else if (l === 'review' || l === 'qa' || l === 'qa/test' || l === 'in review') map.reviewIds.add(s.id);
    else if (l === 'cancelled' || l === 'canceled') map.cancelledIds.add(s.id);
    else if (l === 'to do' || l === 'todo' || l === 'not started' || l === 'backlog') map.todoIds.add(s.id);
    else warnings.push({ type: 'UNMAPPED_STATUS', message: `Status "${s.label}" (${s.id}) not mapped` });
  }
  if (map.doneIds.size === 0 && KNOWN_IDS.DONE) { map.doneIds.add(KNOWN_IDS.DONE); warnings.push({ type: 'STATUS_FALLBACK', message: 'Using fallback Done status ID' }); }
  if (map.inProgressIds.size === 0 && KNOWN_IDS.IN_PROGRESS) map.inProgressIds.add(KNOWN_IDS.IN_PROGRESS);
  if (map.reviewIds.size === 0) { if (KNOWN_IDS.REVIEW) map.reviewIds.add(KNOWN_IDS.REVIEW); if (KNOWN_IDS.QA) map.reviewIds.add(KNOWN_IDS.QA); }
  return { map, warnings, allTaskStatuses: taskStatuses };
}

// ── Operational State Constants ──
const S = {
  NOT_STARTED: 'NOT_STARTED', READY: 'READY', IN_PROGRESS: 'IN_PROGRESS',
  WAITING_ON_PARTS: 'WAITING_ON_PARTS', WAITING_ON_VENDOR: 'WAITING_ON_VENDOR',
  WAITING_ON_CUSTOMER: 'WAITING_ON_CUSTOMER', BLOCKED: 'BLOCKED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED',
};

// ── Phase Status Constants ──
const PS = {
  NOT_CONFIGURED: 'not_configured', NOT_STARTED: 'not_started', READY: 'ready',
  ACTIVE: 'active', WAITING: 'waiting', BLOCKED: 'blocked',
  COMPLETED: 'completed', SKIPPED: 'skipped',
};

// ── Cycle Detection ──
function detectCycles(taskMap) {
  const visited = new Set();
  const inStack = new Set();
  const cycles = [];
  function dfs(id, path) {
    if (inStack.has(id)) { cycles.push([...path, id]); return; }
    if (visited.has(id)) return;
    visited.add(id); inStack.add(id);
    const t = taskMap.get(id);
    if (t?.dependencies) {
      for (const d of t.dependencies) { if (taskMap.has(d)) dfs(d, [...path, id]); }
    }
    inStack.delete(id);
  }
  for (const id of taskMap.keys()) dfs(id, []);
  return cycles;
}

// ── Dependency Validation ──
function validateDependencies(tasks, taskMap, projectId, statusMap) {
  const invalidDeps = [];
  for (const t of tasks) {
    if (!t.dependencies?.length) continue;
    const seen = new Set();
    const cleanDeps = [];
    let needsCleanup = false;
    for (const depId of t.dependencies) {
      if (depId === t.id) { invalidDeps.push({ taskId: t.id, taskName: t.name, depId, reason: 'SELF_REFERENCE' }); needsCleanup = true; continue; }
      if (seen.has(depId)) { invalidDeps.push({ taskId: t.id, taskName: t.name, depId, reason: 'DUPLICATE' }); needsCleanup = true; continue; }
      seen.add(depId);
      if (!taskMap.has(depId)) { invalidDeps.push({ taskId: t.id, taskName: t.name, depId, reason: 'MISSING_TASK' }); needsCleanup = true; continue; }
      const dep = taskMap.get(depId);
      if (dep.project_id !== projectId) { invalidDeps.push({ taskId: t.id, taskName: t.name, depId, depProject: dep.project_id, reason: 'CROSS_PROJECT' }); needsCleanup = true; continue; }
      if (statusMap.cancelledIds.has(dep.status_id)) { invalidDeps.push({ taskId: t.id, taskName: t.name, depId, depName: dep.name, reason: 'CANCELLED_PREDECESSOR' }); }
      cleanDeps.push(depId);
    }
    if (needsCleanup) t._cleanedDeps = cleanDeps;
  }
  return invalidDeps;
}

// ── Single Task Resolution ──
function resolveOne(task, taskMap, bucketMap, phaseOrder, partAvail, scMap, approvalMap, statusMap, cycleTaskIds) {
  const reasons = [];
  if (statusMap.doneIds.has(task.status_id)) return { state: S.COMPLETED, reasons, isActionable: false };
  if (statusMap.cancelledIds.has(task.status_id)) return { state: S.CANCELLED, reasons, isActionable: false };

  if (task.manual_override) {
    const mo = task.manual_override;
    if (mo.type === 'HOLD') { reasons.push({ type: 'MANUAL_HOLD', label: 'On hold: ' + (mo.reason || 'No reason') }); return { state: S.BLOCKED, reasons, isActionable: false, isOverride: true }; }
    if (mo.type === 'FORCE_BLOCKED') { reasons.push({ type: 'MANUAL_HOLD', label: 'Force blocked: ' + (mo.reason || 'No reason') }); return { state: S.BLOCKED, reasons, isActionable: false, isOverride: true }; }
  }

  const isInProgress = statusMap.inProgressIds.has(task.status_id);
  const isReview = statusMap.reviewIds.has(task.status_id);

  if (cycleTaskIds.has(task.id)) reasons.push({ type: 'DATA_CONFIGURATION', label: 'Task is part of a circular dependency chain' });

  if (task.dependencies?.length) {
    for (const depId of task.dependencies) {
      const dep = taskMap.get(depId);
      if (!dep) { reasons.push({ type: 'DATA_CONFIGURATION', label: 'Missing dependency task', relatedTaskId: depId }); continue; }
      if (!statusMap.doneIds.has(dep.status_id)) reasons.push({ type: 'DEPENDENCY', label: 'Blocked by: ' + dep.name, relatedTaskId: depId });
    }
  }

  const bucket = task.kanban_bucket_id ? bucketMap.get(task.kanban_bucket_id) : null;
  if (bucket) {
    const mode = bucket.progression_mode || 'dependency_driven';
    if (mode === 'manual' && bucket.is_active === false) reasons.push({ type: 'PHASE', label: 'Phase "' + bucket.name + '" not active' });
    if (mode === 'sequential') {
      for (const prev of phaseOrder) {
        if (prev.project_id !== bucket.project_id) continue;
        if ((prev.order || 0) >= (bucket.order || 0)) continue;
        if (prev.is_required === false) continue;
        if (prev._status !== 'completed') reasons.push({ type: 'PHASE', label: 'Waiting for phase "' + prev.name + '"' });
      }
    }
  }

  if (partAvail[task.id]) {
    for (const p of partAvail[task.id]) {
      if (p.status === 'unavailable') reasons.push({ type: 'PART', label: 'Waiting for ' + p.partName + (p.qtyShort > 0 ? ` (${p.qtyShort} short)` : ''), relatedEntityId: p.partId });
      else if (p.status === 'ordered') reasons.push({ type: 'PURCHASE_ORDER', label: p.partName + ' on order', relatedEntityId: p.commitmentId });
    }
  }

  if (task.requires_vendor_work && task.vendor_service_commitment_id) {
    const sc = scMap.get(task.vendor_service_commitment_id);
    if (!sc) reasons.push({ type: 'DATA_CONFIGURATION', label: 'Missing vendor commitment record', relatedEntityId: task.vendor_service_commitment_id });
    else if (sc.status !== 'completed' && sc.status !== 'billed') reasons.push({ type: 'VENDOR', label: 'Waiting for: ' + (sc.description || 'vendor work'), relatedEntityId: sc.id });
  }

  if (task.requires_customer_approval && task.customer_approval_request_id) {
    const r = approvalMap.get(task.customer_approval_request_id);
    if (!r) reasons.push({ type: 'DATA_CONFIGURATION', label: 'Missing approval request record', relatedEntityId: task.customer_approval_request_id });
    else if (r.status === 'approved') { /* satisfied */ }
    else if (r.status === 'changes_requested') reasons.push({ type: 'CUSTOMER_APPROVAL', label: 'Changes requested: ' + r.title, relatedEntityId: r.id });
    else reasons.push({ type: 'CUSTOMER_APPROVAL', label: 'Waiting for customer: ' + r.title, relatedEntityId: r.id });
  }

  if (task.manual_override?.type === 'FORCE_READY') return { state: S.READY, reasons, isActionable: true, isOverride: true };

  const hasDep = reasons.some(r => r.type === 'DEPENDENCY');
  const hasPart = reasons.some(r => r.type === 'PART' || r.type === 'PURCHASE_ORDER');
  const hasVendor = reasons.some(r => r.type === 'VENDOR');
  const hasCust = reasons.some(r => r.type === 'CUSTOMER_APPROVAL');
  const hasPhase = reasons.some(r => r.type === 'PHASE');
  const hasConfig = reasons.some(r => r.type === 'DATA_CONFIGURATION');
  const hasAny = reasons.length > 0;

  if (isInProgress) {
    if (hasCust) return { state: S.WAITING_ON_CUSTOMER, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasVendor) return { state: S.WAITING_ON_VENDOR, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasPart) return { state: S.WAITING_ON_PARTS, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasDep || hasPhase || hasConfig) return { state: S.BLOCKED, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasAny) return { state: S.BLOCKED, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    return { state: S.IN_PROGRESS, reasons, isActionable: true };
  }

  if (isReview) return { state: S.REVIEW_REQUIRED, reasons, isActionable: true };

  if (hasCust) return { state: S.WAITING_ON_CUSTOMER, reasons, isActionable: false };
  if (hasVendor) return { state: S.WAITING_ON_VENDOR, reasons, isActionable: false };
  if (hasPart) return { state: S.WAITING_ON_PARTS, reasons, isActionable: false };
  if (hasDep || hasPhase || hasConfig || hasAny) return { state: S.BLOCKED, reasons, isActionable: false };
  return { state: S.READY, reasons, isActionable: true };
}

// ── Phase Metrics (pure task counting — no operational state) ──
function phaseMetrics(bucket, tasks, statusMap) {
  const pt = tasks.filter(t => t.kanban_bucket_id === bucket.id);
  const req = pt.filter(t => t.is_phase_required !== false);
  const cancelled = pt.filter(t => statusMap.cancelledIds.has(t.status_id));
  const nonCancelled = pt.filter(t => !statusMap.cancelledIds.has(t.status_id));
  const done = pt.filter(t => statusMap.doneIds.has(t.status_id));
  const ready = pt.filter(t => t._rs?.state === S.READY);
  const ip = pt.filter(t => t._rs?.state === S.IN_PROGRESS);
  const blocked = pt.filter(t => [S.BLOCKED, S.WAITING_ON_PARTS, S.WAITING_ON_VENDOR, S.WAITING_ON_CUSTOMER].includes(t._rs?.state));
  const wp = pt.filter(t => t._rs?.state === S.WAITING_ON_PARTS);
  const wv = pt.filter(t => t._rs?.state === S.WAITING_ON_VENDOR);
  const wc = pt.filter(t => t._rs?.state === S.WAITING_ON_CUSTOMER);
  const est = nonCancelled.reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const act = nonCancelled.reduce((s, t) => s + (t.actual_hours || 0), 0);
  const rem = nonCancelled.filter(t => !statusMap.doneIds.has(t.status_id)).reduce((s, t) => s + Math.max((t.estimated_hours || 0) - (t.actual_hours || 0), 0), 0);
  const reqNonCancelled = req.filter(t => !statusMap.cancelledIds.has(t.status_id));
  const reqDone = reqNonCancelled.filter(t => statusMap.doneIds.has(t.status_id)).length;
  const pct = reqNonCancelled.length > 0 ? Math.round((reqDone / reqNonCancelled.length) * 100) : 0;
  const isComplete = reqNonCancelled.length > 0 && reqDone === reqNonCancelled.length;

  return {
    totalTaskCount: pt.length, requiredTaskCount: req.length, completedTaskCount: done.length,
    cancelledTaskCount: cancelled.length,
    readyTaskCount: ready.length, inProgressTaskCount: ip.length, blockedTaskCount: blocked.length,
    waitingOnPartsCount: wp.length, waitingOnVendorCount: wv.length, waitingOnCustomerCount: wc.length,
    estimatedHours: est, actualHours: act, remainingHours: Math.max(rem, 0), completionPercent: pct,
    isComplete, tasks: pt,
  };
}

// ── Phase State Engine ──
function resolvePhaseState(bucket, metrics, phaseOrder, statusMap) {
  // No tasks = not configured
  if (metrics.totalTaskCount === 0) return { status: PS.NOT_CONFIGURED, waitingReason: null, currentBlocker: null };

  // Skipped: optional phase with no required tasks or all cancelled
  if (bucket.is_required === false && metrics.requiredTaskCount === 0) return { status: PS.SKIPPED, waitingReason: null, currentBlocker: null };

  // Completed: all required non-cancelled tasks done
  if (metrics.isComplete) return { status: PS.COMPLETED, waitingReason: null, currentBlocker: null };

  // Active: at least one task in progress or review
  const hasIP = metrics.inProgressTaskCount > 0;

  // Determine waiting reasons and blockers from task states
  let waitingReason = null;
  let currentBlocker = null;
  const waitReasons = [];

  // Check for waiting states
  if (metrics.waitingOnPartsCount > 0) {
    // Find the first specific part blocker
    const partTask = metrics.tasks.find(t => t._rs?.state === S.WAITING_ON_PARTS);
    const partReason = partTask?._rs?.reasons?.find(r => r.type === 'PART');
    waitReasons.push('Waiting on Parts' + (partReason ? ': ' + partReason.label : ''));
  }
  if (metrics.waitingOnVendorCount > 0) {
    const vendorTask = metrics.tasks.find(t => t._rs?.state === S.WAITING_ON_VENDOR);
    const vendorReason = vendorTask?._rs?.reasons?.find(r => r.type === 'VENDOR');
    waitReasons.push('Waiting on Vendor' + (vendorReason ? ': ' + vendorReason.label : ''));
  }
  if (metrics.waitingOnCustomerCount > 0) {
    const custTask = metrics.tasks.find(t => t._rs?.state === S.WAITING_ON_CUSTOMER);
    const custReason = custTask?._rs?.reasons?.find(r => r.type === 'CUSTOMER_APPROVAL');
    waitReasons.push('Waiting on Customer' + (custReason ? ': ' + custReason.label : ''));
  }

  // Check blocked tasks for dependency/phase reasons
  const blockedTasks = metrics.tasks.filter(t => t._rs?.state === S.BLOCKED);
  for (const bt of blockedTasks) {
    for (const r of (bt._rs?.reasons || [])) {
      if (r.type === 'PHASE') waitReasons.push('Waiting on Previous Phase: ' + r.label);
      if (r.type === 'DEPENDENCY') waitReasons.push('Waiting on Dependencies: ' + r.label);
      if (r.type === 'MANUAL_HOLD') waitReasons.push(r.label);
    }
  }

  // Check manual activation
  const mode = bucket.progression_mode || 'dependency_driven';
  if (mode === 'manual' && bucket.is_active === false) {
    waitReasons.push('Waiting on Manual Activation');
  }

  // Dominant waiting reason
  waitingReason = waitReasons[0] || null;
  currentBlocker = waitReasons[0] || null;

  // All tasks blocked, none in progress, none ready = BLOCKED
  if (!hasIP && metrics.readyTaskCount === 0 && metrics.blockedTaskCount > 0) {
    return { status: PS.BLOCKED, waitingReason, currentBlocker };
  }

  // Has in-progress work but also has waiting issues
  if (hasIP && waitReasons.length > 0) {
    return { status: PS.WAITING, waitingReason, currentBlocker };
  }

  // Has in-progress work with no blockers
  if (hasIP) {
    return { status: PS.ACTIVE, waitingReason: null, currentBlocker: null };
  }

  // Has ready work but nothing in progress yet
  if (metrics.readyTaskCount > 0) {
    return { status: PS.READY, waitingReason: null, currentBlocker: null };
  }

  // Has waiting issues but no work happening
  if (waitReasons.length > 0) {
    return { status: PS.WAITING, waitingReason, currentBlocker };
  }

  // Phase readiness check for sequential mode
  if (mode === 'sequential') {
    for (const prev of phaseOrder) {
      if (prev.project_id !== bucket.project_id) continue;
      if ((prev.order || 0) >= (bucket.order || 0)) continue;
      if (prev.is_required === false) continue;
      if (prev._status !== 'completed') {
        return { status: PS.NOT_STARTED, waitingReason: 'Waiting on Previous Phase', currentBlocker: 'Phase "' + prev.name + '" not complete' };
      }
    }
  }

  return { status: PS.NOT_STARTED, waitingReason: null, currentBlocker: null };
}

// ── Milestone Resolution ──
function resolveMilestones(milestones, phaseMap, taskMap, statusMap) {
  const milestoneMap = new Map();
  milestones.forEach(m => milestoneMap.set(m.id, m));
  const sorted = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));
  const results = [];

  for (const ms of sorted) {
    let allMet = true;
    let blockingReason = null;

    // Check phase dependencies
    if (ms.depends_on_phases?.length) {
      for (const phaseId of ms.depends_on_phases) {
        const phase = phaseMap.get(phaseId);
        if (!phase) { allMet = false; blockingReason = 'Missing phase dependency'; continue; }
        const isPhaseComplete = phase._phaseState?.status === PS.COMPLETED;
        if (!isPhaseComplete) {
          allMet = false;
          blockingReason = blockingReason || ('Waiting on phase: ' + phase.name);
        }
      }
    }

    // Check task dependencies
    if (ms.depends_on_tasks?.length) {
      for (const taskId of ms.depends_on_tasks) {
        const task = taskMap.get(taskId);
        if (!task) { allMet = false; blockingReason = blockingReason || 'Missing task dependency'; continue; }
        // Only required tasks block — optional tasks (is_phase_required === false) never block milestones
        if (task.is_phase_required === false) continue;
        if (!statusMap.doneIds.has(task.status_id)) {
          allMet = false;
          blockingReason = blockingReason || ('Waiting on task: ' + task.name);
        }
      }
    }

    // Check milestone dependencies
    if (ms.depends_on_milestones?.length) {
      for (const msDepId of ms.depends_on_milestones) {
        const depMs = results.find(r => r.milestoneId === msDepId);
        if (!depMs || depMs.status !== 'completed') {
          allMet = false;
          const depName = milestoneMap.get(msDepId)?.name || msDepId;
          blockingReason = blockingReason || ('Waiting on milestone: ' + depName);
        }
      }
    }

    // No dependencies at all = pending (manual or not configured)
    const hasDeps = (ms.depends_on_phases?.length || 0) + (ms.depends_on_tasks?.length || 0) + (ms.depends_on_milestones?.length || 0);
    const status = ms.status === 'skipped' ? 'skipped'
      : (hasDeps > 0 && allMet) ? 'completed'
      : ms.status === 'completed' ? 'completed' // preserve manual completion
      : 'pending';

    results.push({
      milestoneId: ms.id, name: ms.name, order: ms.order || 0,
      status, blockingReason: status === 'pending' ? blockingReason : null,
      color: ms.color, icon: ms.icon,
      completedAt: status === 'completed' ? (ms.completed_at || new Date().toISOString()) : null,
    });
  }
  return results;
}

// ── Project Health & Current/Next Phase ──
function deriveProjectHealth(phaseRollups, milestoneResults, tasks, statusMap) {
  const orderedPhases = [...phaseRollups].sort((a, b) => (a.order || 0) - (b.order || 0));

  // Current phase = first non-completed, non-skipped, non-not_configured required phase
  let currentPhase = null;
  let nextPhase = null;
  for (const p of orderedPhases) {
    if (p.phaseStatus === PS.NOT_CONFIGURED || p.phaseStatus === PS.SKIPPED) continue;
    if (!currentPhase && p.phaseStatus !== PS.COMPLETED) {
      currentPhase = p;
    } else if (currentPhase && !nextPhase && p.phaseStatus !== PS.COMPLETED) {
      nextPhase = p;
    }
  }

  // Current blocker = current phase's blocker, or first blocker found in any phase
  let currentBlocker = currentPhase?.currentBlocker || null;
  if (!currentBlocker) {
    for (const p of orderedPhases) {
      if (p.currentBlocker) { currentBlocker = p.currentBlocker; break; }
    }
  }

  // Milestones
  const completedMilestones = milestoneResults.filter(m => m.status === 'completed');
  const pendingMilestones = milestoneResults.filter(m => m.status === 'pending');
  const currentMilestone = completedMilestones.length > 0 ? completedMilestones[completedMilestones.length - 1] : null;
  const nextMilestone = pendingMilestones.length > 0 ? pendingMilestones[0] : null;

  // Task health
  const nonCancelled = tasks.filter(t => !statusMap.cancelledIds.has(t.status_id));
  const health = {
    tasks_ready: tasks.filter(t => t._rs?.state === S.READY).length,
    tasks_blocked: tasks.filter(t => [S.BLOCKED, S.WAITING_ON_PARTS, S.WAITING_ON_VENDOR, S.WAITING_ON_CUSTOMER].includes(t._rs?.state)).length,
    tasks_waiting: tasks.filter(t => [S.WAITING_ON_PARTS, S.WAITING_ON_VENDOR, S.WAITING_ON_CUSTOMER].includes(t._rs?.state)).length,
    tasks_in_progress: tasks.filter(t => t._rs?.state === S.IN_PROGRESS).length,
    tasks_completed: tasks.filter(t => t._rs?.state === S.COMPLETED).length,
    hours_estimated: nonCancelled.reduce((s, t) => s + (t.estimated_hours || 0), 0),
    hours_actual: nonCancelled.reduce((s, t) => s + (t.actual_hours || 0), 0),
    hours_remaining: nonCancelled.filter(t => !statusMap.doneIds.has(t.status_id)).reduce((s, t) => s + Math.max((t.estimated_hours || 0) - (t.actual_hours || 0), 0), 0),
  };

  return {
    currentPhase: currentPhase ? { id: currentPhase.bucketId, name: currentPhase.bucketName } : null,
    nextPhase: nextPhase ? { id: nextPhase.bucketId, name: nextPhase.bucketName } : null,
    currentBlocker,
    currentMilestone: currentMilestone ? { id: currentMilestone.milestoneId, name: currentMilestone.name } : null,
    nextMilestone: nextMilestone ? { id: nextMilestone.milestoneId, name: nextMilestone.name, blockingReason: nextMilestone.blockingReason } : null,
    health,
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
    const mode = body.mode || 'resolve';
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // ── MODE: READ — return persisted state ──
    if (mode === 'read') {
      const [tasks, buckets, milestones] = await Promise.all([
        base44.asServiceRole.entities.Task.filter({ project_id }),
        base44.asServiceRole.entities.ProjectKanbanBucket.filter({ project_id }),
        base44.asServiceRole.entities.ProjectMilestone.filter({ project_id }),
      ]);

      const phaseOrder = [...buckets].sort((a, b) => (a.order || 0) - (b.order || 0));
      const stateDistribution = {};
      const taskResults = [];
      for (const t of tasks) {
        const st = t.operational_state || 'NOT_STARTED';
        stateDistribution[st] = (stateDistribution[st] || 0) + 1;
        taskResults.push({
          taskId: t.id, taskName: t.name, manualStatus: t.status_id,
          operationalState: st, blockingReasons: t.blocking_reasons || [],
          isActionable: st === S.READY || st === S.IN_PROGRESS || st === S.REVIEW_REQUIRED,
          isOverride: !!t.manual_override, executionState: null,
          bucketId: t.kanban_bucket_id || '', assignedTo: t.assigned_team_member_id || '',
          dependencyCount: t.dependencies?.length || 0,
        });
      }

      const phaseSummaries = phaseOrder.map(b => {
        const pt = tasks.filter(t => t.kanban_bucket_id === b.id);
        const req = pt.filter(t => t.is_phase_required !== false);
        const nonCancelled = pt.filter(t => t.operational_state !== S.CANCELLED);
        const reqNonCancelled = req.filter(t => t.operational_state !== S.CANCELLED);
        const reqDone = reqNonCancelled.filter(t => t.operational_state === S.COMPLETED).length;
        return {
          bucketId: b.id, bucketName: b.name, order: b.order, color: b.color,
          progressionMode: b.progression_mode || 'dependency_driven',
          isRequired: b.is_required !== false, isActive: b.is_active !== false,
          phaseStatus: b.phase_status || PS.NOT_STARTED,
          waitingReason: b.waiting_reason || null,
          currentBlocker: b.current_blocker || null,
          totalTaskCount: pt.length, requiredTaskCount: req.length,
          completedTaskCount: pt.filter(t => t.operational_state === S.COMPLETED).length,
          readyTaskCount: pt.filter(t => t.operational_state === S.READY).length,
          inProgressTaskCount: pt.filter(t => t.operational_state === S.IN_PROGRESS).length,
          blockedTaskCount: pt.filter(t => [S.BLOCKED, S.WAITING_ON_PARTS, S.WAITING_ON_VENDOR, S.WAITING_ON_CUSTOMER].includes(t.operational_state)).length,
          waitingOnPartsCount: pt.filter(t => t.operational_state === S.WAITING_ON_PARTS).length,
          waitingOnVendorCount: pt.filter(t => t.operational_state === S.WAITING_ON_VENDOR).length,
          waitingOnCustomerCount: pt.filter(t => t.operational_state === S.WAITING_ON_CUSTOMER).length,
          estimatedHours: nonCancelled.reduce((s, t) => s + (t.estimated_hours || 0), 0),
          actualHours: nonCancelled.reduce((s, t) => s + (t.actual_hours || 0), 0),
          remainingHours: nonCancelled.filter(t => t.operational_state !== S.COMPLETED).reduce((s, t) => s + Math.max((t.estimated_hours || 0) - (t.actual_hours || 0), 0), 0),
          completionPercent: reqNonCancelled.length > 0 ? Math.round((reqDone / reqNonCancelled.length) * 100) : 0,
        };
      });

      const milestoneResults = milestones.sort((a, b) => (a.order || 0) - (b.order || 0)).map(m => ({
        milestoneId: m.id, name: m.name, order: m.order || 0,
        status: m.status || 'pending', blockingReason: m.blocking_reason || null,
        color: m.color, icon: m.icon, completedAt: m.completed_at || null,
      }));

      // Derive project health from persisted data
      const project = await base44.asServiceRole.entities.Project.get(project_id);
      const hasState = tasks.some(t => t.operational_state);
      return Response.json({
        summary: { projectId: project_id, totalTasks: tasks.length, totalPhases: buckets.length, stateDistribution, warnings: [], resolvedAt: project?.workflow_resolved_at || null },
        tasks: taskResults, phases: phaseSummaries, milestones: milestoneResults,
        projectHealth: {
          currentPhase: project?.current_phase_id ? { id: project.current_phase_id, name: project.current_phase_name } : null,
          nextPhase: project?.next_phase_id ? { id: project.next_phase_id, name: project.next_phase_name } : null,
          currentBlocker: project?.current_blocker || null,
          currentMilestone: project?.current_milestone_id ? { id: project.current_milestone_id, name: project.current_milestone_name } : null,
          nextMilestone: project?.next_milestone_id ? { id: project.next_milestone_id, name: project.next_milestone_name } : null,
          health: project?.workflow_health || null,
        },
        warnings: !hasState ? [{ type: 'STALE_DATA', message: 'Workflow has not been calculated yet. Click Recalculate.' }] : [],
        needsRecalculation: !hasState,
      });
    }

    // ── MODE: RESOLVE — full recalculation ──
    const resolveStart = Date.now();
    const [tasks, buckets, statusList, tpLinks, scs, fbReqs, commits, parts, milestones] = await Promise.all([
      base44.asServiceRole.entities.Task.filter({ project_id }),
      base44.asServiceRole.entities.ProjectKanbanBucket.filter({ project_id }),
      base44.asServiceRole.entities.StatusList.list(),
      base44.asServiceRole.entities.TaskPartLink.filter({ project_id }),
      base44.asServiceRole.entities.ServiceCommitment.filter({ project_id }),
      base44.asServiceRole.entities.ClientFeedbackRequest.filter({ project_id }),
      base44.asServiceRole.entities.PartCommitment.filter({ project_id }),
      base44.asServiceRole.entities.Part.list('-created_date', 500),
      base44.asServiceRole.entities.ProjectMilestone.filter({ project_id }),
    ]);

    const { map: statusMap, warnings: statusWarnings } = buildStatusMapping(statusList);
    const taskMap = new Map(); tasks.forEach(t => taskMap.set(t.id, t));
    const bucketMap = new Map(); buckets.forEach(b => bucketMap.set(b.id, b));
    const scMap = new Map(); scs.forEach(s => scMap.set(s.id, s));
    const approvalMap = new Map(); fbReqs.forEach(r => approvalMap.set(r.id, r));
    const partMap = new Map(); parts.forEach(p => partMap.set(p.id, p));
    const commitMap = new Map(); commits.forEach(c => commitMap.set(c.id, c));
    const phaseOrder = [...buckets].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Dependency validation
    const invalidDeps = validateDependencies(tasks, taskMap, project_id, statusMap);
    const cycles = detectCycles(taskMap);
    const cycleTaskIds = new Set();
    for (const cycle of cycles) { for (const id of cycle) cycleTaskIds.add(id); }

    const warnings = [...statusWarnings];
    if (cycles.length > 0) warnings.push({ type: 'CIRCULAR_DEPENDENCY', message: cycles.length + ' circular dependency chain(s) detected', details: cycles.map(c => c.map(id => taskMap.get(id)?.name || id).join(' → ')) });
    if (invalidDeps.length > 0) warnings.push({ type: 'INVALID_DEPENDENCIES', message: invalidDeps.length + ' invalid dependency reference(s)', details: invalidDeps });

    // Part availability
    const partAvail = {};
    tpLinks.forEach(l => {
      if (!partAvail[l.task_id]) partAvail[l.task_id] = [];
      const part = partMap.get(l.part_id);
      const commit = l.commitment_id ? commitMap.get(l.commitment_id) : null;
      let status = 'available'; let qtyShort = 0;
      if (commit) {
        const covered = (commit.reserved_from_stock || 0) + (commit.covered_from_po || 0);
        if (covered < (commit.required_total || 0)) { qtyShort = (commit.required_total || 0) - covered; status = commit.covered_from_po > 0 ? 'ordered' : 'unavailable'; }
      }
      partAvail[l.task_id].push({ partId: l.part_id, partName: part?.part_name || 'Unknown', commitmentId: l.commitment_id, status, qtyShort });
    });

    // Pre-calc phase completion for sequential checks
    for (const b of phaseOrder) {
      const pt = tasks.filter(t => t.kanban_bucket_id === b.id);
      const req = pt.filter(t => t.is_phase_required !== false);
      const reqNonCancelled = req.filter(t => !statusMap.cancelledIds.has(t.status_id));
      const reqDone = reqNonCancelled.filter(t => statusMap.doneIds.has(t.status_id)).length;
      if (pt.length === 0) b._status = 'not_configured';
      else if (reqNonCancelled.length > 0 && reqDone === reqNonCancelled.length) b._status = 'completed';
      else if (pt.some(t => statusMap.doneIds.has(t.status_id) || statusMap.inProgressIds.has(t.status_id))) b._status = 'in_progress';
      else b._status = 'not_started';
    }

    // ── Resolve all tasks ──
    const taskResults = [];
    const now = new Date().toISOString();
    for (const task of tasks) {
      const r = resolveOne(task, taskMap, bucketMap, phaseOrder, partAvail, scMap, approvalMap, statusMap, cycleTaskIds);
      task._rs = r;
      taskResults.push({
        taskId: task.id, taskName: task.name, manualStatus: task.status_id,
        operationalState: r.state, blockingReasons: r.reasons,
        isActionable: r.isActionable, isOverride: r.isOverride || false,
        executionState: r.executionState || null, bucketId: task.kanban_bucket_id || '',
        assignedTo: task.assigned_team_member_id || '', dependencyCount: task.dependencies?.length || 0,
      });
    }

    // ── Phase State Engine ──
    const phaseRollups = phaseOrder.map(b => {
      const metrics = phaseMetrics(b, tasks, statusMap);
      const phaseState = resolvePhaseState(b, metrics, phaseOrder, statusMap);
      b._phaseState = phaseState;
      return {
        bucketId: b.id, bucketName: b.name, order: b.order, color: b.color,
        progressionMode: b.progression_mode || 'dependency_driven',
        isRequired: b.is_required !== false, isActive: b.is_active !== false,
        phaseStatus: phaseState.status,
        waitingReason: phaseState.waitingReason,
        currentBlocker: phaseState.currentBlocker,
        totalTaskCount: metrics.totalTaskCount, requiredTaskCount: metrics.requiredTaskCount,
        completedTaskCount: metrics.completedTaskCount, cancelledTaskCount: metrics.cancelledTaskCount,
        readyTaskCount: metrics.readyTaskCount, inProgressTaskCount: metrics.inProgressTaskCount,
        blockedTaskCount: metrics.blockedTaskCount,
        waitingOnPartsCount: metrics.waitingOnPartsCount, waitingOnVendorCount: metrics.waitingOnVendorCount,
        waitingOnCustomerCount: metrics.waitingOnCustomerCount,
        estimatedHours: metrics.estimatedHours, actualHours: metrics.actualHours,
        remainingHours: metrics.remainingHours, completionPercent: metrics.completionPercent,
      };
    });

    // ── Milestone Resolution ──
    const milestoneResults = resolveMilestones(milestones, bucketMap, taskMap, statusMap);

    // ── Project Health ──
    const projectHealthData = deriveProjectHealth(phaseRollups, milestoneResults, tasks, statusMap);

    // ── Persist ──
    let tasksChanged = 0;
    let tasksUnchanged = 0;
    const phaseTransitions = [];
    if (!dry_run) {
      const updates = [];

      // Task updates
      for (const tr of taskResults) {
        const t = taskMap.get(tr.taskId);
        const oldState = t.operational_state || null;
        const oldReasons = JSON.stringify(t.blocking_reasons || []);
        const newReasons = JSON.stringify(tr.blockingReasons);
        if (oldState !== tr.operationalState || oldReasons !== newReasons) {
          tasksChanged++;
          updates.push(base44.asServiceRole.entities.Task.update(tr.taskId, {
            operational_state: tr.operationalState, blocking_reasons: tr.blockingReasons, state_resolved_at: now,
          }));
        } else { tasksUnchanged++; }
      }

      // Phase updates
      for (const pr of phaseRollups) {
        const b = bucketMap.get(pr.bucketId);
        if (!b) continue;
        const oldStatus = b.phase_status || PS.NOT_STARTED;
        const phaseUpdate = {};
        let changed = false;
        if (oldStatus !== pr.phaseStatus) {
          phaseUpdate.phase_status = pr.phaseStatus;
          phaseUpdate.phase_entered_at = now;
          if (pr.phaseStatus === PS.COMPLETED) phaseUpdate.phase_completed_at = now;
          changed = true;
          phaseTransitions.push({ phaseId: pr.bucketId, phaseName: pr.bucketName, from: oldStatus, to: pr.phaseStatus });
        }
        if ((b.waiting_reason || null) !== pr.waitingReason) { phaseUpdate.waiting_reason = pr.waitingReason || ''; changed = true; }
        if ((b.current_blocker || null) !== pr.currentBlocker) { phaseUpdate.current_blocker = pr.currentBlocker || ''; changed = true; }
        if (changed) updates.push(base44.asServiceRole.entities.ProjectKanbanBucket.update(pr.bucketId, phaseUpdate));
      }

      // Milestone updates
      for (const mr of milestoneResults) {
        const ms = milestones.find(m => m.id === mr.milestoneId);
        if (!ms) continue;
        const msUpdate = {};
        let changed = false;
        if (ms.status !== mr.status) {
          msUpdate.status = mr.status;
          if (mr.status === 'completed' && !ms.completed_at) { msUpdate.completed_at = now; msUpdate.completion_source = 'automatic'; }
          changed = true;
        }
        if ((ms.blocking_reason || null) !== (mr.blockingReason || null)) { msUpdate.blocking_reason = mr.blockingReason || ''; changed = true; }
        if (changed) updates.push(base44.asServiceRole.entities.ProjectMilestone.update(mr.milestoneId, msUpdate));
      }

      // Project health update
      const ph = projectHealthData;
      const projectUpdate = {
        current_phase_id: ph.currentPhase?.id || '',
        current_phase_name: ph.currentPhase?.name || '',
        next_phase_id: ph.nextPhase?.id || '',
        next_phase_name: ph.nextPhase?.name || '',
        current_blocker: ph.currentBlocker || '',
        current_milestone_id: ph.currentMilestone?.id || '',
        current_milestone_name: ph.currentMilestone?.name || '',
        next_milestone_id: ph.nextMilestone?.id || '',
        next_milestone_name: ph.nextMilestone?.name || '',
        workflow_health: ph.health,
        workflow_resolved_at: now,
      };
      updates.push(base44.asServiceRole.entities.Project.update(project_id, projectUpdate));

      // Phase transition logs
      for (const pt of phaseTransitions) {
        updates.push(base44.asServiceRole.entities.PhaseTransitionLog.create({
          project_id, phase_id: pt.phaseId, phase_name: pt.phaseName,
          from_status: pt.from, to_status: pt.to,
          reason: 'Automatic resolution', triggered_by: 'automatic',
        }));
      }

      if (updates.length > 0) await Promise.all(updates);

      // Clean up invalid deps
      const depCleanups = [];
      for (const t of tasks) {
        if (t._cleanedDeps !== undefined) depCleanups.push(base44.asServiceRole.entities.Task.update(t.id, { dependencies: t._cleanedDeps }));
      }
      if (depCleanups.length > 0) await Promise.all(depCleanups);
    }

    const stateDistribution = {};
    for (const tr of taskResults) stateDistribution[tr.operationalState] = (stateDistribution[tr.operationalState] || 0) + 1;
    const resolveTime = Date.now() - resolveStart;

    return Response.json({
      summary: {
        projectId: project_id, totalTasks: tasks.length, totalPhases: buckets.length,
        totalMilestones: milestones.length,
        tasksChanged, tasksUnchanged, stateDistribution, warnings,
        resolvedAt: now, resolveTimeMs: resolveTime,
        entityReads: 9, entityWrites: tasksChanged + phaseTransitions.length,
        depsCleaned: tasks.filter(t => t._cleanedDeps !== undefined).length,
        phaseTransitions: phaseTransitions.length,
      },
      tasks: taskResults, phases: phaseRollups, milestones: milestoneResults,
      projectHealth: projectHealthData,
      warnings, errors: [],
      cycles: cycles.map(c => c.map(id => taskMap.get(id)?.name || id)),
      invalidDependencies: invalidDeps, phaseTransitions,
    });
  } catch (error) {
    console.error('resolveProjectWorkflow error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});