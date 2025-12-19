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
        
        // Safely parse request parameters
        try {
            const contentType = req.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const body = await req.json();
                token = body.token;
                slug = body.slug;
                requestId = body.requestId;
                comment = body.comment;
                attachments = body.attachments;
            }
        } catch (e) {
            // If JSON parsing fails, try URL parameters
            const url = new URL(req.url);
            token = url.searchParams.get('token');
            slug = url.searchParams.get('slug');
            requestId = url.searchParams.get('requestId');
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
        const createdAttachments = [];
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
            createdAttachments.push(...await Promise.all(attachmentPromises));
        }

        return Response.json({
            success: true,
            comment: newComment,
            attachments: createdAttachments
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