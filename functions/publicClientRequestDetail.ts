import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

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
        let token, slug, requestId;
        
        // Safely parse request parameters
        try {
            const contentType = req.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const body = await req.json();
                token = body.token;
                slug = body.slug;
                requestId = body.requestId;
            }
        } catch (e) {
            // If JSON parsing fails, try URL parameters
            const url = new URL(req.url);
            token = url.searchParams.get('token');
            slug = url.searchParams.get('slug');
            requestId = url.searchParams.get('requestId');
        }

        if ((!token && !slug) || !requestId) {
            return Response.json({ error: 'Missing required parameters' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];

        if (!request) {
            return Response.json({ error: 'Request not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // If using slug, first find the client contact
        let clientContactId;
        if (slug) {
            const contacts = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug, active: true });
            if (contacts.length === 0) {
                return Response.json({ error: 'Invalid slug' }, { 
                    status: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            clientContactId = contacts[0].id;
        }

        const filter = { project_id: request.project_id, access_status: 'active' };
        if (token) filter.share_token = token;
        if (clientContactId) filter.client_contact_id = clientContactId;

        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter(filter);
        
        if (accesses.length === 0) {
            return Response.json({ error: 'Invalid access' }, { 
                status: 403,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const access = accesses[0];

        // Fetch all related data with proper sorting and limits
        const comments = await base44.asServiceRole.entities.ClientFeedbackComment.filter(
            { request_id: requestId }, 
            '-created_date', 
            1000
        );
        const decisions = await base44.asServiceRole.entities.ClientFeedbackDecision.filter(
            { request_id: requestId }, 
            '-created_date', 
            1000
        );
        const attachments = await base44.asServiceRole.entities.ClientFeedbackAttachment.filter(
            { request_id: requestId }, 
            '-created_date', 
            1000
        );

        const users = await base44.asServiceRole.entities.User.list();
        const clientContacts = await base44.asServiceRole.entities.ClientContact.list();

        // Enrich request with creator details
        const requestCreator = request.created_by_user_id
            ? users.find(u => u.id === request.created_by_user_id)
            : null;
        const enrichedRequest = { ...request, creator: requestCreator };

        // Enrich comments with author details
        const enrichedComments = comments.map(comment => {
            const author = comment.author_type === 'internal_user'
                ? users.find(u => u.id === comment.author_id)
                : clientContacts.find(c => c.id === comment.author_id);
            return { ...comment, author };
        });

        // Enrich decisions with decider details
        const enrichedDecisions = decisions.map(decision => {
            const decider = decision.decided_by_type === 'internal_user'
                ? users.find(u => u.id === decision.decided_by_id)
                : clientContacts.find(c => c.id === decision.decided_by_id);
            return { ...decision, decider };
        });

        // Enrich attachments with creator details
        const enrichedAttachments = attachments.map(attachment => {
            const creator = attachment.created_by_type === 'internal_user'
                ? users.find(u => u.id === attachment.created_by_id)
                : clientContacts.find(c => c.id === attachment.created_by_id);
            return { ...attachment, creator };
        });

        return Response.json({
            success: true,
            access,
            request: enrichedRequest,
            comments: enrichedComments,
            decisions: enrichedDecisions,
            attachments: enrichedAttachments
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in publicClientRequestDetail:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});