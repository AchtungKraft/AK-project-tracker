import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const dryRun = body.dry_run !== false; // default true
    const repair = body.repair === true;
    const projectId = body.project_id || null; // optional scope

    // Fetch tasks
    let tasks;
    if (projectId) {
      tasks = await base44.asServiceRole.entities.Task.filter({ project_id: projectId });
    } else {
      tasks = await base44.asServiceRole.entities.Task.list('-created_date', 500);
    }

    // Fetch all time entries
    let allEntries;
    if (projectId) {
      allEntries = await base44.asServiceRole.entities.TaskTimeEntry.filter({ project_id: projectId });
    } else {
      allEntries = await base44.asServiceRole.entities.TaskTimeEntry.list('-created_date', 500);
    }

    // Build map: taskId → sum of entry hours
    const entryHoursByTask = {};
    const entryCountByTask = {};
    for (const e of allEntries) {
      const tid = e.task_id;
      entryHoursByTask[tid] = (entryHoursByTask[tid] || 0) + (Number(e.hours) || 0);
      entryCountByTask[tid] = (entryCountByTask[tid] || 0) + 1;
    }

    let tasksReviewed = 0;
    let tasksWithEntries = 0;
    let tasksMatching = 0;
    let tasksMismatched = 0;
    let totalCanonical = 0;
    let totalLegacy = 0;
    let tasksRepaired = 0;
    const mismatches = [];

    const repairs = [];

    for (const task of tasks) {
      tasksReviewed++;
      const canonical = Math.round((entryHoursByTask[task.id] || 0) * 100) / 100;
      const legacy = Math.round((Number(task.actual_hours) || 0) * 100) / 100;
      const hasEntries = (entryCountByTask[task.id] || 0) > 0;

      if (hasEntries) tasksWithEntries++;
      totalCanonical += canonical;
      totalLegacy += legacy;

      if (canonical === legacy) {
        tasksMatching++;
      } else {
        tasksMismatched++;
        const diff = Math.round((canonical - legacy) * 100) / 100;
        mismatches.push({
          taskId: task.id,
          taskName: task.name,
          canonicalHours: canonical,
          legacyHours: legacy,
          difference: diff,
          entryCount: entryCountByTask[task.id] || 0,
        });

        if (repair && !dryRun) {
          repairs.push(
            base44.asServiceRole.entities.Task.update(task.id, { actual_hours: canonical })
          );
          tasksRepaired++;
        }
      }
    }

    if (repairs.length > 0) {
      // Batch in groups of 20
      for (let i = 0; i < repairs.length; i += 20) {
        await Promise.all(repairs.slice(i, i + 20));
      }
    }

    return Response.json({
      mode: dryRun ? 'dry_run' : (repair ? 'repair' : 'audit'),
      scope: projectId || 'all',
      tasksReviewed,
      tasksWithEntries,
      tasksMatching,
      tasksMismatched,
      totalCanonicalHours: Math.round(totalCanonical * 100) / 100,
      totalLegacyHours: Math.round(totalLegacy * 100) / 100,
      totalDifference: Math.round((totalCanonical - totalLegacy) * 100) / 100,
      tasksRepaired,
      mismatches: mismatches.slice(0, 50), // Cap output
      mismatchesTruncated: mismatches.length > 50,
    });
  } catch (error) {
    console.error('reconcileTaskTimeEntries error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});