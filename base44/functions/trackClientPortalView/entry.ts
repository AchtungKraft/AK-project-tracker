import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let { projectId, requestId, token, slug } = await req.json();

    console.log('Tracking view - projectId:', projectId, 'requestId:', requestId, 'token:', !!token, 'slug:', slug);

    // If we have requestId but no projectId, get projectId from the request
    if (requestId && !projectId) {
      const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
      if (requests.length > 0) {
        projectId = requests[0].project_id;
        console.log('Got projectId from request:', projectId);
      }
    }

    if (!projectId && !requestId) {
      return Response.json({ success: false, error: 'projectId or requestId is required' }, { status: 400 });
    }

    // Validate access via token or slug
    let access = null;
    
    if (token) {
      const sessions = await base44.asServiceRole.entities.ClientPortalSession.filter({ session_token: token });
      console.log('Sessions found:', sessions.length);
      if (sessions.length > 0 && new Date(sessions[0].expires_at) > new Date()) {
        access = sessions[0];
      }
    } else if (slug) {
      const contacts = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug });
      console.log('Contacts found for slug:', contacts.length);
      if (contacts.length > 0) {
        access = { client_contact_id: contacts[0].id };
      }
    }

    if (!access) {
      console.log('Access validation failed - no valid token or slug');
      return Response.json({ success: false, error: 'Invalid or expired access' }, { status: 401 });
    }
    
    console.log('Access validated, updating timestamps...');

    const now = new Date().toISOString();
    let projectUpdated = false;
    let requestUpdated = false;

    // Update project's client_last_viewed_at
    if (projectId) {
      try {
        console.log('Updating project:', projectId, 'with timestamp:', now);
        await base44.asServiceRole.entities.Project.update(projectId, {
          client_last_viewed_at: now
        });
        console.log('Project updated successfully');
        projectUpdated = true;
      } catch (projectError) {
        console.error('Failed to update project:', projectError.message);
      }
    }

    // If requestId provided, also update the request's client_last_viewed_at
    if (requestId) {
      try {
        console.log('Updating request:', requestId, 'with timestamp:', now);
        await base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, {
          client_last_viewed_at: now
        });
        console.log('Request updated successfully');
        requestUpdated = true;
      } catch (requestError) {
        console.error('Failed to update request:', requestError.message);
      }
    }

    return Response.json({ 
      success: true, 
      viewed_at: now,
      project_updated: projectUpdated,
      request_updated: requestUpdated
    });

  } catch (error) {
    console.error('Error tracking view:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});