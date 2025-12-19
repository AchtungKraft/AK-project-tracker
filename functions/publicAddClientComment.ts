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
        let token, slug, requestId, comment, attachments;
        
        // Handle both direct POST and SDK invoke
        if (req.method === 'POST') {
            const body = await req.json();
            token = body.token;
            slug = body.slug;
            requestId = body.requestId;
            comment = body.comment;
            attachments = body.attachments;
        } else {
            const url = new URL(req.url);
            token = url.searchParams.get('token');
            slug = url.searchParams.get('slug');
            requestId = url.searchParams.get('requestId');
            // For complex objects via GET, they need to be JSON encoded
            const commentParam = url.searchParams.get('comment');
            const attachmentsParam = url.searchParams.get('attachments');
            comment = commentParam ? JSON.parse(commentParam) : null;
            attachments = attachmentsParam ? JSON.parse(attachmentsParam) : null;
        }

        if ((!token && !slug) || !requestId) {
            return Response.json({ error: 'Missing required parameters' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Verify access
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

        // Create comment
        const newComment = await base44.asServiceRole.entities.ClientFeedbackComment.create({
            request_id: requestId,
            author_type: 'client_contact',
            author_id: access.client_contact_id,
            body: comment.body,
            visibility: 'client_visible',
            target_type: 'request'
        });

        // Create attachments
        if (attachments && attachments.length > 0) {
            const attachmentPromises = attachments.map(att => 
                base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                    request_id: requestId,
                    comment_id: newComment.id,
                    attachment_type: att.type,
                    file_url: att.file_url,
                    link_url: att.link_url,
                    label: att.label,
                    created_by_type: 'client_contact',
                    created_by_id: access.client_contact_id,
                })
            );
            await Promise.all(attachmentPromises);
        }

        return Response.json({
            success: true,
            comment: newComment
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in publicAddClientComment:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});