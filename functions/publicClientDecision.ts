import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        // Create decisions with a single timestamp for all records
        const decisions = [];
        const currentTimestamp = new Date().toISOString();
        
        const decidedByType = authenticatedUser ? 'internal_user' : 'client_contact';
        const decidedById = authenticatedUser ? authenticatedUser.id : access.client_contact_id;
        
        if (targetAttachmentIds && targetAttachmentIds.length > 0) {
            // Fetch the attachments to get their URLs
            const attachments = await base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId });
            
            // Image-level decisions with note stored directly
            for (const attachmentId of targetAttachmentIds) {
                const attachment = attachments.find(a => a.id === attachmentId);
                const imageUrl = attachment && attachment.file_url ? attachment.file_url : null;
                
                const newDecision = await base44.asServiceRole.entities.ClientFeedbackDecision.create({
                    request_id: requestId,
                    decided_by_type: decidedByType,
                    decided_by_id: decidedById,
                    decision,
                    note: note || null,
                    target_type: 'attachment_image',
                    target_attachment_id: attachmentId,
                    target_image_url: imageUrl,
                    decided_at: currentTimestamp
                });
                decisions.push(newDecision);
            }
        } else {
            // Request-level decision
            const newDecision = await base44.asServiceRole.entities.ClientFeedbackDecision.create({
                request_id: requestId,
                decided_by_type: decidedByType,
                decided_by_id: decidedById,
                decision,
                note,
                target_type: 'request',
                decided_at: currentTimestamp
            });
            decisions.push(newDecision);
        }

        // Create reference images for ALL decision types (both image-level and request-level)
        if (newImages && newImages.length > 0) {
            for (const imageUrl of newImages) {
                await base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                    request_id: requestId,
                    comment_id: null,
                    attachment_type: 'image',
                    file_url: imageUrl,
                    created_by_type: decidedByType,
                    created_by_id: decidedById,
                    posted_at: currentTimestamp
                });
            }
        }

        // Update request status based on decision
        console.log(`[STATUS UPDATE] Starting update for request ${requestId} to status: ${decision}`);
        let updatedRequest = null;
        const statusToSet = decision === 'changes_requested' ? 'changes_requested' : (decision === 'approved' ? 'approved' : null);
        
        if (statusToSet) {
            console.log(`[STATUS UPDATE] Will set status to: ${statusToSet}`);
            try {
                updatedRequest = await base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, {
                    status: statusToSet
                });
                console.log(`[STATUS UPDATE] Success! Updated request:`, JSON.stringify(updatedRequest));
            } catch (updateError) {
                console.error(`[STATUS UPDATE] FAILED:`, updateError.message);
                console.error(`[STATUS UPDATE] Full error:`, JSON.stringify(updateError));
            }
        } else {
            console.log(`[STATUS UPDATE] Skipping - decision "${decision}" does not map to a status`);
        }

        return Response.json({
            success: true,
            decisions,
            updatedStatus: updatedRequest?.status || null
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