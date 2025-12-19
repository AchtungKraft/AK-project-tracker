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

        const filter = { project_id: request.project_id, access_status: 'active' };
        if (token) filter.share_token = token;
        if (slug) filter.url_slug = slug;

        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter(filter);
        
        if (accesses.length === 0) {
            return Response.json({ error: 'Invalid access' }, { 
                status: 403,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const access = accesses[0];

        const comments = await base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: requestId });
        const decisions = await base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId });
        const attachments = await base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId });

        const users = await base44.asServiceRole.entities.User.list();
        const clientContacts = await base44.asServiceRole.entities.ClientContact.list();

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

        return Response.json({
            success: true,
            access,
            request,
            comments: enrichedComments,
            decisions: enrichedDecisions,
            attachments
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