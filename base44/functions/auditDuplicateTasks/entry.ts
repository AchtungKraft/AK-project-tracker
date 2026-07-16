import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json().catch(() => ({}));

    // Fetch tasks — optionally scoped to a project
    const query = project_id ? { project_id } : {};
    const tasks = await base44.asServiceRole.entities.Task.filter(query);

    // Normalize title for comparison
    const normalize = (s) => (s || "").toLowerCase().trim().replace(/\s+/g, ' ');

    // Group by project → normalized name
    const byProject = {};
    for (const task of tasks) {
      const pid = task.project_id || '__none__';
      if (!byProject[pid]) byProject[pid] = {};
      const key = normalize(task.name);
      if (!key) continue;
      if (!byProject[pid][key]) byProject[pid][key] = [];
      byProject[pid][key].push(task);
    }

    // Find duplicates
    const duplicateGroups = [];
    for (const [pid, nameMap] of Object.entries(byProject)) {
      for (const [normalizedName, group] of Object.entries(nameMap)) {
        if (group.length < 2) continue;

        // Score similarity within the group
        const representative = group[0];
        const matchDetails = [];
        for (const t of group) {
          const matches = [];
          if (t.kanban_bucket_id && t.kanban_bucket_id === representative.kanban_bucket_id) matches.push('same_phase');
          if (t.due_date && t.due_date === representative.due_date) matches.push('same_due_date');
          if (t.assigned_team_member_id && t.assigned_team_member_id === representative.assigned_team_member_id) matches.push('same_assignee');
          matchDetails.push({
            id: t.id,
            name: t.name,
            status_id: t.status_id,
            kanban_bucket_id: t.kanban_bucket_id,
            assigned_team_member_id: t.assigned_team_member_id,
            due_date: t.due_date,
            created_date: t.created_date,
            matching_fields: matches,
          });
        }

        duplicateGroups.push({
          project_id: pid === '__none__' ? null : pid,
          normalized_title: normalizedName,
          count: group.length,
          tasks: matchDetails,
        });
      }
    }

    // Sort by count descending
    duplicateGroups.sort((a, b) => b.count - a.count);

    return Response.json({
      total_groups: duplicateGroups.length,
      total_duplicate_tasks: duplicateGroups.reduce((s, g) => s + g.count, 0),
      groups: duplicateGroups,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});