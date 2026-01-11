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
        let token, slug, projectId;
        
        try {
            const contentType = req.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const body = await req.json();
                token = body.token;
                slug = body.slug;
                projectId = body.projectId;
            }
        } catch (e) {
            const url = new URL(req.url);
            token = url.searchParams.get('token');
            slug = url.searchParams.get('slug');
            projectId = url.searchParams.get('projectId');
        }

        if ((!token && !slug) || !projectId) {
            return Response.json({ error: 'Missing required parameters' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Run initial queries in parallel
        const [projectResults, contactResults] = await Promise.all([
            base44.asServiceRole.entities.Project.filter({ id: projectId }),
            slug ? base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug, active: true }) : Promise.resolve([])
        ]);

        const project = projectResults[0];
        if (!project) {
            return Response.json({ error: 'Project not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        let clientContactId;
        if (slug) {
            if (contactResults.length === 0) {
                return Response.json({ error: 'Client contact not found' }, { 
                    status: 404,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            clientContactId = contactResults[0].id;
        }

        // Build filter for ProjectClientAccess
        const filter = { project_id: projectId, access_status: 'active' };
        if (token) filter.share_token = token;
        if (clientContactId) filter.client_contact_id = clientContactId;

        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter(filter);

        if (accesses.length === 0) {
            return Response.json({ error: 'No active access found' }, { 
                status: 403,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const access = accesses[0];

        // Fetch all feedback data in parallel
        const [allRequests, allComments, allDecisions, allAttachments] = await Promise.all([
            base44.asServiceRole.entities.ClientFeedbackRequest.filter({ project_id: projectId }),
            base44.asServiceRole.entities.ClientFeedbackComment.filter({ }, '-created_date', 500),
            base44.asServiceRole.entities.ClientFeedbackDecision.filter({ }, '-created_date', 500),
            base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ }, '-created_date', 500)
        ]);

        const visibleRequests = allRequests.filter(r => r.status !== 'draft');
        const requestIds = new Set(visibleRequests.map(r => r.id));

        // Filter to only this project's data
        const projectComments = allComments.filter(c => requestIds.has(c.request_id));
        const projectDecisions = allDecisions.filter(d => requestIds.has(d.request_id));
        const projectAttachments = allAttachments.filter(a => requestIds.has(a.request_id));

        // Strip unnecessary fields from response to reduce payload size
        const minimalRequests = visibleRequests.map(r => ({
            id: r.id,
            title: r.title,
            body: r.body,
            request_type: r.request_type,
            status: r.status,
            due_date: r.due_date,
            posted_at: r.posted_at,
            created_date: r.created_date,
            project_id: r.project_id
        }));

        const minimalComments = projectComments.map(c => ({
            id: c.id,
            request_id: c.request_id,
            author_type: c.author_type,
            author_id: c.author_id,
            body: c.body,
            visibility: c.visibility,
            posted_at: c.posted_at,
            created_date: c.created_date
        }));

        const minimalDecisions = projectDecisions.map(d => ({
            id: d.id,
            request_id: d.request_id,
            decided_by_type: d.decided_by_type,
            decided_by_id: d.decided_by_id,
            decision: d.decision,
            note: d.note,
            target_type: d.target_type,
            target_attachment_id: d.target_attachment_id,
            target_image_url: d.target_image_url,
            decided_at: d.decided_at,
            created_date: d.created_date
        }));

        const minimalAttachments = projectAttachments.map(a => ({
            id: a.id,
            request_id: a.request_id,
            comment_id: a.comment_id,
            attachment_type: a.attachment_type,
            file_url: a.file_url,
            link_url: a.link_url,
            label: a.label,
            created_by_type: a.created_by_type,
            created_by_id: a.created_by_id,
            posted_at: a.posted_at,
            created_date: a.created_date
        }));

        const minimalProject = {
            id: project.id,
            name: project.name,
            featured_image_url: project.featured_image_url,
            status_id: project.status_id,
            project_type_id: project.project_type_id
        };

        // Update last_viewed_at asynchronously (don't wait)
        base44.asServiceRole.entities.ProjectClientAccess.update(access.id, {
            last_viewed_at: new Date().toISOString()
        }).catch(() => {});

        return Response.json({
            success: true,
            access: {
                id: access.id,
                access_role: access.access_role,
                client_contact_id: access.client_contact_id
            },
            project: minimalProject,
            requests: minimalRequests,
            comments: minimalComments,
            decisions: minimalDecisions,
            attachments: minimalAttachments
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