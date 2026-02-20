import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const dryRun = body.dry_run !== false; // default to dry_run

    // Fetch all projects
    const projects = await base44.asServiceRole.entities.Project.list();
    
    // Fetch legacy data to check for usage
    const [pools, allocations] = await Promise.all([
      base44.asServiceRole.entities.BillingPool.list(),
      base44.asServiceRole.entities.PoolAllocation.list()
    ]);

    // Create lookup maps for legacy data
    const poolsByProject = {};
    pools.forEach(p => {
      if (!poolsByProject[p.project_id]) poolsByProject[p.project_id] = [];
      poolsByProject[p.project_id].push(p);
    });

    const allocationsByProject = {};
    allocations.forEach(a => {
      if (!allocationsByProject[a.project_id]) allocationsByProject[a.project_id] = [];
      allocationsByProject[a.project_id].push(a);
    });

    // Categorize projects
    const analysis = {
      total_projects: projects.length,
      already_forward: 0,
      missing_model_version: 0,
      has_legacy_pools: 0,
      has_legacy_allocations: 0,
      projects_to_migrate: [],
      projects_with_legacy_data: []
    };

    for (const project of projects) {
      const hasForward = project.financial_model_version === 'forward';
      const hasPools = (poolsByProject[project.id] || []).length > 0;
      const hasAllocations = (allocationsByProject[project.id] || []).length > 0;

      if (hasForward) {
        analysis.already_forward++;
      } else {
        analysis.missing_model_version++;
        analysis.projects_to_migrate.push({
          id: project.id,
          name: project.name,
          current_version: project.financial_model_version || null,
          has_pools: hasPools,
          has_allocations: hasAllocations
        });
      }

      if (hasPools) {
        analysis.has_legacy_pools++;
      }
      if (hasAllocations) {
        analysis.has_legacy_allocations++;
      }

      if (hasPools || hasAllocations) {
        analysis.projects_with_legacy_data.push({
          id: project.id,
          name: project.name,
          pool_count: (poolsByProject[project.id] || []).length,
          allocation_count: (allocationsByProject[project.id] || []).length
        });
      }
    }

    if (dryRun) {
      return Response.json({
        success: true,
        mode: 'DRY_RUN',
        timestamp: new Date().toISOString(),
        analysis,
        message: `Would migrate ${analysis.projects_to_migrate.length} projects to forward model. Run with dry_run: false to execute.`
      });
    }

    // EXECUTE MIGRATION
    const migrated = [];
    const errors = [];
    const migratedAt = new Date().toISOString();

    for (const proj of analysis.projects_to_migrate) {
      try {
        await base44.asServiceRole.entities.Project.update(proj.id, {
          financial_model_version: 'forward',
          financial_model_migrated_at: migratedAt,
          financial_model_migrated_by: user.email
        });
        migrated.push({ id: proj.id, name: proj.name });
      } catch (err) {
        errors.push({ id: proj.id, name: proj.name, error: err.message });
      }
    }

    return Response.json({
      success: errors.length === 0,
      mode: 'EXECUTED',
      timestamp: migratedAt,
      migrated_by: user.email,
      analysis,
      results: {
        migrated_count: migrated.length,
        error_count: errors.length,
        migrated,
        errors
      },
      message: `Migrated ${migrated.length} projects to forward model${errors.length > 0 ? ` (${errors.length} errors)` : ''}`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});