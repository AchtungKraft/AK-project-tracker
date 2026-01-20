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
        let token, slug, requestId;
        
        try {
            const contentType = req.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const body = await req.json();
                token = body.token;
                slug = body.slug;
                requestId = body.requestId;
            }
        } catch (e) {
            const url = new URL(req.url);
            token = url.searchParams.get('token');
            slug = url.searchParams.get('slug');
            requestId = url.searchParams.get('requestId');
        }

        if ((!token && !slug) || !requestId) {
            return Response.json({ error: 'Missing required parameters' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // STEP A: Fetch request and validate access in parallel
        const [requestResults, contactResults] = await Promise.all([
            base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId }),
            slug ? base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug, active: true }) : Promise.resolve([])
        ]);

        const request = requestResults[0];
        if (!request) {
            return Response.json({ error: 'Request not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        let clientContactId;
        if (slug) {
            if (contactResults.length === 0) {
                return Response.json({ error: 'Invalid slug' }, { 
                    status: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            clientContactId = contactResults[0].id;
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

        const access = accesses[0];

        // STEP A continued: Fetch request-scoped data in parallel
        const [commentsRaw, decisionsRaw, attachmentsRaw, todoTasksRaw, projectClientAccesses] = await Promise.all([
            base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ToDoListTask.filter({ request_id: requestId }).catch(() => []),
            base44.asServiceRole.entities.ProjectClientAccess.filter({ project_id: request.project_id, access_status: 'active' })
        ]);

        // STEP B: Derive minimal ID sets from request-scoped data
        const internalUserIds = new Set();
        const clientContactIds = new Set();

        // From request creator
        if (request.created_by_user_id) internalUserIds.add(request.created_by_user_id);

        // From comments
        commentsRaw.forEach(c => {
            if (c.author_type === 'internal_user' && c.author_id) internalUserIds.add(c.author_id);
            else if (c.author_type === 'client_contact' && c.author_id) clientContactIds.add(c.author_id);
        });

        // From decisions
        decisionsRaw.forEach(d => {
            if (d.decided_by_type === 'internal_user' && d.decided_by_id) internalUserIds.add(d.decided_by_id);
            else if (d.decided_by_type === 'client_contact' && d.decided_by_id) clientContactIds.add(d.decided_by_id);
        });

        // From todo tasks
        todoTasksRaw.forEach(t => {
            if (t.assigned_to_type === 'internal_user' && t.assigned_to_id) internalUserIds.add(t.assigned_to_id);
            else if (t.assigned_to_type === 'client_contact' && t.assigned_to_id) clientContactIds.add(t.assigned_to_id);
        });

        // Add project access contact IDs for assignable list
        projectClientAccesses.forEach(pa => {
            if (pa.client_contact_id) clientContactIds.add(pa.client_contact_id);
        });

        // STEP C: Fetch ONLY referenced users and contacts (batched, not full lists)
        const [users, clientContacts] = await Promise.all([
            fetchByIdsBatched(base44.asServiceRole.entities.User, [...internalUserIds]),
            fetchByIdsBatched(base44.asServiceRole.entities.ClientContact, [...clientContactIds]),
        ]);

        // For assignable users, fetch Achtung Kraft team members
        const teamMembers = await base44.asServiceRole.entities.TeamMember.filter({ is_achtung_kraft_member: true });
        const akUserIds = teamMembers.filter(tm => tm.user_id).map(tm => tm.user_id);
        const neededAkUserIds = akUserIds.filter(id => !internalUserIds.has(id));
        
        let akUsers = users;
        if (neededAkUserIds.length > 0) {
            const additionalUsers = await fetchByIdsBatched(base44.asServiceRole.entities.User, neededAkUserIds);
            akUsers = [...users, ...additionalUsers];
        }

        // Build lookup maps with minimal fields
        const userMap = new Map(akUsers.map(u => [u.id, { id: u.id, full_name: u.full_name }]));
        const contactMap = new Map(clientContacts.map(c => [c.id, { id: c.id, name: c.name, active: c.active }]));

        // Sort by timestamps
        const comments = [...commentsRaw].sort((a, b) => 
            new Date(b.posted_at || b.created_date) - new Date(a.posted_at || a.created_date)
        );
        const decisions = [...decisionsRaw].sort((a, b) => 
            new Date(b.decided_at || b.created_date) - new Date(a.decided_at || a.created_date)
        );
        const attachments = [...attachmentsRaw].sort((a, b) => 
            new Date(b.posted_at || b.created_date) - new Date(a.posted_at || a.created_date)
        );

        // Enrich todo tasks
        const enrichedTodoTasks = todoTasksRaw.map(t => ({
            id: t.id,
            request_id: t.request_id,
            title: t.title,
            is_complete: t.is_complete,
            completed_at: t.completed_at,
            assigned_to_id: t.assigned_to_id,
            assigned_to_type: t.assigned_to_type,
            details: t.details,
            images: t.images,
            due_date: t.due_date,
            created_date: t.created_date,
            created_by: t.created_by,
            assignee: t.assigned_to_type === 'internal_user' ? userMap.get(t.assigned_to_id) : contactMap.get(t.assigned_to_id)
        }));

        // Build assignable lists from project accesses
        const projectClientContactIds = projectClientAccesses.map(pa => pa.client_contact_id);
        const projectClients = clientContacts.filter(c => projectClientContactIds.includes(c.id) && c.active !== false);

        const assignableUsers = teamMembers
            .filter(tm => tm.user_id)
            .map(tm => {
                const userRecord = userMap.get(tm.user_id);
                return userRecord ? { id: userRecord.id, full_name: tm.full_name || userRecord.full_name, type: 'internal_user' } : null;
            })
            .filter(Boolean);

        // Enrich request with creator
        const requestCreator = request.created_by_user_id ? userMap.get(request.created_by_user_id) : null;

        // Enrich and minimize comments
        const enrichedComments = comments.map(c => ({
            id: c.id,
            request_id: c.request_id,
            author_type: c.author_type,
            author_id: c.author_id,
            body: c.body,
            visibility: c.visibility,
            posted_at: c.posted_at,
            created_date: c.created_date,
            author: c.author_type === 'internal_user' ? userMap.get(c.author_id) : contactMap.get(c.author_id)
        }));

        // Enrich and minimize decisions
        const enrichedDecisions = decisions.map(d => ({
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
            created_date: d.created_date,
            decider: d.decided_by_type === 'internal_user' ? userMap.get(d.decided_by_id) : contactMap.get(d.decided_by_id)
        }));

        // Minimize attachments
        const minimalAttachments = attachments.map(a => ({
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

        const executionTime = Date.now() - startTime;
        console.log(`[publicClientRequestDetail] ${executionTime}ms | Users:${users.length} Contacts:${clientContacts.length}`);

        return Response.json({
            success: true,
            access: {
                id: access.id,
                access_role: access.access_role,
                client_contact_id: access.client_contact_id
            },
            request: {
                id: request.id,
                title: request.title,
                body: request.body,
                request_type: request.request_type,
                status: request.status,
                due_date: request.due_date,
                posted_at: request.posted_at,
                project_id: request.project_id,
                created_date: request.created_date,
                creator: requestCreator
            },
            comments: enrichedComments,
            decisions: enrichedDecisions,
            attachments: minimalAttachments,
            todoTasks: enrichedTodoTasks,
            assignableUsers: assignableUsers,
            assignableContacts: projectClients.map(c => ({ id: c.id, name: c.name, type: 'client_contact' }))
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in publicClientRequestDetail:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});

// Batched fetch by IDs - avoids N+1 while not fetching entire table
async function fetchByIdsBatched(entity, ids) {
    if (!ids || ids.length === 0) return [];
    
    const uniqueIds = [...new Set(ids)];
    const BATCH_SIZE = 25;
    const CONCURRENCY = 10;
    const results = [];
    
    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE * CONCURRENCY) {
        const batchPromises = [];
        
        for (let j = 0; j < CONCURRENCY && (i + j * BATCH_SIZE) < uniqueIds.length; j++) {
            const start = i + j * BATCH_SIZE;
            const batchIds = uniqueIds.slice(start, start + BATCH_SIZE);
            
            batchPromises.push(
                Promise.all(batchIds.map(id => 
                    entity.filter({ id }).catch(() => [])
                )).then(res => res.flat())
            );
        }
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.flat());
    }
    
    return results;
}