import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // These independent reference reads are intentionally batched behind one
    // authenticated function invocation to avoid three client request-latency floors.
    const [projects, projectTypes, statuses] = await Promise.all([
      base44.entities.Project.list('-created_date', 200),
      base44.entities.ProjectType.list('sort_order', 100),
      base44.entities.StatusList.list(),
    ]);

    return Response.json({
      success: true,
      projects,
      projectTypes,
      statuses,
    });
  } catch (error) {
    console.error('getProjectSelectData error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
