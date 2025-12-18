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
        const { token, slug, requestId, decision, note, targetAttachmentIds } = await req.json();

        if ((!token && !slug) || !requestId || !decision) {
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

        // Create decisions for each target attachment or request
        const decisions = [];
        
        if (targetAttachmentIds && targetAttachmentIds.length > 0) {
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
        } else {
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