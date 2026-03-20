import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { title, body, request_type, due_date, project_id } = await req.json();

        if (!title || !project_id) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const currentTimestamp = new Date().toISOString();

        // Create the request with server-side timestamp
        const newRequest = await base44.asServiceRole.entities.ClientFeedbackRequest.create({
            title,
            body: body || null,
            request_type,
            due_date: due_date || null,
            project_id,
            created_by_user_id: user.id,
            status: 'draft',
            created_date: currentTimestamp,
            updated_date: currentTimestamp
        });

        return Response.json({
            success: true,
            request: newRequest
        });

    } catch (error) {
        console.error("Error in createFeedbackRequest:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});