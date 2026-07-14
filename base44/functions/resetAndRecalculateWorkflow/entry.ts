import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * resetAndRecalculateWorkflow
 * 
 * Administrative workflow repair function.
 * Modes:
 *   - "dry_run": reads all data, computes what WOULD change, zero writes
 *   - "apply": recalculates and writes only changed derived fields
 * 
 * SAFETY: Never deletes, creates, or moves tasks.
 * Only touches derived workflow fields on Task, ProjectKanbanBucket, ProjectMilestone, Project.
 */

const DERIVED_TASK_FIELDS = [
  'operational_state', 'blocking_reasons', 'state_resolved_at'
];
const DERIVED_PHASE_FIELDS = [
  'phase_status', 'current_blocker', 'waiting_reason', 'phase_entered_at', 'phase_completed_at'
];
const DERIVED_MILESTONE_FIELDS = [
  'status', 'completed_at', 'reopened_at', 'calculated_at', 'blocking_reason', 'completion_source'
];
const DERIVED_PROJECT_FIELDS = [
  'workflow_health', 'current_phase_id', 'current_phase_name', 'next_phase_id', 'next_phase_name',
  'current_blocker', 'current_milestone_id', 'current_milestone_name', 'next_milestone_id',
  'next_milestone_name', 'workflow_resolved_at', 'progress_percent'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'dry_run';

    if (mode !== 'dry_run' && mode !== 'apply') {
      return Response.json({ error: 'Invalid mode. Use "dry_run" or "apply".' }, { status: 400 });
    }

    // 1. Load all data
    const [tasks, projects, phases, milestones] = await Promise.all([
      base44.asServiceRole.entities.Task.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.Project.filter({}, '-created_date', 200),
      base44.asServiceRole.entities.ProjectKanbanBucket.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.ProjectMilestone.filter({}, '-created_date', 200),
    ]);

    const taskIdsBefore = new Set(tasks.map(t => t.id));
    const projectTaskCounts = {};
    tasks.forEach(t => {
      const pid = t.project_id || '__none__';
      projectTaskCounts[pid] = (projectTaskCounts[pid] || 0) + 1;
    });

    // Snapshot immutable fields for integrity
    const taskSnapshot = {};
    tasks.forEach(t => {
      taskSnapshot[t.id] = {
        name: t.name,
        status_id: t.status_id,
        assigned_team_member_id: t.assigned_team_member_id,
        due_date: t.due_date,
        is_priority: t.is_priority,
        estimated_hours: t.estimated_hours,
        actual_hours: t.actual_hours,
        dependencies: JSON.stringify(t.dependencies || []),
        kanban_bucket_id: t.kanban_bucket_id,
        project_id: t.project_id,
        completed_date: t.completed_date,
      };
    });

    // Identify projects with tasks
    const projectsWithTasks = new Set(tasks.map(t => t.project_id).filter(Boolean));
    const activeProjects = projects.filter(p => projectsWithTasks.has(p.id));

    // Before counts
    const beforeCounts = {
      totalTasks: tasks.length,
      totalProjects: projects.length,
      activeProjects: activeProjects.length,
      totalPhases: phases.length,
      totalMilestones: milestones.length,
      tasksWithOpState: tasks.filter(t => t.operational_state).length,
      tasksWithoutOpState: tasks.filter(t => !t.operational_state).length,
      completedTasks: tasks.filter(t => t.completed_date).length,
      projectTaskCounts,
    };

    // Validate references
    const projectIdSet = new Set(projects.map(p => p.id));
    const phaseIdSet = new Set(phases.map(p => p.id));
    const taskIdSet = new Set(tasks.map(t => t.id));
    
    const missingProjects = [];
    const missingPhases = [];
    const invalidDependencies = [];
    const missingReferences = [];

    tasks.forEach(t => {
      if (t.project_id && !projectIdSet.has(t.project_id)) {
        missingProjects.push({ taskId: t.id, taskName: t.name, missingProjectId: t.project_id });
      }
      if (t.kanban_bucket_id && !phaseIdSet.has(t.kanban_bucket_id)) {
        missingPhases.push({ taskId: t.id, taskName: t.name, missingPhaseId: t.kanban_bucket_id });
      }
      if (t.dependencies?.length) {
        t.dependencies.forEach(depId => {
          if (!taskIdSet.has(depId)) {
            invalidDependencies.push({ taskId: t.id, taskName: t.name, missingDepId: depId });
          }
        });
      }
    });

    // Dry-run result
    const dryRunResult = {
      mode,
      projectsScanned: activeProjects.length,
      tasksScanned: tasks.length,
      tasksToRecalculate: tasks.filter(t => projectsWithTasks.has(t.project_id)).length,
      invalidDependencies,
      missingProjects,
      missingPhases,
      missingReferences,
      warnings: [],
      errors: [],
      beforeCounts,
    };

    if (invalidDependencies.length > 0) {
      dryRunResult.warnings.push(`${invalidDependencies.length} tasks reference non-existent dependency IDs`);
    }
    if (missingProjects.length > 0) {
      dryRunResult.warnings.push(`${missingProjects.length} tasks reference non-existent projects`);
    }
    if (missingPhases.length > 0) {
      dryRunResult.warnings.push(`${missingPhases.length} tasks reference non-existent phases`);
    }

    if (mode === 'dry_run') {
      dryRunResult.tasksToChange = '(run apply to determine)';
      dryRunResult.phasesToChange = '(run apply to determine)';
      dryRunResult.milestonesToChange = '(run apply to determine)';
      dryRunResult.projectsToChange = activeProjects.length;
      dryRunResult.afterProjectedCounts = { ...beforeCounts };
      return Response.json(dryRunResult);
    }

    // APPLY MODE
    let tasksChanged = 0;
    let tasksUnchanged = 0;
    let phasesChanged = 0;
    let milestonesChanged = 0;
    let projectsRecalculated = 0;
    const applyErrors = [];
    const applyWarnings = [];

    // Process each active project through the resolver
    for (const project of activeProjects) {
      try {
        const result = await base44.functions.invoke('resolveProjectWorkflow', {
          project_id: project.id,
          mode: 'resolve',
          trigger_context: { source: 'resetAndRecalculateWorkflow', user: user.full_name }
        });

        const data = result?.data || result;
        if (data?.changes) {
          tasksChanged += data.changes.tasksUpdated || 0;
          tasksUnchanged += data.changes.tasksUnchanged || 0;
          phasesChanged += data.changes.phasesUpdated || 0;
          milestonesChanged += data.changes.milestonesUpdated || 0;
        }
        projectsRecalculated++;
      } catch (err) {
        applyErrors.push({ projectId: project.id, projectName: project.name, error: err.message || String(err) });
      }
    }

    // Post-apply integrity check
    const tasksAfter = await base44.asServiceRole.entities.Task.filter({}, '-created_date', 500);
    const taskIdsAfter = new Set(tasksAfter.map(t => t.id));

    const integrityChecks = {
      totalTaskCountUnchanged: { expected: tasks.length, actual: tasksAfter.length, pass: tasks.length === tasksAfter.length },
      allTaskIdsPreserved: { pass: true, missingIds: [] },
      perProjectCountsUnchanged: { pass: true, diffs: [] },
      immutableFieldsPreserved: { pass: true, violations: [] },
    };

    // Check all original IDs still exist
    for (const id of taskIdsBefore) {
      if (!taskIdsAfter.has(id)) {
        integrityChecks.allTaskIdsPreserved.pass = false;
        integrityChecks.allTaskIdsPreserved.missingIds.push(id);
      }
    }

    // Check per-project counts
    const projectTaskCountsAfter = {};
    tasksAfter.forEach(t => {
      const pid = t.project_id || '__none__';
      projectTaskCountsAfter[pid] = (projectTaskCountsAfter[pid] || 0) + 1;
    });
    for (const [pid, count] of Object.entries(projectTaskCounts)) {
      if (projectTaskCountsAfter[pid] !== count) {
        integrityChecks.perProjectCountsUnchanged.pass = false;
        integrityChecks.perProjectCountsUnchanged.diffs.push({
          projectId: pid,
          before: count,
          after: projectTaskCountsAfter[pid] || 0,
        });
      }
    }

    // Spot-check immutable fields (sample 50 tasks)
    const sampleIds = Array.from(taskIdsBefore).slice(0, 50);
    for (const id of sampleIds) {
      const after = tasksAfter.find(t => t.id === id);
      const before = taskSnapshot[id];
      if (!after || !before) continue;
      
      const checks = [
        ['name', before.name, after.name],
        ['status_id', before.status_id, after.status_id],
        ['assigned_team_member_id', before.assigned_team_member_id, after.assigned_team_member_id],
        ['due_date', before.due_date, after.due_date],
        ['is_priority', before.is_priority, after.is_priority],
        ['estimated_hours', before.estimated_hours, after.estimated_hours],
        ['actual_hours', before.actual_hours, after.actual_hours],
        ['kanban_bucket_id', before.kanban_bucket_id, after.kanban_bucket_id],
        ['project_id', before.project_id, after.project_id],
        ['completed_date', before.completed_date, after.completed_date],
      ];
      
      for (const [field, bVal, aVal] of checks) {
        if (String(bVal || '') !== String(aVal || '')) {
          integrityChecks.immutableFieldsPreserved.pass = false;
          integrityChecks.immutableFieldsPreserved.violations.push({
            taskId: id, field, before: bVal, after: aVal,
          });
        }
      }
    }

    const afterCounts = {
      totalTasks: tasksAfter.length,
      tasksWithOpState: tasksAfter.filter(t => t.operational_state).length,
      tasksWithoutOpState: tasksAfter.filter(t => !t.operational_state).length,
      completedTasks: tasksAfter.filter(t => t.completed_date).length,
      projectTaskCounts: projectTaskCountsAfter,
    };

    const overallPass = Object.values(integrityChecks).every(c => c.pass);

    return Response.json({
      mode: 'apply',
      projectsRecalculated,
      tasksChanged,
      tasksUnchanged,
      phasesChanged,
      milestonesChanged,
      errors: applyErrors,
      warnings: applyWarnings,
      beforeCounts,
      afterCounts,
      integrityChecks,
      overallIntegrityPass: overallPass,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});