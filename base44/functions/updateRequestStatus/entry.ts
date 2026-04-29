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

        // 🔁 RESEND - Decisions are preserved in the timeline as historical records.
        // The getRequestState() function in lifecycleHelpers already filters decisions
        // to only consider those made AFTER posted_at, so bumping posted_at effectively
        // resets the review state without destroying the conversation history.
        const isResend = status === 'posted' && request.status !== 'draft';
        
        if (isResend) {
            console.log("🔁 RESEND TRACE", {
                request_id: requestId,
                type: request.request_type,
                previous_status: request.status,
                new_status: status,
                note: "Decisions preserved. posted_at bump resets state via getRequestState filter."
            });
        }

        await base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, updateData);

        return Response.json({
            success: true,
            timestamp: currentTimestamp
        });

    } catch (error) {
        console.error("Error in updateRequestStatus:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});