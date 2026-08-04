import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const projectId = body.projectId || null; // Optional: migrate a single project

    // Fetch tasks — paginate
    let allTasks = [];
    if (projectId) {
      allTasks = await base44.asServiceRole.entities.Task.filter({ project_id: projectId });
    } else {
      allTasks = await base44.asServiceRole.entities.Task.list('-created_date', 5000);
    }

    // Fetch existing migration entries to check idempotency
    let existingMigrationEntries = [];
    if (projectId) {
      existingMigrationEntries = await base44.asServiceRole.entities.TaskTimeEntry.filter({
        project_id: projectId,
        is_legacy_migration: true,
      });
    } else {
      existingMigrationEntries = await base44.asServiceRole.entities.TaskTimeEntry.filter({
        is_legacy_migration: true,
      });
    }

    // Build set of existing migration keys for idempotency
    const existingKeys = new Set(
      existingMigrationEntries.map(e => e.legacy_migration_key).filter(Boolean)
    );

    // Stats
    const report = {
      totalTasksReviewed: allTasks.length,
      tasksWithLegacyHours: 0,
      tasksMigrated: 0,
      migrationEntriesCreated: 0,
      tasksSkippedAlreadyMigrated: 0,
      tasksWithZeroHours: 0,
      tasksWithInvalidHours: 0,
      tasksWithConflictingFields: 0,
      totalLegacyHoursBefore: 0,
      totalMigratedHoursAfter: 0,
      exceptions: [],
      dryRun,
    };

    const entriesToCreate = [];

    for (const task of allTasks) {
      const actualHours = Number(task.actual_hours);
      const hasActualHours = !isNaN(actualHours) && actualHours > 0;

      if (!hasActualHours) {
        if (task.actual_hours != null && task.actual_hours !== 0 && task.actual_hours !== '') {
          // Invalid/non-numeric value
          const numCheck = Number(task.actual_hours);
          if (isNaN(numCheck)) {
            report.tasksWithInvalidHours++;
            report.exceptions.push({
              taskId: task.id,
              taskName: task.name,
              reason: 'Invalid actual_hours value',
              value: task.actual_hours,
            });
          }
        }
        if (actualHours === 0 || task.actual_hours == null) {
          report.tasksWithZeroHours++;
        }
        continue;
      }

      report.tasksWithLegacyHours++;
      report.totalLegacyHoursBefore += actualHours;

      // Idempotency check
      const migrationKey = `task-hours-migration:${task.id}:actual_hours`;
      if (existingKeys.has(migrationKey)) {
        report.tasksSkippedAlreadyMigrated++;
        // Count already-migrated hours toward total
        const existingEntry = existingMigrationEntries.find(e => e.legacy_migration_key === migrationKey);
        if (existingEntry) {
          report.totalMigratedHoursAfter += Number(existingEntry.hours) || 0;
        }
        continue;
      }

      // Determine best work_date
      let workDate = null;
      if (task.completed_date) {
        const d = new Date(task.completed_date);
        if (!isNaN(d.getTime())) {
          workDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }
      if (!workDate && task.updated_date) {
        const d = new Date(task.updated_date);
        if (!isNaN(d.getTime())) {
          workDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }
      if (!workDate && task.created_date) {
        const d = new Date(task.created_date);
        if (!isNaN(d.getTime())) {
          workDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }
      if (!workDate) {
        const now = new Date();
        workDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      }

      // Determine performer
      let performerId = null;
      let performerName = 'Legacy Migration';

      if (task.completed_by_user_id) {
        performerId = task.completed_by_user_id;
      } else if (task.assigned_team_member_id) {
        performerId = task.assigned_team_member_id;
      }

      const entryData = {
        task_id: task.id,
        project_id: task.project_id,
        hours: actualHours,
        work_date: workDate,
        note: 'Legacy task hours migrated from the previous actual-hours field.',
        team_member_id: performerId,
        performed_by_name: performerName,
        entry_source: 'LEGACY_MIGRATION',
        is_legacy_migration: true,
        legacy_source_field: 'actual_hours',
        legacy_migration_key: migrationKey,
      };

      entriesToCreate.push(entryData);
      report.totalMigratedHoursAfter += actualHours;
      report.tasksMigrated++;
    }

    // Execute creation (unless dry run)
    if (!dryRun && entriesToCreate.length > 0) {
      // Batch create in chunks of 50
      for (let i = 0; i < entriesToCreate.length; i += 50) {
        const batch = entriesToCreate.slice(i, i + 50);
        await base44.asServiceRole.entities.TaskTimeEntry.bulkCreate(batch);
      }
      report.migrationEntriesCreated = entriesToCreate.length;
    } else if (dryRun) {
      report.migrationEntriesCreated = 0;
      report.pendingCreations = entriesToCreate.length;
    }

    // Reconciliation
    report.difference = Math.round((report.totalLegacyHoursBefore - report.totalMigratedHoursAfter) * 100) / 100;
    report.reconciled = report.difference === 0;

    return Response.json(report);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});