import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const RESOLVER_VERSION = 2;

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

// ── Task Operational State Constants ──
const S = {
  NOT_STARTED: 'NOT_STARTED', READY: 'READY', IN_PROGRESS: 'IN_PROGRESS',
  WAITING_ON_PARTS: 'WAITING_ON_PARTS', WAITING_ON_VENDOR: 'WAITING_ON_VENDOR',
  WAITING_ON_CUSTOMER: 'WAITING_ON_CUSTOMER', BLOCKED: 'BLOCKED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED',
};

// ── Phase Status Constants (centralized — single source of truth) ──
const PS = {
  NOT_CONFIGURED: 'not_configured',
  NOT_STARTED: 'not_started',
  READY: 'ready',
  ACTIVE: 'active',
  WAITING: 'waiting',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
};
const ALL_PHASE_STATES = Object.values(PS);

// ── Milestone Status Constants (centralized — single source of truth) ──
const MS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  WAITING: 'waiting',
  COMPLETED: 'completed',
  REOPENED: 'reopened',
  SKIPPED: 'skipped',
  CONFIGURATION_ERROR: 'configuration_error',
};

// ── Blocker Type Precedence (highest priority first) ──
const BLOCKER_PRECEDENCE = [
  'DATA_CONFIGURATION', 'CUSTOMER_APPROVAL', 'VENDOR',
  'PART', 'PURCHASE_ORDER', 'PHASE', 'DEPENDENCY',
  'MANUAL_HOLD',
];

function blockerPriority(type) {
  const idx = BLOCKER_PRECEDENCE.indexOf(type);
  return idx >= 0 ? idx : BLOCKER_PRECEDENCE.length;
}

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

// ── Milestone Cycle Detection ──
function detectMilestoneCycles(milestones) {
  const milestoneMap = new Map();
  milestones.forEach(m => milestoneMap.set(m.id, m));
  const visited = new Set();
  const inStack = new Set();
  const cycles = [];
  function dfs(id, path) {
    if (inStack.has(id)) { cycles.push([...path, id]); return; }
    if (visited.has(id)) return;
    visited.add(id); inStack.add(id);
    const m = milestoneMap.get(id);
    if (m?.depends_on_milestones) {
      for (const depId of m.depends_on_milestones) {
        if (milestoneMap.has(depId)) dfs(depId, [...path, id]);
      }
    }
    inStack.delete(id);
  }
  for (const id of milestoneMap.keys()) dfs(id, []);
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

// ── Phase Metrics ──
function phaseMetrics(bucket, tasks, statusMap) {
  const pt = tasks.filter(t => t.kanban_bucket_id === bucket.id);
  const req = pt.filter(t => t.is_phase_required !== false);
  const cancelled = pt.filter(t => statusMap.cancelledIds.has(t.status_id));
  const nonCancelled = pt.filter(t => !statusMap.cancelledIds.has(t.status_id));
  const done = pt.filter(t => statusMap.doneIds.has(t.status_id));
  const ready = pt.filter(t => t._rs?.state === S.READY);
  const ip = pt.filter(t => t._rs?.state === S.IN_PROGRESS || t._rs?.state === S.REVIEW_REQUIRED);
  const waiting = pt.filter(t => [S.WAITING_ON_PARTS, S.WAITING_ON_VENDOR, S.WAITING_ON_CUSTOMER].includes(t._rs?.state));
  const blocked = pt.filter(t => t._rs?.state === S.BLOCKED);
  const wp = pt.filter(t => t._rs?.state === S.WAITING_ON_PARTS);
  const wv = pt.filter(t => t._rs?.state === S.WAITING_ON_VENDOR);
  const wc = pt.filter(t => t._rs?.state === S.WAITING_ON_CUSTOMER);
  const est = nonCancelled.reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const act = nonCancelled.reduce((s, t) => s + (t._canonicalHours || 0), 0);
  const rem = nonCancelled.filter(t => !statusMap.doneIds.has(t.status_id)).reduce((s, t) => s + Math.max((t.estimated_hours || 0) - (t._canonicalHours || 0), 0), 0);
  const reqNonCancelled = req.filter(t => !statusMap.cancelledIds.has(t.status_id));
  const reqDone = reqNonCancelled.filter(t => statusMap.doneIds.has(t.status_id)).length;
  const pct = reqNonCancelled.length > 0 ? Math.round((reqDone / reqNonCancelled.length) * 100) : 0;
  const isComplete = reqNonCancelled.length > 0 && reqDone === reqNonCancelled.length;

  return {
    totalTaskCount: pt.length, requiredTaskCount: req.length, completedTaskCount: done.length,
    cancelledTaskCount: cancelled.length,
    readyTaskCount: ready.length, inProgressTaskCount: ip.length,
    blockedTaskCount: blocked.length + waiting.length,
    waitingOnPartsCount: wp.length, waitingOnVendorCount: wv.length, waitingOnCustomerCount: wc.length,
    estimatedHours: est, actualHours: act, remainingHours: Math.max(rem, 0), completionPercent: pct,
    isComplete, tasks: pt,
  };
}

// ── Aggregate Blocker Selection ──
// Returns structured {currentBlocker, blockers[]} with precedence-based dominant selection
function aggregateBlockers(tasks) {
  const blockerMap = new Map(); // type → { type, labels[], taskCount }
  for (const t of tasks) {
    if (!t._rs?.reasons?.length) continue;
    for (const r of t._rs.reasons) {
      if (!blockerMap.has(r.type)) {
        blockerMap.set(r.type, { type: r.type, labels: new Set(), taskCount: 0 });
      }
      const entry = blockerMap.get(r.type);
      entry.labels.add(r.label);
      entry.taskCount++;
    }
  }

  const blockers = [...blockerMap.values()]
    .sort((a, b) => blockerPriority(a.type) - blockerPriority(b.type))
    .map(b => ({
      type: b.type,
      label: [...b.labels][0],
      taskCount: b.taskCount,
    }));

  const dominant = blockers[0] || null;
  return {
    currentBlocker: dominant ? { type: dominant.type, label: dominant.label } : null,
    currentBlockerText: dominant?.label || null,
    blockers,
  };
}

// ── Phase State Engine ──
// Precedence: SKIPPED > COMPLETED > ACTIVE > READY > WAITING > BLOCKED > NOT_STARTED > NOT_CONFIGURED
function resolvePhaseState(bucket, metrics, phaseOrder) {
  // No tasks = not configured
  if (metrics.totalTaskCount === 0) return { status: PS.NOT_CONFIGURED, waitingReason: null, currentBlocker: null, blockers: [] };

  // Skipped: optional phase with no required non-cancelled tasks
  const reqNonCancelled = metrics.tasks.filter(t => t.is_phase_required !== false && t._rs?.state !== S.CANCELLED);
  if (bucket.is_required === false && reqNonCancelled.length === 0) {
    return { status: PS.SKIPPED, waitingReason: null, currentBlocker: null, blockers: [] };
  }

  // Completed: all required non-cancelled tasks done
  if (metrics.isComplete) return { status: PS.COMPLETED, waitingReason: null, currentBlocker: null, blockers: [] };

  // Aggregate blockers from non-completed/non-cancelled tasks
  const actionableTasks = metrics.tasks.filter(t => t._rs && t._rs.state !== S.COMPLETED && t._rs.state !== S.CANCELLED);
  const { currentBlocker, currentBlockerText, blockers } = aggregateBlockers(actionableTasks);

  const hasIP = metrics.inProgressTaskCount > 0;

  // ACTIVE: at least one task in progress/review — STAYS active even with blockers
  // But expose the blockers so the UI can show "Active — Waiting on Bearings"
  if (hasIP) {
    return {
      status: PS.ACTIVE,
      waitingReason: currentBlockerText,
      currentBlocker,
      blockers,
    };
  }

  // READY: no tasks in progress but at least one task is ready
  if (metrics.readyTaskCount > 0) {
    return {
      status: PS.READY,
      waitingReason: blockers.length > 0 ? currentBlockerText : null,
      currentBlocker: blockers.length > 0 ? currentBlocker : null,
      blockers,
    };
  }

  // Determine waiting vs blocked from blocker types
  const waitingTypes = new Set(['PART', 'PURCHASE_ORDER', 'VENDOR', 'CUSTOMER_APPROVAL', 'PHASE']);
  const isWaiting = blockers.some(b => waitingTypes.has(b.type));

  if (isWaiting) {
    return { status: PS.WAITING, waitingReason: currentBlockerText, currentBlocker, blockers };
  }

  if (blockers.length > 0) {
    return { status: PS.BLOCKED, waitingReason: currentBlockerText, currentBlocker, blockers };
  }

  // Check manual activation
  const mode = bucket.progression_mode || 'dependency_driven';
  if (mode === 'manual' && bucket.is_active === false) {
    const manualBlocker = { type: 'PHASE', label: 'Waiting on Manual Activation' };
    return { status: PS.WAITING, waitingReason: manualBlocker.label, currentBlocker: manualBlocker, blockers: [{ ...manualBlocker, taskCount: metrics.totalTaskCount }] };
  }

  // Sequential mode check
  if (mode === 'sequential') {
    for (const prev of phaseOrder) {
      if (prev.project_id !== bucket.project_id) continue;
      if ((prev.order || 0) >= (bucket.order || 0)) continue;
      if (prev.is_required === false) continue;
      if (prev._status !== 'completed') {
        const seqBlocker = { type: 'PHASE', label: 'Phase "' + prev.name + '" not complete' };
        return { status: PS.NOT_STARTED, waitingReason: seqBlocker.label, currentBlocker: seqBlocker, blockers: [{ ...seqBlocker, taskCount: metrics.totalTaskCount }] };
      }
    }
  }

  return { status: PS.NOT_STARTED, waitingReason: null, currentBlocker: null, blockers: [] };
}

// ── Milestone Resolution ──
function resolveMilestones(milestones, phaseMap, taskMap, statusMap, projectId) {
  const milestoneMap = new Map();
  milestones.forEach(m => milestoneMap.set(m.id, m));
  const sorted = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));

  // Detect cycles
  const milestoneCycles = detectMilestoneCycles(milestones);
  const cycleIds = new Set();
  for (const cycle of milestoneCycles) { for (const id of cycle) cycleIds.add(id); }

  const results = [];
  const warnings = [];

  if (milestoneCycles.length > 0) {
    warnings.push({
      type: 'MILESTONE_CYCLE',
      message: milestoneCycles.length + ' circular milestone dependency chain(s) detected',
      details: milestoneCycles.map(c => c.map(id => milestoneMap.get(id)?.name || id).join(' → ')),
    });
  }

  for (const ms of sorted) {
    // Explicitly skipped
    if (ms.status === 'skipped') {
      results.push({
        milestoneId: ms.id, name: ms.name, order: ms.order || 0,
        status: MS.SKIPPED, blockingReason: null, color: ms.color, icon: ms.icon,
        completedAt: null, reopenedAt: null,
      });
      continue;
    }

    // Cycle detection
    if (cycleIds.has(ms.id)) {
      results.push({
        milestoneId: ms.id, name: ms.name, order: ms.order || 0,
        status: MS.CONFIGURATION_ERROR, blockingReason: 'Circular milestone dependency detected',
        color: ms.color, icon: ms.icon, completedAt: null, reopenedAt: null,
      });
      continue;
    }

    let allMet = true;
    let blockingReason = null;
    let hasAnyDeps = false;
    let someProgress = false;
    let isWaiting = false;
    const configErrors = [];

    // Check phase dependencies
    if (ms.depends_on_phases?.length) {
      for (const phaseId of ms.depends_on_phases) {
        hasAnyDeps = true;
        const phase = phaseMap.get(phaseId);
        if (!phase) { configErrors.push('Missing phase: ' + phaseId); allMet = false; continue; }
        if (phase.project_id !== projectId) { configErrors.push('Cross-project phase: ' + phaseId); allMet = false; continue; }
        if (phase._phaseState?.status === PS.COMPLETED) { someProgress = true; }
        else { allMet = false; blockingReason = blockingReason || ('Waiting on phase: ' + phase.name); }
      }
    }

    // Check task dependencies
    if (ms.depends_on_tasks?.length) {
      for (const taskId of ms.depends_on_tasks) {
        hasAnyDeps = true;
        const task = taskMap.get(taskId);
        if (!task) { configErrors.push('Missing task: ' + taskId); allMet = false; continue; }
        if (task.project_id !== projectId) { configErrors.push('Cross-project task: ' + taskId); allMet = false; continue; }
        if (statusMap.doneIds.has(task.status_id)) { someProgress = true; }
        else {
          allMet = false;
          blockingReason = blockingReason || ('Waiting on task: ' + task.name);
          // Check if the blocking task is itself waiting
          const taskState = task._rs?.state;
          if (taskState && [S.WAITING_ON_PARTS, S.WAITING_ON_VENDOR, S.WAITING_ON_CUSTOMER].includes(taskState)) {
            isWaiting = true;
          }
        }
      }
    }

    // Check milestone dependencies
    if (ms.depends_on_milestones?.length) {
      for (const msDepId of ms.depends_on_milestones) {
        hasAnyDeps = true;
        if (!milestoneMap.has(msDepId)) { configErrors.push('Missing milestone: ' + msDepId); allMet = false; continue; }
        const depMs = milestoneMap.get(msDepId);
        if (depMs.project_id !== projectId) { configErrors.push('Cross-project milestone: ' + msDepId); allMet = false; continue; }
        const depResult = results.find(r => r.milestoneId === msDepId);
        if (depResult?.status === MS.COMPLETED) { someProgress = true; }
        else {
          allMet = false;
          blockingReason = blockingReason || ('Waiting on milestone: ' + (depMs.name || msDepId));
        }
      }
    }

    // Configuration errors
    if (configErrors.length > 0) {
      warnings.push({ type: 'MILESTONE_CONFIG', message: 'Milestone "' + ms.name + '": ' + configErrors.join('; ') });
    }

    // Determine status
    let status;
    let reopenedAt = null;

    if (configErrors.length > 0) {
      status = MS.CONFIGURATION_ERROR;
    } else if (!hasAnyDeps) {
      // No deps = stays at current status (manual only) or not_started
      status = ms.status === 'completed' ? MS.COMPLETED : MS.NOT_STARTED;
    } else if (allMet) {
      status = MS.COMPLETED;
      // Check for reopening: was completed before but now re-completed is fine
    } else {
      // Was previously completed but prerequisites no longer met → REOPENED
      if (ms.status === 'completed' || ms.status === 'reopened') {
        status = MS.REOPENED;
        reopenedAt = new Date().toISOString();
      } else if (isWaiting) {
        status = MS.WAITING;
      } else if (someProgress) {
        status = MS.IN_PROGRESS;
      } else {
        status = MS.NOT_STARTED;
      }
    }

    results.push({
      milestoneId: ms.id, name: ms.name, order: ms.order || 0,
      status, blockingReason: status !== MS.COMPLETED && status !== MS.SKIPPED ? blockingReason : null,
      color: ms.color, icon: ms.icon,
      completedAt: status === MS.COMPLETED ? (ms.completed_at || new Date().toISOString()) : null,
      reopenedAt: status === MS.REOPENED ? reopenedAt : (ms.reopened_at || null),
    });
  }

  return { results, warnings };
}

// ── Project Health & Current/Next Phase ──
function deriveProjectHealth(phaseRollups, milestoneResults, tasks, statusMap, projectId, canonicalHoursByTask = {}, canonicalTotalHours = 0) {
  const orderedPhases = [...phaseRollups].sort((a, b) => (a.order || 0) - (b.order || 0));

  // Active phases = all phases with status ACTIVE
  const activePhases = orderedPhases
    .filter(p => p.phaseStatus === PS.ACTIVE)
    .map(p => ({ id: p.bucketId, name: p.bucketName }));

  // Current phase: first active, else first ready, else first waiting/blocked, else last completed
  let currentPhase = null;
  let nextPhase = null;
  const incomplete = orderedPhases.filter(p =>
    p.phaseStatus !== PS.NOT_CONFIGURED && p.phaseStatus !== PS.SKIPPED && p.phaseStatus !== PS.COMPLETED
  );

  if (activePhases.length > 0) {
    currentPhase = activePhases[0];
    // Next = first non-complete phase after current
    const currentIdx = orderedPhases.findIndex(p => p.bucketId === currentPhase.id);
    for (let i = currentIdx + 1; i < orderedPhases.length; i++) {
      const p = orderedPhases[i];
      if (p.phaseStatus !== PS.COMPLETED && p.phaseStatus !== PS.SKIPPED && p.phaseStatus !== PS.NOT_CONFIGURED) {
        nextPhase = { id: p.bucketId, name: p.bucketName };
        break;
      }
    }
  } else if (incomplete.length > 0) {
    currentPhase = { id: incomplete[0].bucketId, name: incomplete[0].bucketName };
    if (incomplete.length > 1) nextPhase = { id: incomplete[1].bucketId, name: incomplete[1].bucketName };
  } else {
    // All complete — use last completed phase
    const completed = orderedPhases.filter(p => p.phaseStatus === PS.COMPLETED);
    if (completed.length > 0) currentPhase = { id: completed[completed.length - 1].bucketId, name: completed[completed.length - 1].bucketName };
  }

  // Aggregate all blockers across phases
  const allActiveTasksWithReasons = tasks.filter(t => t._rs && t._rs.state !== S.COMPLETED && t._rs.state !== S.CANCELLED);
  const { currentBlocker, currentBlockerText, blockers } = aggregateBlockers(allActiveTasksWithReasons);

  // Milestones
  const requiredMilestones = milestoneResults.filter(m => m.status !== MS.SKIPPED);
  const completedMilestones = requiredMilestones.filter(m => m.status === MS.COMPLETED);
  const pendingMilestones = requiredMilestones.filter(m => m.status !== MS.COMPLETED);
  const currentMilestone = completedMilestones.length > 0 ? completedMilestones[completedMilestones.length - 1] : null;
  const nextMilestone = pendingMilestones.length > 0 ? pendingMilestones[0] : null;

  // Task health — with estimated/unestimated labor split
  const nonCancelled = tasks.filter(t => !statusMap.cancelledIds.has(t.status_id));
  const estimatedTasks = nonCancelled.filter(t => (t.estimated_hours || 0) > 0);
  const unestimatedTasks = nonCancelled.filter(t => !(t.estimated_hours > 0));
  const hoursEstimated = estimatedTasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
  const hoursLoggedEstimatedTasks = Math.round(estimatedTasks.reduce((s, t) => s + (canonicalHoursByTask[t.id] || 0), 0) * 100) / 100;
  const hoursLoggedUnestimatedTasks = Math.round(unestimatedTasks.reduce((s, t) => s + (canonicalHoursByTask[t.id] || 0), 0) * 100) / 100;
  const health = {
    tasks_ready: tasks.filter(t => t._rs?.state === S.READY).length,
    tasks_blocked: tasks.filter(t => t._rs?.state === S.BLOCKED).length,
    tasks_waiting: tasks.filter(t => [S.WAITING_ON_PARTS, S.WAITING_ON_VENDOR, S.WAITING_ON_CUSTOMER].includes(t._rs?.state)).length,
    tasks_in_progress: tasks.filter(t => t._rs?.state === S.IN_PROGRESS || t._rs?.state === S.REVIEW_REQUIRED).length,
    tasks_completed: tasks.filter(t => t._rs?.state === S.COMPLETED).length,
    hours_estimated: hoursEstimated,
    hours_actual: canonicalTotalHours,
    hours_logged_estimated_tasks: hoursLoggedEstimatedTasks,
    hours_logged_unestimated_tasks: hoursLoggedUnestimatedTasks,
    hours_variance_estimated_tasks: Math.round((hoursLoggedEstimatedTasks - hoursEstimated) * 100) / 100,
    hours_remaining: nonCancelled.filter(t => !statusMap.doneIds.has(t.status_id)).reduce((s, t) => s + Math.max((t.estimated_hours || 0) - (canonicalHoursByTask[t.id] || 0), 0), 0),
  };

  // Workflow completion check
  const allRequiredPhasesComplete = orderedPhases
    .filter(p => p.isRequired !== false && p.phaseStatus !== PS.NOT_CONFIGURED)
    .every(p => p.phaseStatus === PS.COMPLETED || p.phaseStatus === PS.SKIPPED);
  const allRequiredMilestonesComplete = requiredMilestones.length === 0 ||
    requiredMilestones.every(m => m.status === MS.COMPLETED || m.status === MS.SKIPPED);
  const workflowComplete = allRequiredPhasesComplete && allRequiredMilestonesComplete && health.tasks_ready === 0 && health.tasks_in_progress === 0 && health.tasks_blocked === 0 && health.tasks_waiting === 0;

  return {
    projectId,
    currentPhase,
    activePhases,
    nextPhase,
    currentBlocker,
    currentBlockerText,
    blockers,
    currentMilestone: currentMilestone ? { id: currentMilestone.milestoneId, name: currentMilestone.name } : null,
    nextMilestone: nextMilestone ? { id: nextMilestone.milestoneId, name: nextMilestone.name, blockingReason: nextMilestone.blockingReason } : null,
    health,
    requiredMilestonesCompleted: completedMilestones.length,
    requiredMilestonesTotal: requiredMilestones.length,
    workflowComplete,
    calculatedAt: new Date().toISOString(),
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
    const triggerContext = body.trigger_context || null; // { entity_type, entity_id, event_type }
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // ── MODE: READ — return persisted state ──
    if (mode === 'read') {
      const [tasks, buckets, milestones, project] = await Promise.all([
        base44.asServiceRole.entities.Task.filter({ project_id }),
        base44.asServiceRole.entities.ProjectKanbanBucket.filter({ project_id }),
        base44.asServiceRole.entities.ProjectMilestone.filter({ project_id }),
        base44.asServiceRole.entities.Project.get(project_id),
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
          currentBlocker: b.current_blocker ? (typeof b.current_blocker === 'string' ? { type: 'UNKNOWN', label: b.current_blocker } : b.current_blocker) : null,
          currentBlockerText: b.current_blocker ? (typeof b.current_blocker === 'string' ? b.current_blocker : b.current_blocker?.label) : null,
          blockers: [],
          totalTaskCount: pt.length, requiredTaskCount: req.length,
          completedTaskCount: pt.filter(t => t.operational_state === S.COMPLETED).length,
          readyTaskCount: pt.filter(t => t.operational_state === S.READY).length,
          inProgressTaskCount: pt.filter(t => t.operational_state === S.IN_PROGRESS || t.operational_state === S.REVIEW_REQUIRED).length,
          blockedTaskCount: pt.filter(t => [S.BLOCKED, S.WAITING_ON_PARTS, S.WAITING_ON_VENDOR, S.WAITING_ON_CUSTOMER].includes(t.operational_state)).length,
          waitingOnPartsCount: pt.filter(t => t.operational_state === S.WAITING_ON_PARTS).length,
          waitingOnVendorCount: pt.filter(t => t.operational_state === S.WAITING_ON_VENDOR).length,
          waitingOnCustomerCount: pt.filter(t => t.operational_state === S.WAITING_ON_CUSTOMER).length,
          estimatedHours: nonCancelled.reduce((s, t) => s + (t.estimated_hours || 0), 0),
          actualHours: nonCancelled.reduce((s, t) => s + (t.actual_hours || 0), 0), // Read mode uses persisted values
          remainingHours: nonCancelled.filter(t => t.operational_state !== S.COMPLETED).reduce((s, t) => s + Math.max((t.estimated_hours || 0) - (t.actual_hours || 0), 0), 0),
          completionPercent: reqNonCancelled.length > 0 ? Math.round((reqDone / reqNonCancelled.length) * 100) : 0,
        };
      });

      const milestoneResults = milestones.sort((a, b) => (a.order || 0) - (b.order || 0)).map(m => ({
        milestoneId: m.id, name: m.name, order: m.order || 0,
        status: m.status || MS.NOT_STARTED, blockingReason: m.blocking_reason || null,
        color: m.color, icon: m.icon, completedAt: m.completed_at || null,
        reopenedAt: m.reopened_at || null,
      }));

      const hasState = tasks.some(t => t.operational_state);
      return Response.json({
        summary: { projectId: project_id, totalTasks: tasks.length, totalPhases: buckets.length, totalMilestones: milestones.length, stateDistribution, warnings: [], resolvedAt: project?.workflow_resolved_at || null },
        tasks: taskResults, phases: phaseSummaries, milestones: milestoneResults,
        projectHealth: {
          projectId: project_id,
          currentPhase: project?.current_phase_id ? { id: project.current_phase_id, name: project.current_phase_name } : null,
          activePhases: [],
          nextPhase: project?.next_phase_id ? { id: project.next_phase_id, name: project.next_phase_name } : null,
          currentBlocker: project?.current_blocker ? { type: 'UNKNOWN', label: project.current_blocker } : null,
          currentBlockerText: project?.current_blocker || null,
          blockers: [],
          currentMilestone: project?.current_milestone_id ? { id: project.current_milestone_id, name: project.current_milestone_name } : null,
          nextMilestone: project?.next_milestone_id ? { id: project.next_milestone_id, name: project.next_milestone_name } : null,
          health: project?.workflow_health || null,
          requiredMilestonesCompleted: milestoneResults.filter(m => m.status === MS.COMPLETED).length,
          requiredMilestonesTotal: milestoneResults.filter(m => m.status !== MS.SKIPPED).length,
          workflowComplete: false,
          calculatedAt: project?.workflow_resolved_at || null,
        },
        warnings: !hasState ? [{ type: 'STALE_DATA', message: 'Workflow has not been calculated yet. Click Recalculate.' }] : [],
        needsRecalculation: !hasState,
      });
    }

    // ── MODE: RESOLVE — full recalculation ──
    const resolveStart = Date.now();
    const [tasks, buckets, statusList, tpLinks, scs, fbReqs, commits, parts, milestones, timeEntries] = await Promise.all([
      base44.asServiceRole.entities.Task.filter({ project_id }),
      base44.asServiceRole.entities.ProjectKanbanBucket.filter({ project_id }),
      base44.asServiceRole.entities.StatusList.list(),
      base44.asServiceRole.entities.TaskPartLink.filter({ project_id }),
      base44.asServiceRole.entities.ServiceCommitment.filter({ project_id }),
      base44.asServiceRole.entities.ClientFeedbackRequest.filter({ project_id }),
      base44.asServiceRole.entities.PartCommitment.filter({ project_id }),
      base44.asServiceRole.entities.Part.list('-created_date', 500),
      base44.asServiceRole.entities.ProjectMilestone.filter({ project_id }),
      base44.asServiceRole.entities.TaskTimeEntry.filter({ project_id }),
    ]);

    // Build canonical hours_actual from time entries (single sum, no N+1)
    const canonicalHoursByTask = {};
    for (const e of timeEntries) {
      if (e.task_id) {
        canonicalHoursByTask[e.task_id] = (canonicalHoursByTask[e.task_id] || 0) + (Number(e.hours) || 0);
      }
    }
    const canonicalTotalHours = Math.round(timeEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0) * 100) / 100;

    // Attach canonical hours to each task for phase metrics
    for (const t of tasks) {
      t._canonicalHours = Math.round((canonicalHoursByTask[t.id] || 0) * 100) / 100;
    }

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
      const phaseState = resolvePhaseState(b, metrics, phaseOrder);
      b._phaseState = phaseState;
      return {
        bucketId: b.id, bucketName: b.name, order: b.order, color: b.color,
        progressionMode: b.progression_mode || 'dependency_driven',
        isRequired: b.is_required !== false, isActive: b.is_active !== false,
        phaseStatus: phaseState.status,
        waitingReason: phaseState.waitingReason,
        currentBlocker: phaseState.currentBlocker,
        currentBlockerText: phaseState.currentBlocker?.label || null,
        blockers: phaseState.blockers,
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
    const { results: milestoneResults, warnings: msWarnings } = resolveMilestones(milestones, bucketMap, taskMap, statusMap, project_id);
    warnings.push(...msWarnings);

    // ── Project Health ──
    const projectHealthData = deriveProjectHealth(phaseRollups, milestoneResults, tasks, statusMap, project_id, canonicalHoursByTask, canonicalTotalHours);

    // ── Persist ──
    let tasksChanged = 0;
    let tasksUnchanged = 0;
    let phasesChanged = 0;
    let milestonesChanged = 0;
    let projectChanged = false;
    const phaseTransitions = [];
    if (!dry_run) {
      const updates = [];

      // Task updates — only write changed records
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

      // Phase updates — only write changed records
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
        const oldWaiting = b.waiting_reason || null;
        const newWaiting = pr.waitingReason || null;
        if (oldWaiting !== newWaiting) { phaseUpdate.waiting_reason = newWaiting || ''; changed = true; }
        // Store blocker as text for entity persistence (structured form only in API response)
        const oldBlocker = b.current_blocker || null;
        const newBlockerText = pr.currentBlocker?.label || null;
        if (oldBlocker !== newBlockerText) { phaseUpdate.current_blocker = newBlockerText || ''; changed = true; }
        if (changed) { phasesChanged++; updates.push(base44.asServiceRole.entities.ProjectKanbanBucket.update(pr.bucketId, phaseUpdate)); }
      }

      // Milestone updates — only write changed records
      for (const mr of milestoneResults) {
        const ms = milestones.find(m => m.id === mr.milestoneId);
        if (!ms) continue;
        const msUpdate = {};
        let changed = false;
        const oldStatus = ms.status || MS.NOT_STARTED;
        if (oldStatus !== mr.status) {
          msUpdate.status = mr.status;
          if (mr.status === MS.COMPLETED && !ms.completed_at) { msUpdate.completed_at = now; msUpdate.completion_source = 'automatic'; }
          if (mr.status === MS.REOPENED) { msUpdate.reopened_at = now; msUpdate.completed_at = ''; }
          changed = true;
          milestonesChanged++;
        }
        if ((ms.blocking_reason || null) !== (mr.blockingReason || null)) { msUpdate.blocking_reason = mr.blockingReason || ''; changed = true; }
        if (changed) {
          msUpdate.calculated_at = now;
          updates.push(base44.asServiceRole.entities.ProjectMilestone.update(mr.milestoneId, msUpdate));
        }
      }

      // Project health update — only write if values actually changed
      const ph = projectHealthData;
      const project = await base44.asServiceRole.entities.Project.get(project_id);
      const projectUpdate = {};
      const projectFields = [
        ['current_phase_id', ph.currentPhase?.id || ''],
        ['current_phase_name', ph.currentPhase?.name || ''],
        ['next_phase_id', ph.nextPhase?.id || ''],
        ['next_phase_name', ph.nextPhase?.name || ''],
        ['current_blocker', ph.currentBlockerText || ''],
        ['current_milestone_id', ph.currentMilestone?.id || ''],
        ['current_milestone_name', ph.currentMilestone?.name || ''],
        ['next_milestone_id', ph.nextMilestone?.id || ''],
        ['next_milestone_name', ph.nextMilestone?.name || ''],
      ];
      for (const [key, newVal] of projectFields) {
        if ((project[key] || '') !== newVal) { projectUpdate[key] = newVal; projectChanged = true; }
      }
      // Compare workflow_health object
      const oldHealth = project.workflow_health || {};
      const healthKeys = ['tasks_ready', 'tasks_blocked', 'tasks_waiting', 'tasks_in_progress', 'tasks_completed', 'hours_remaining', 'hours_estimated', 'hours_actual', 'hours_logged_estimated_tasks', 'hours_logged_unestimated_tasks', 'hours_variance_estimated_tasks'];
      for (const hk of healthKeys) {
        if ((oldHealth[hk] || 0) !== (ph.health[hk] || 0)) { projectChanged = true; break; }
      }
      if (projectChanged) {
        projectUpdate.workflow_health = ph.health;
        projectUpdate.workflow_resolved_at = now;
        updates.push(base44.asServiceRole.entities.Project.update(project_id, projectUpdate));
      }

      // Phase transition logs — only genuine state changes
      for (const pt of phaseTransitions) {
        updates.push(base44.asServiceRole.entities.PhaseTransitionLog.create({
          project_id, phase_id: pt.phaseId, phase_name: pt.phaseName,
          from_status: pt.from, to_status: pt.to,
          reason: triggerContext ? ('Triggered by ' + triggerContext.entity_type + ' ' + triggerContext.event_type) : 'Automatic resolution',
          triggered_by: 'automatic',
          trigger_entity_type: triggerContext?.entity_type || 'resolver',
          trigger_entity_id: triggerContext?.entity_id || '',
          resolver_version: RESOLVER_VERSION,
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
        tasksChanged, tasksUnchanged, phasesChanged, milestonesChanged,
        stateDistribution, warnings,
        resolvedAt: now, resolveTimeMs: resolveTime,
        entityReads: 11, entityWrites: tasksChanged + phasesChanged + milestonesChanged + phaseTransitions.length + (projectChanged ? 1 : 0),
        depsCleaned: tasks.filter(t => t._cleanedDeps !== undefined).length,
        phaseTransitions: phaseTransitions.length,
      },
      tasks: taskResults, phases: phaseRollups, milestones: milestoneResults,
      projectHealth: projectHealthData,
      warnings, errors: [],
      transitionsCreated: phaseTransitions,
      calculatedAt: now,
    });
  } catch (error) {
    console.error('resolveProjectWorkflow error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});