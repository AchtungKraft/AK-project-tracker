import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { projectId, requestId, token, slug } = await req.json();

    if (!projectId) {
      return Response.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    // Validate access via token or slug
    let access = null;
    
    if (token) {
      const sessions = await base44.asServiceRole.entities.ClientPortalSession.filter({ session_token: token });
      if (sessions.length > 0 && new Date(sessions[0].expires_at) > new Date()) {
        access = sessions[0];
      }
    } else if (slug) {
      const contacts = await base44.asServiceRole.entities.ClientContact.filter({ slug });
      if (contacts.length > 0) {
        access = { client_contact_id: contacts[0].id };
      }
    }

    if (!access) {
      return Response.json({ success: false, error: 'Invalid or expired access' }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Update project's client_last_viewed_at
    await base44.asServiceRole.entities.Project.update(projectId, {
      client_last_viewed_at: now
    });

    // If requestId provided, also update the request's client_last_viewed_at
    if (requestId) {
      await base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, {
        client_last_viewed_at: now
      });
    }

    return Response.json({ 
      success: true, 
      viewed_at: now,
      project_updated: true,
      request_updated: !!requestId
    });

  } catch (error) {
    console.error('Error tracking view:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});