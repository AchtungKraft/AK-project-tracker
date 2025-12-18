import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { token, slug, requestId } = await req.json();

        if ((!token && !slug) || !requestId) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Fetch request
        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];

        if (!request) {
            return Response.json({ error: 'Request not found' }, { status: 404 });
        }

        // Verify client access to this project
        const filter = { project_id: request.project_id, access_status: 'active' };
        if (token) filter.share_token = token;
        if (slug) filter.url_slug = slug;

        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter(filter);
        
        if (accesses.length === 0) {
            return Response.json({ error: 'Invalid access' }, { status: 403 });
        }

        const access = accesses[0];

        // Fetch related data
        const comments = await base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: requestId });
        const decisions = await base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId });
        const attachments = await base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId });

        // Fetch users and client contacts for display
        const users = await base44.asServiceRole.entities.User.list();
        const clientContacts = await base44.asServiceRole.entities.ClientContact.list();

        return Response.json({
            success: true,
            access,
            request,
            comments,
            decisions,
            attachments,
            users,
            clientContacts
        });

    } catch (error) {
        console.error("Error in getClientRequestDetail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});