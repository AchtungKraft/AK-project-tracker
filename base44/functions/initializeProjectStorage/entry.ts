import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, project_name, templates } = await req.json();
    if (!project_id || !templates || !Array.isArray(templates)) {
      return Response.json({ error: 'project_id and templates[] required' }, { status: 400 });
    }

    // Load existing project storage locations
    const existing = await base44.entities.Location.filter({
      project_id,
      is_project_storage: true,
    });

    const existingKeys = new Set(existing.filter(l => l.template_key).map(l => l.template_key));

    const created = [];
    const skipped = [];

    for (const t of templates) {
      if (!t.key || !t.label) continue;

      // Idempotent check by template_key
      if (existingKeys.has(t.key)) {
        skipped.push(t.key);
        continue;
      }

      const loc = await base44.entities.Location.create({
        location_area: `${project_name || 'Project'} — ${t.label}`,
        location_type: t.type || 'project_storage',
        template_key: t.key,
        project_id,
        is_project_storage: true,
        sort_order: t.sortOrder ?? 0,
        active: true,
        qr_code_value: `AK_LOC:${t.key}:${project_id}`,
      });

      created.push({ key: t.key, id: loc.id });
      existingKeys.add(t.key); // prevent duplicates within the same batch
    }

    return Response.json({
      success: true,
      created_count: created.length,
      existing_count: skipped.length,
      created,
      skipped,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});