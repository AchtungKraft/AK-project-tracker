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
        const { token, slug, projectId } = await req.json();

        if ((!token && !slug) || !projectId) {
            return Response.json({ error: 'Missing required parameters' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const filter = { project_id: projectId, access_status: 'active' };
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

        const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        const project = projects[0];

        if (!project) {
            return Response.json({ error: 'Project not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ project_id: projectId });
        const visibleRequests = requests.filter(r => r.status !== 'draft');

        const comments = await base44.asServiceRole.entities.ClientFeedbackComment.list('-created_date', 1000);
        const projectComments = comments.filter(c => 
            visibleRequests.some(r => r.id === c.request_id)
        );

        const decisions = await base44.asServiceRole.entities.ClientFeedbackDecision.list('-created_date', 1000);
        const projectDecisions = decisions.filter(d => 
            visibleRequests.some(r => r.id === d.request_id)
        );

        const attachments = await base44.asServiceRole.entities.ClientFeedbackAttachment.list('-created_date', 1000);
        const projectAttachments = attachments.filter(a => 
            visibleRequests.some(r => r.id === a.request_id)
        );

        await base44.asServiceRole.entities.ProjectClientAccess.update(access.id, {
            last_viewed_at: new Date().toISOString()
        });

        return Response.json({
            success: true,
            access,
            project,
            requests: visibleRequests,
            comments: projectComments,
            decisions: projectDecisions,
            attachments: projectAttachments
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in publicClientPortalData:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});