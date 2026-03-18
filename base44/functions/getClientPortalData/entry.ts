import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const startTime = Date.now();
    
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

        // PHASE 1: Fetch project and contact in parallel
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
        const accessFilter = { project_id: projectId, access_status: 'active' };
        if (token) accessFilter.share_token = token;
        if (clientContactId) accessFilter.client_contact_id = clientContactId;

        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter(accessFilter);

        if (accesses.length === 0) {
            return Response.json({ error: 'No active access found' }, { 
                status: 403,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const access = accesses[0];

        // PHASE 2: Fetch only project-specific requests first
        const allRequests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ project_id: projectId });
        
        // Get visible requests and their IDs
        const visibleRequests = allRequests.filter(r => r.status !== 'draft');
        const requestIds = visibleRequests.map(r => r.id);

        // PHASE 3: Fetch related data ONLY for these specific request IDs
        // Use parallel fetches for each request's related data
        let projectComments = [];
        let projectDecisions = [];
        let projectAttachments = [];

        if (requestIds.length > 0) {
            // Fetch in parallel for all request IDs
            const [commentsResults, decisionsResults, attachmentsResults] = await Promise.all([
                fetchByRequestIds(base44.asServiceRole.entities.ClientFeedbackComment, requestIds),
                fetchByRequestIds(base44.asServiceRole.entities.ClientFeedbackDecision, requestIds),
                fetchByRequestIds(base44.asServiceRole.entities.ClientFeedbackAttachment, requestIds)
            ]);
            
            projectComments = commentsResults;
            projectDecisions = decisionsResults;
            projectAttachments = attachmentsResults;
        }

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
            updated_date: r.updated_date,
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
            created_date: c.created_date,
            updated_date: c.updated_date
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
            client_name: project.client_name,
            featured_image_url: project.featured_image_url,
            status_id: project.status_id,
            project_type_id: project.project_type_id
        };

        // Update last_viewed_at asynchronously (don't wait)
        base44.asServiceRole.entities.ProjectClientAccess.update(access.id, {
            last_viewed_at: new Date().toISOString()
        }).catch(() => {});

        const endTime = Date.now();
        const executionTime = endTime - startTime;

        // Log performance metrics
        console.log(`[getClientPortalData] Performance metrics:
  - Execution time: ${executionTime}ms
  - Requests: ${visibleRequests.length}
  - Comments: ${projectComments.length}
  - Decisions: ${projectDecisions.length}
  - Attachments: ${projectAttachments.length}`);

        return Response.json({
            success: true,
            access: {
                id: access.id,
                access_role: access.access_role,
                client_contact_id: access.client_contact_id,
                project_id: projectId
            },
            project: minimalProject,
            requests: minimalRequests,
            comments: minimalComments,
            decisions: minimalDecisions,
            attachments: minimalAttachments,
            _debug: {
                executionTimeMs: executionTime,
                counts: {
                    requests: visibleRequests.length,
                    comments: projectComments.length,
                    decisions: projectDecisions.length,
                    attachments: projectAttachments.length
                }
            }
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in getClientPortalData:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});

// Helper function to fetch records by request_id efficiently
// Fetches in parallel for each request ID
async function fetchByRequestIds(entity, requestIds) {
    if (!requestIds || requestIds.length === 0) return [];
    
    // Deduplicate
    const uniqueIds = [...new Set(requestIds)];
    
    // For small sets, fetch individually in parallel (more efficient than global fetch)
    if (uniqueIds.length <= 30) {
        const results = await Promise.all(
            uniqueIds.map(id => entity.filter({ request_id: id }).catch(() => []))
        );
        return results.flat();
    }
    
    // For larger sets, batch into chunks to avoid too many parallel requests
    const chunkSize = 10;
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        chunks.push(uniqueIds.slice(i, i + chunkSize));
    }
    
    const allResults = [];
    for (const chunk of chunks) {
        const chunkResults = await Promise.all(
            chunk.map(id => entity.filter({ request_id: id }).catch(() => []))
        );
        allResults.push(...chunkResults.flat());
    }
    
    return allResults;
}