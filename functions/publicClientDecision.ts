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
        let token, slug, requestId, decision, note, targetAttachmentIds, newImages;
        
        // Safely parse request parameters
        try {
            const contentType = req.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const body = await req.json();
                token = body.token;
                slug = body.slug;
                requestId = body.requestId;
                decision = body.decision;
                note = body.note;
                targetAttachmentIds = body.targetAttachmentIds;
                newImages = body.newImages;
            }
        } catch (e) {
            // If JSON parsing fails, try URL parameters
            const url = new URL(req.url);
            token = url.searchParams.get('token');
            slug = url.searchParams.get('slug');
            requestId = url.searchParams.get('requestId');
            decision = url.searchParams.get('decision');
            note = url.searchParams.get('note');
            const idsParam = url.searchParams.get('targetAttachmentIds');
            const imagesParam = url.searchParams.get('newImages');
            targetAttachmentIds = idsParam ? JSON.parse(idsParam) : null;
            newImages = imagesParam ? JSON.parse(imagesParam) : null;
        }

        if (!requestId || !decision) {
            return Response.json({ error: 'Missing required parameters' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Check if this is an authenticated internal user (no token/slug provided)
        let authenticatedUser = null;
        if (!token && !slug) {
            try {
                authenticatedUser = await base44.auth.me();
            } catch (e) {
                return Response.json({ error: 'Authentication required' }, { 
                    status: 401,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
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
        let access = null;

        // If authenticated user (internal), skip access verification
        if (!authenticatedUser) {
            // Client portal access verification
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

            access = accesses[0];
        }

        // Create decisions and comments
        const decisions = [];
        
        if (targetAttachmentIds && targetAttachmentIds.length > 0) {
            // Image-level decisions
            for (const attachmentId of targetAttachmentIds) {
                const newDecision = await base44.asServiceRole.entities.ClientFeedbackDecision.create({
                    request_id: requestId,
                    decided_by_type: 'client_contact',
                    decided_by_id: access.client_contact_id,
                    decision,
                    note,
                    target_type: 'attachment_image',
                    target_attachment_id: attachmentId,
                    decided_at: new Date().toISOString()
                });
                decisions.push(newDecision);
            }

            // Create a single comment summarizing the image review
            const actionLabel = decision === 'approved' ? 'Approved' : 'Requested changes on';
            const commentBody = `${actionLabel} ${targetAttachmentIds.length} image(s)${note ? ': ' + note : ''}`;
            
            const comment = await base44.asServiceRole.entities.ClientFeedbackComment.create({
                request_id: requestId,
                author_type: 'client_contact',
                author_id: access.client_contact_id,
                body: commentBody,
                visibility: 'client_visible',
                target_type: 'request',
            });

            // Attach new images to the comment if provided
            if (newImages && newImages.length > 0) {
                for (const imageUrl of newImages) {
                    await base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                        request_id: requestId,
                        comment_id: comment.id,
                        attachment_type: 'image',
                        file_url: imageUrl,
                        created_by_type: 'client_contact',
                        created_by_id: access.client_contact_id,
                    });
                }
            }
        } else {
            // Request-level decision
            const newDecision = await base44.asServiceRole.entities.ClientFeedbackDecision.create({
                request_id: requestId,
                decided_by_type: 'client_contact',
                decided_by_id: access.client_contact_id,
                decision,
                note,
                target_type: 'request',
                decided_at: new Date().toISOString()
            });
            decisions.push(newDecision);

            // Create comment for request decision
            const commentBody = `${decision === 'approved' ? 'Approved' : 'Requested changes'}${note ? ': ' + note : ''}`;
            await base44.asServiceRole.entities.ClientFeedbackComment.create({
                request_id: requestId,
                author_type: 'client_contact',
                author_id: access.client_contact_id,
                body: commentBody,
                visibility: 'client_visible',
                target_type: 'request',
            });
        }

        // Update request status if changes requested
        if (decision === 'changes_requested') {
            await base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, {
                status: 'changes_requested',
                posted_at: new Date().toISOString()
            });
        }

        return Response.json({
            success: true,
            decisions
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in publicClientDecision:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});