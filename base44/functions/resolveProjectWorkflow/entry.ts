import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ── Status Mapping ──
// Central lookup: load from StatusList, match by label semantics.
// Fallback to known production IDs if labels are unavailable.
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
    else warnings.push({ type: 'UNMAPPED_STATUS', message: `Status "${s.label}" (${s.id}) not mapped to a semantic group` });
  }

  // Fallbacks: ensure at least Done is mapped
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

// ── Cycle Detection ──
// Full graph DFS — detects all cycles, not just immediate predecessors.
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
      for (const d of t.dependencies) {
        if (taskMap.has(d)) dfs(d, [...path, id]);
      }
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
      // Self-reference
      if (depId === t.id) {
        invalidDeps.push({ taskId: t.id, taskName: t.name, depId, reason: 'SELF_REFERENCE' });
        needsCleanup = true;
        continue;
      }
      // Duplicate
      if (seen.has(depId)) {
        invalidDeps.push({ taskId: t.id, taskName: t.name, depId, reason: 'DUPLICATE' });
        needsCleanup = true;
        continue;
      }
      seen.add(depId);
      // Missing task (orphan/deleted)
      if (!taskMap.has(depId)) {
        invalidDeps.push({ taskId: t.id, taskName: t.name, depId, reason: 'MISSING_TASK' });
        needsCleanup = true;
        continue;
      }
      const dep = taskMap.get(depId);
      // Cross-project
      if (dep.project_id !== projectId) {
        invalidDeps.push({ taskId: t.id, taskName: t.name, depId, depProject: dep.project_id, reason: 'CROSS_PROJECT' });
        needsCleanup = true;
        continue;
      }
      // Cancelled predecessor warning (kept but flagged)
      if (statusMap.cancelledIds.has(dep.status_id)) {
        invalidDeps.push({ taskId: t.id, taskName: t.name, depId, depName: dep.name, reason: 'CANCELLED_PREDECESSOR' });
      }
      cleanDeps.push(depId);
    }
    // Mark task for cleanup if invalid deps found
    if (needsCleanup) {
      t._cleanedDeps = cleanDeps;
    }
  }
  return invalidDeps;
}

// ── Single Task Resolution ──
function resolveOne(task, taskMap, bucketMap, phaseOrder, partAvail, scMap, approvalMap, statusMap, cycleTaskIds) {
  const reasons = [];

  // 1. COMPLETED takes absolute precedence
  if (statusMap.doneIds.has(task.status_id))
    return { state: S.COMPLETED, reasons, isActionable: false };

  // 2. CANCELLED takes second precedence
  if (statusMap.cancelledIds.has(task.status_id))
    return { state: S.CANCELLED, reasons, isActionable: false };

  // 3. Manual override (HOLD / FORCE_BLOCKED) — before dependency checks
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

  // Derive manual execution state
  const isInProgress = statusMap.inProgressIds.has(task.status_id);
  const isReview = statusMap.reviewIds.has(task.status_id);

  // 4. Cycle detection — task is in a dependency cycle
  if (cycleTaskIds.has(task.id)) {
    reasons.push({ type: 'DATA_CONFIGURATION', label: 'Task is part of a circular dependency chain' });
  }

  // 5. Dependencies
  if (task.dependencies?.length) {
    for (const depId of task.dependencies) {
      const dep = taskMap.get(depId);
      if (!dep) {
        reasons.push({ type: 'DATA_CONFIGURATION', label: 'Missing dependency task', relatedTaskId: depId });
        continue;
      }
      if (!statusMap.doneIds.has(dep.status_id)) {
        reasons.push({ type: 'DEPENDENCY', label: 'Blocked by: ' + dep.name, relatedTaskId: depId });
      }
    }
  }

  // 6. Phase eligibility
  const bucket = task.kanban_bucket_id ? bucketMap.get(task.kanban_bucket_id) : null;
  if (bucket) {
    const mode = bucket.progression_mode || 'dependency_driven';
    if (mode === 'manual' && bucket.is_active === false) {
      reasons.push({ type: 'PHASE', label: 'Phase "' + bucket.name + '" not active' });
    }
    if (mode === 'sequential') {
      for (const prev of phaseOrder) {
        if (prev.project_id !== bucket.project_id) continue;
        if ((prev.order || 0) >= (bucket.order || 0)) continue;
        if (prev.is_required === false) continue; // optional phases don't block
        if (prev._status !== 'completed') {
          reasons.push({ type: 'PHASE', label: 'Waiting for phase "' + prev.name + '"' });
        }
      }
    }
    // dependency_driven mode: no phase-level blocking, only task dependencies
  }

  // 7. Parts
  if (partAvail[task.id]) {
    for (const p of partAvail[task.id]) {
      if (p.status === 'unavailable')
        reasons.push({ type: 'PART', label: 'Waiting for ' + p.partName + (p.qtyShort > 0 ? ` (${p.qtyShort} short)` : ''), relatedEntityId: p.partId });
      else if (p.status === 'ordered')
        reasons.push({ type: 'PURCHASE_ORDER', label: p.partName + ' on order', relatedEntityId: p.commitmentId });
    }
  }

  // 8. Vendor work
  if (task.requires_vendor_work && task.vendor_service_commitment_id) {
    const sc = scMap.get(task.vendor_service_commitment_id);
    if (!sc) {
      reasons.push({ type: 'DATA_CONFIGURATION', label: 'Missing vendor commitment record', relatedEntityId: task.vendor_service_commitment_id });
    } else if (sc.status !== 'completed' && sc.status !== 'billed') {
      reasons.push({ type: 'VENDOR', label: 'Waiting for: ' + (sc.description || 'vendor work'), relatedEntityId: sc.id });
    }
  }

  // 9. Customer approval
  if (task.requires_customer_approval && task.customer_approval_request_id) {
    const r = approvalMap.get(task.customer_approval_request_id);
    if (!r) {
      reasons.push({ type: 'DATA_CONFIGURATION', label: 'Missing approval request record', relatedEntityId: task.customer_approval_request_id });
    } else if (r.status === 'approved') {
      // Satisfied — no blocker
    } else if (r.status === 'changes_requested') {
      reasons.push({ type: 'CUSTOMER_APPROVAL', label: 'Changes requested: ' + r.title, relatedEntityId: r.id });
    } else {
      // draft, posted, or other = waiting
      reasons.push({ type: 'CUSTOMER_APPROVAL', label: 'Waiting for customer: ' + r.title, relatedEntityId: r.id });
    }
  }

  // 10. FORCE_READY override — after collecting all blocking reasons
  if (task.manual_override?.type === 'FORCE_READY') {
    // State becomes READY but all unresolved warnings are retained
    return { state: S.READY, reasons, isActionable: true, isOverride: true };
  }

  // 11. Determine primary operational state
  const hasDep = reasons.some(r => r.type === 'DEPENDENCY');
  const hasPart = reasons.some(r => r.type === 'PART' || r.type === 'PURCHASE_ORDER');
  const hasVendor = reasons.some(r => r.type === 'VENDOR');
  const hasCust = reasons.some(r => r.type === 'CUSTOMER_APPROVAL');
  const hasPhase = reasons.some(r => r.type === 'PHASE');
  const hasConfig = reasons.some(r => r.type === 'DATA_CONFIGURATION');
  const hasAny = reasons.length > 0;

  // Precedence for IN_PROGRESS tasks: preserve execution state, overlay operational conflict
  if (isInProgress) {
    if (hasCust) return { state: S.WAITING_ON_CUSTOMER, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasVendor) return { state: S.WAITING_ON_VENDOR, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasPart) return { state: S.WAITING_ON_PARTS, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasDep || hasPhase || hasConfig) return { state: S.BLOCKED, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    if (hasAny) return { state: S.BLOCKED, reasons, isActionable: false, executionState: 'IN_PROGRESS' };
    return { state: S.IN_PROGRESS, reasons, isActionable: true };
  }

  if (isReview) return { state: S.REVIEW_REQUIRED, reasons, isActionable: true };

  // Not started / To Do tasks — use blocking priority
  if (hasCust) return { state: S.WAITING_ON_CUSTOMER, reasons, isActionable: false };
  if (hasVendor) return { state: S.WAITING_ON_VENDOR, reasons, isActionable: false };
  if (hasPart) return { state: S.WAITING_ON_PARTS, reasons, isActionable: false };
  if (hasDep || hasPhase || hasConfig || hasAny) return { state: S.BLOCKED, reasons, isActionable: false };
  return { state: S.READY, reasons, isActionable: true };
}

// ── Phase Rollup Calculation ──
function phaseRollup(bucket, tasks, statusMap) {
  const pt = tasks.filter(t => t.kanban_bucket_id === bucket.id);
  const req = pt.filter(t => t.is_phase_required !== false);
  const done = pt.filter(t => statusMap.doneIds.has(t.status_id));
  const cancelled = pt.filter(t => statusMap.cancelledIds.has(t.status_id));
  const nonCancelled = pt.filter(t => !statusMap.cancelledIds.has(t.status_id));
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

  let status = 'not_started';
  if (pt.length === 0) status = 'not_configured';
  else if (reqNonCancelled.length > 0 && reqDone === reqNonCancelled.length) status = 'completed';
  else if (ip.length > 0 || done.length > 0) status = 'in_progress';

  return {
    totalTaskCount: pt.length, requiredTaskCount: req.length, completedTaskCount: done.length,
    cancelledTaskCount: cancelled.length,
    readyTaskCount: ready.length, inProgressTaskCount: ip.length, blockedTaskCount: blocked.length,
    waitingOnPartsCount: wp.length, waitingOnVendorCount: wv.length, waitingOnCustomerCount: wc.length,
    estimatedHours: est, actualHours: act, remainingHours: Math.max(rem, 0), completionPercent: pct, phaseStatus: status,
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
    const mode = body.mode || 'resolve'; // 'resolve' = full recalc+persist, 'read' = return persisted state
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // Mode: read — return persisted state without recalculating
    if (mode === 'read') {
      const [tasks, buckets] = await Promise.all([
        base44.asServiceRole.entities.Task.filter({ project_id }),
        base44.asServiceRole.entities.ProjectKanbanBucket.filter({ project_id }),
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

      const phaseSummaries = phaseOrder.map(b => ({
        bucketId: b.id, bucketName: b.name, order: b.order, color: b.color,
        progressionMode: b.progression_mode || 'dependency_driven',
        isRequired: b.is_required !== false, isActive: b.is_active !== false,
        phaseStatus: b.phase_status || 'not_started',
        // We need basic counts from persisted task data
        totalTaskCount: tasks.filter(t => t.kanban_bucket_id === b.id).length,
        requiredTaskCount: tasks.filter(t => t.kanban_bucket_id === b.id && t.is_phase_required !== false).length,
        completedTaskCount: tasks.filter(t => t.kanban_bucket_id === b.id && t.operational_state === S.COMPLETED).length,
        readyTaskCount: tasks.filter(t => t.kanban_bucket_id === b.id && t.operational_state === S.READY).length,
        inProgressTaskCount: tasks.filter(t => t.kanban_bucket_id === b.id && t.operational_state === S.IN_PROGRESS).length,
        blockedTaskCount: tasks.filter(t => t.kanban_bucket_id === b.id && [S.BLOCKED, S.WAITING_ON_PARTS, S.WAITING_ON_VENDOR, S.WAITING_ON_CUSTOMER].includes(t.operational_state)).length,
        waitingOnPartsCount: tasks.filter(t => t.kanban_bucket_id === b.id && t.operational_state === S.WAITING_ON_PARTS).length,
        waitingOnVendorCount: tasks.filter(t => t.kanban_bucket_id === b.id && t.operational_state === S.WAITING_ON_VENDOR).length,
        waitingOnCustomerCount: tasks.filter(t => t.kanban_bucket_id === b.id && t.operational_state === S.WAITING_ON_CUSTOMER).length,
        estimatedHours: tasks.filter(t => t.kanban_bucket_id === b.id).reduce((s, t) => s + (t.estimated_hours || 0), 0),
        actualHours: tasks.filter(t => t.kanban_bucket_id === b.id).reduce((s, t) => s + (t.actual_hours || 0), 0),
        remainingHours: 0, completionPercent: 0,
      }));
      // Compute completion percent for each
      for (const p of phaseSummaries) {
        const reqNonCancelled = p.requiredTaskCount - tasks.filter(t => t.kanban_bucket_id === phaseSummaries.find(ps => ps.bucketId === p.bucketId)?.bucketId && t.operational_state === S.CANCELLED).length;
        p.completionPercent = reqNonCancelled > 0 ? Math.round((p.completedTaskCount / reqNonCancelled) * 100) : 0;
      }

      const hasState = tasks.some(t => t.operational_state);
      return Response.json({
        summary: { projectId: project_id, totalTasks: tasks.length, totalPhases: buckets.length, stateDistribution, warnings: [], resolvedAt: tasks[0]?.state_resolved_at || null },
        tasks: taskResults,
        phases: phaseSummaries,
        warnings: !hasState ? [{ type: 'STALE_DATA', message: 'Workflow has not been calculated yet. Click Recalculate.' }] : [],
        needsRecalculation: !hasState,
      });
    }

    // Mode: resolve — full recalculation
    const resolveStart = Date.now();
    const [tasks, buckets, statusList, tpLinks, scs, fbReqs, commits, parts] = await Promise.all([
      base44.asServiceRole.entities.Task.filter({ project_id }),
      base44.asServiceRole.entities.ProjectKanbanBucket.filter({ project_id }),
      base44.asServiceRole.entities.StatusList.list(),
      base44.asServiceRole.entities.TaskPartLink.filter({ project_id }),
      base44.asServiceRole.entities.ServiceCommitment.filter({ project_id }),
      base44.asServiceRole.entities.ClientFeedbackRequest.filter({ project_id }),
      base44.asServiceRole.entities.PartCommitment.filter({ project_id }),
      base44.asServiceRole.entities.Part.list('-created_date', 500),
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

    // Cycle detection
    const cycles = detectCycles(taskMap);
    const cycleTaskIds = new Set();
    for (const cycle of cycles) {
      for (const id of cycle) cycleTaskIds.add(id);
    }

    const warnings = [...statusWarnings];
    if (cycles.length > 0) warnings.push({
      type: 'CIRCULAR_DEPENDENCY',
      message: cycles.length + ' circular dependency chain(s) detected',
      details: cycles.map(c => c.map(id => taskMap.get(id)?.name || id).join(' → ')),
    });
    if (invalidDeps.length > 0) warnings.push({
      type: 'INVALID_DEPENDENCIES',
      message: invalidDeps.length + ' invalid dependency reference(s)',
      details: invalidDeps,
    });

    // Part availability
    const partAvail = {};
    tpLinks.forEach(l => {
      if (!partAvail[l.task_id]) partAvail[l.task_id] = [];
      const part = partMap.get(l.part_id);
      const commit = l.commitment_id ? commitMap.get(l.commitment_id) : null;
      let status = 'available';
      let qtyShort = 0;
      if (commit) {
        const covered = (commit.reserved_from_stock || 0) + (commit.covered_from_po || 0);
        const needed = commit.required_total || 0;
        if (covered < needed) {
          qtyShort = needed - covered;
          status = commit.covered_from_po > 0 ? 'ordered' : 'unavailable';
        }
      }
      partAvail[l.task_id].push({ partId: l.part_id, partName: part?.part_name || 'Unknown', commitmentId: l.commitment_id, status, qtyShort });
    });

    // Pre-calc phase statuses for sequential checks
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

    // Resolve all tasks
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

    // Phase rollups
    const phaseRollups = phaseOrder.map(b => ({
      bucketId: b.id, bucketName: b.name, order: b.order, color: b.color,
      progressionMode: b.progression_mode || 'dependency_driven',
      isRequired: b.is_required !== false, isActive: b.is_active !== false,
      ...phaseRollup(b, tasks, statusMap),
    }));

    // Persist — only changed records
    let tasksChanged = 0;
    let tasksUnchanged = 0;
    if (!dry_run) {
      const updates = [];
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
        } else {
          tasksUnchanged++;
        }
      }
      for (const pr of phaseRollups) {
        const b = bucketMap.get(pr.bucketId);
        if (b && b.phase_status !== pr.phaseStatus)
          updates.push(base44.asServiceRole.entities.ProjectKanbanBucket.update(pr.bucketId, { phase_status: pr.phaseStatus }));
      }
      if (updates.length > 0) await Promise.all(updates);
    }

    const stateDistribution = {};
    for (const tr of taskResults) stateDistribution[tr.operationalState] = (stateDistribution[tr.operationalState] || 0) + 1;

    // Clean up invalid dependencies (self-refs, orphans, cross-project)
    if (!dry_run) {
      const depCleanups = [];
      for (const t of tasks) {
        if (t._cleanedDeps !== undefined) {
          depCleanups.push(base44.asServiceRole.entities.Task.update(t.id, { dependencies: t._cleanedDeps }));
        }
      }
      if (depCleanups.length > 0) await Promise.all(depCleanups);
    }

    const resolveTime = Date.now() - resolveStart;

    return Response.json({
      summary: {
        projectId: project_id, totalTasks: tasks.length, totalPhases: buckets.length,
        tasksChanged, tasksUnchanged, stateDistribution, warnings,
        resolvedAt: now, resolveTimeMs: resolveTime,
        entityReads: 8, // tasks, buckets, statuses, tpLinks, scs, fbReqs, commits, parts
        entityWrites: tasksChanged + phaseRollups.filter((pr, i) => {
          const b = bucketMap.get(pr.bucketId);
          return b && b.phase_status !== pr.phaseStatus;
        }).length,
        depsCleaned: tasks.filter(t => t._cleanedDeps !== undefined).length,
      },
      tasks: taskResults,
      phases: phaseRollups,
      warnings,
      errors: [],
      cycles: cycles.map(c => c.map(id => taskMap.get(id)?.name || id)),
      invalidDependencies: invalidDeps,
    });
  } catch (error) {
    console.error('resolveProjectWorkflow error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});