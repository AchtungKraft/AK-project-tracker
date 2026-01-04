import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    
    // Parse request body
    let projectId, token, slug;
    try {
      const body = await req.json();
      projectId = body.projectId;
      token = body.token;
      slug = body.slug;
    } catch {
      const url = new URL(req.url);
      projectId = url.searchParams.get('projectId');
      token = url.searchParams.get('token');
      slug = url.searchParams.get('slug');
    }

    if (!projectId) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Validate client access using token or slug
    let access = null;
    
    if (token && token !== 'null' && token.trim() !== '') {
      const accessRecords = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
        share_token: token,
        access_status: 'active'
      });
      access = accessRecords.find(a => a.project_id === projectId);
    }
    
    if (!access && slug && slug !== 'null' && slug.trim() !== '') {
      // Try to find by client slug
      const clients = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug });
      if (clients.length > 0) {
        const clientId = clients[0].id;
        const accessRecords = await base44.asServiceRole.entities.ProjectClientAccess.filter({
          client_contact_id: clientId,
          project_id: projectId,
          access_status: 'active'
        });
        access = accessRecords[0];
      }
    }

    if (!access) {
      return Response.json({ error: 'Unauthorized access' }, { status: 403 });
    }

    // Fetch journal entries with client visibility for this project
    const journalEntries = await base44.asServiceRole.entities.JournalEntry.filter({
      project_id: projectId,
      visibility: 'client'
    });

    // Sort by entry_date descending (newest first)
    const sortedEntries = journalEntries.sort((a, b) => 
      new Date(b.entry_date || b.created_date) - new Date(a.entry_date || a.created_date)
    );

    return Response.json({
      success: true,
      entries: sortedEntries
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Error fetching client journal entries:', error);
    return Response.json({ error: error.message }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  }
});