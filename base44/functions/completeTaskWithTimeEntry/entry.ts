import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. AUTHENTICATE ──
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { taskId, additionalHours, note, workDate, performedByUserId, checklistItemId } = body;

    if (!taskId) {
      return Response.json({ error: 'taskId is required' }, { status: 400 });
    }

    // ── 2. LOAD TASK (server-derived project_id) ──
    let task = null;
    try {
      const tasks = await base44.asServiceRole.entities.Task.filter({ id: taskId });
      task = tasks[0] || null;
    } catch {
      task = null;
    }
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }
    const projectId = task.project_id;

    // ── 3. FIND COMPLETED STATUS ──
    const allStatuses = await base44.asServiceRole.entities.StatusList.list();
    const taskStatuses = allStatuses.filter(s => s.scope === 'Task' && s.active);
    // Match "Done" or "Complete" or "Completed"
    const completedStatus = taskStatuses.find(s => {
      const l = (s.label || '').toLowerCase();
      return l === 'done' || l.includes('complete');
    });
    if (!completedStatus) {
      return Response.json({ error: 'No completed status found in StatusList' }, { status: 500 });
    }

    // Already completed — idempotent
    if (task.status_id === completedStatus.id) {
      return Response.json({ success: true, alreadyCompleted: true });
    }

    const hours = Number(additionalHours) || 0;

    // ── 4. VALIDATE HOURS + NOTE + PERFORMER ──
    if (hours > 0) {
      const trimmedNote = (note || '').trim();
      if (!trimmedNote) {
        return Response.json({ error: 'A work note is required when logging hours.' }, { status: 400 });
      }
      if (!performedByUserId) {
        return Response.json({ error: 'A performer is required when logging hours.' }, { status: 400 });
      }

      // ── 5. PERFORMER PERMISSION ──
      // Non-admin users can only log time for themselves
      const teamMembers = await base44.asServiceRole.entities.TeamMember.filter({ active: true });
      const myMember = teamMembers.find(m => m.user_id === user.id);
      
      if (user.role !== 'admin') {
        if (myMember && performedByUserId !== myMember.id) {
          return Response.json({ error: 'You can only log time for yourself.' }, { status: 403 });
        }
      }

      // Validate performer exists and is active
      const performer = teamMembers.find(m => m.id === performedByUserId);
      if (!performer) {
        return Response.json({ error: 'Selected performer is not an active team member.' }, { status: 400 });
      }

      // ── 6. CHECKLIST OWNERSHIP ──
      let checklistSnapshot = null;
      if (checklistItemId) {
        const items = await base44.asServiceRole.entities.TaskChecklistItem.filter({ task_id: taskId });
        const item = items.find(i => i.id === checklistItemId);
        if (!item) {
          return Response.json({ error: 'Selected checklist item does not belong to this task.' }, { status: 400 });
        }
        checklistSnapshot = item.title;
      }

      // ── 7. CREATE TIME ENTRY ──
      const entryPayload = {
        task_id: taskId,
        project_id: projectId,
        hours: hours,
        work_date: workDate || new Date().toISOString().slice(0, 10),
        note: trimmedNote,
        team_member_id: performedByUserId,
        performed_by_name: performer.full_name || 'Unknown',
        entry_source: 'TASK_COMPLETION',
      };
      if (checklistItemId) {
        entryPayload.checklist_item_id = checklistItemId;
      }
      if (checklistSnapshot) {
        entryPayload.checklist_item_name_snapshot = checklistSnapshot;
      }

      let createdEntryId = null;
      try {
        const created = await base44.asServiceRole.entities.TaskTimeEntry.create(entryPayload);
        createdEntryId = created.id;
      } catch (err) {
        return Response.json({ error: 'Failed to create time entry. Task remains open.' }, { status: 500 });
      }

      // ── 8. RECALCULATE TOTAL ──
      let totalLogged = 0;
      try {
        const allEntries = await base44.asServiceRole.entities.TaskTimeEntry.filter({ task_id: taskId });
        totalLogged = allEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
      } catch {
        totalLogged = (Number(task.actual_hours) || 0) + hours;
      }

      // ── 9. COMPLETE TASK ──
      try {
        await base44.asServiceRole.entities.Task.update(taskId, {
          status_id: completedStatus.id,
          completed_date: new Date().toISOString(),
          actual_hours: Math.round(totalLogged * 100) / 100,
        });
      } catch (err) {
        // Rollback entry
        if (createdEntryId) {
          try {
            await base44.asServiceRole.entities.TaskTimeEntry.delete(createdEntryId);
          } catch {
            return Response.json({
              error: 'Task update failed. A time entry was created but could not be rolled back.',
              entryId: createdEntryId,
            }, { status: 500 });
          }
        }
        return Response.json({ error: 'Failed to complete task. No changes saved.' }, { status: 500 });
      }

      return Response.json({ success: true, entryId: createdEntryId, totalLogged });
    }

    // ── ZERO-HOUR: Just complete the task, no entry ──
    let totalLogged = 0;
    try {
      const allEntries = await base44.asServiceRole.entities.TaskTimeEntry.filter({ task_id: taskId });
      totalLogged = allEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
    } catch {
      totalLogged = Number(task.actual_hours) || 0;
    }

    // Save zero-hour note as a TaskComment if provided
    const trimmedNote = (note || '').trim();
    if (trimmedNote) {
      try {
        await base44.asServiceRole.entities.TaskComment.create({
          task_id: taskId,
          content: `[Completion Note] ${trimmedNote}`,
          created_by: user.full_name || 'System',
        });
      } catch {
        // Non-blocking — note loss is acceptable
      }
    }

    await base44.asServiceRole.entities.Task.update(taskId, {
      status_id: completedStatus.id,
      completed_date: new Date().toISOString(),
      actual_hours: Math.round(totalLogged * 100) / 100,
    });

    return Response.json({ success: true, entryId: null, totalLogged });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});