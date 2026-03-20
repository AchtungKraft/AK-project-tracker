import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { requestId, status } = await req.json();

        if (!requestId || !status) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const currentTimestamp = new Date().toISOString();

        // Fetch the request to get its type for diagnostic
        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];
        
        if (!request) {
            return Response.json({ error: 'Request not found' }, { status: 404 });
        }

        // Update the request with server-side timestamp
        const updateData = { status };
        
        // Set posted_at when status changes to 'posted'
        if (status === 'posted') {
            updateData.posted_at = currentTimestamp;
        }

        // 🔁 RESEND DIAGNOSTIC - Check if this is a resend (status changing TO posted)
        const structuredTypes = ['design_review', 'budget_review', 'deliverable_review'];
        const isStructuredReview = structuredTypes.includes(request.request_type);
        const isResend = status === 'posted' && request.status !== 'draft';
        
        let clearedAttachmentDecisions = 0;
        let clearedRequestDecisions = 0;
        
        // If resending for approval on a structured review, clear attachment-level decisions
        if (isResend && isStructuredReview) {
            const decisions = await base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId });
            const attachmentDecisions = decisions.filter(d => d.target_type === 'attachment_image');
            const requestDecisions = decisions.filter(d => d.target_type === 'request');
            
            // Delete attachment-level decisions to reset image review state
            for (const decision of attachmentDecisions) {
                await base44.asServiceRole.entities.ClientFeedbackDecision.delete(decision.id);
                clearedAttachmentDecisions++;
            }
            
            // Also clear request-level decisions for clean slate
            for (const decision of requestDecisions) {
                await base44.asServiceRole.entities.ClientFeedbackDecision.delete(decision.id);
                clearedRequestDecisions++;
            }
            
            console.log("🔁 RESEND TRACE - STRUCTURED REVIEW", {
                request_id: requestId,
                type: request.request_type,
                previous_status: request.status,
                new_status: status,
                cleared_attachment_decisions: clearedAttachmentDecisions,
                cleared_request_decisions: clearedRequestDecisions,
                total_decisions_before: decisions.length
            });
        } else if (isResend) {
            // For non-structured reviews, also clear decisions on resend
            const decisions = await base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId });
            
            for (const decision of decisions) {
                await base44.asServiceRole.entities.ClientFeedbackDecision.delete(decision.id);
                if (decision.target_type === 'attachment_image') clearedAttachmentDecisions++;
                else clearedRequestDecisions++;
            }
            
            console.log("🔁 RESEND TRACE - NON-STRUCTURED", {
                request_id: requestId,
                type: request.request_type,
                previous_status: request.status,
                new_status: status,
                cleared_decisions: decisions.length
            });
        }

        await base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, updateData);

        return Response.json({
            success: true,
            timestamp: currentTimestamp,
            clearedAttachmentDecisions,
            clearedRequestDecisions
        });

    } catch (error) {
        console.error("Error in updateRequestStatus:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});