import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

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

        // Update the request with server-side timestamp
        const updateData = { status };
        
        // Set posted_at when status changes to 'posted'
        if (status === 'posted') {
            updateData.posted_at = currentTimestamp;
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