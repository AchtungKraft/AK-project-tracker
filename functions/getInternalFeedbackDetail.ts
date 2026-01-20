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
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { 
                status: 401,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        let requestId, projectId;
        
        try {
            const contentType = req.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const body = await req.json();
                requestId = body.requestId;
                projectId = body.projectId;
            }
        } catch (e) {
            const url = new URL(req.url);
            requestId = url.searchParams.get('requestId');
            projectId = url.searchParams.get('projectId');
        }

        if (!requestId) {
            return Response.json({ error: 'Missing requestId' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // STEP A: Fetch ONLY request-scoped entities in parallel
        const [
            requests,
            commentsRaw,
            decisionsRaw,
            attachmentsRaw,
            todoTasksRaw,
            linkedTasks,
        ] = await Promise.all([
            base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ToDoListTask.filter({ request_id: requestId }).catch(() => []),
            base44.asServiceRole.entities.ClientFeedbackTaskLink.filter({ feedback_request_id: requestId }),
        ]);

        const request = requests[0];
        if (!request) {
            return Response.json({ error: 'Request not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const projectIdForAccess = request.project_id || projectId;

        // STEP B: Derive minimal ID sets from request-scoped data
        const internalUserIds = new Set();
        const clientContactIds = new Set();
        const taskIds = new Set();

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

        // From attachments
        attachmentsRaw.forEach(a => {
            if (a.created_by_type === 'internal_user' && a.created_by_id) internalUserIds.add(a.created_by_id);
            else if (a.created_by_type === 'client_contact' && a.created_by_id) clientContactIds.add(a.created_by_id);
        });

        // From todo tasks
        todoTasksRaw.forEach(t => {
            if (t.assigned_to_type === 'internal_user' && t.assigned_to_id) internalUserIds.add(t.assigned_to_id);
            else if (t.assigned_to_type === 'client_contact' && t.assigned_to_id) clientContactIds.add(t.assigned_to_id);
        });

        // From linked tasks
        linkedTasks.forEach(link => {
            if (link.task_id) taskIds.add(link.task_id);
        });

        // STEP C: Fetch project data + referenced people in parallel (batched, not full lists)
        const [
            projects,
            projectClientAccesses,
            users,
            clientContacts,
            tasks,
        ] = await Promise.all([
            projectIdForAccess 
                ? base44.asServiceRole.entities.Project.filter({ id: projectIdForAccess })
                : Promise.resolve([]),
            projectIdForAccess
                ? base44.asServiceRole.entities.ProjectClientAccess.filter({ project_id: projectIdForAccess })
                : Promise.resolve([]),
            // Fetch ONLY referenced users (batched)
            fetchByIdsBatched(base44.asServiceRole.entities.User, [...internalUserIds]),
            // Fetch ONLY referenced contacts (batched)
            fetchByIdsBatched(base44.asServiceRole.entities.ClientContact, [...clientContactIds]),
            // Fetch ONLY linked tasks (batched)
            fetchByIdsBatched(base44.asServiceRole.entities.Task, [...taskIds]),
        ]);

        // Get contact IDs from project accesses for assignable list
        const activeAccesses = projectClientAccesses.filter(pa => pa.access_status === 'active');
        const accessContactIds = activeAccesses.map(pa => pa.client_contact_id).filter(id => !clientContactIds.has(id));
        
        // Fetch additional contacts for assignable list (only those not already fetched)
        const additionalContacts = accessContactIds.length > 0 
            ? await fetchByIdsBatched(base44.asServiceRole.entities.ClientContact, accessContactIds)
            : [];
        
        const allClientContacts = [...clientContacts, ...additionalContacts];

        // Build lookup maps
        const userMap = new Map(users.map(u => [u.id, { id: u.id, full_name: u.full_name, email: u.email }]));
        const contactMap = new Map(allClientContacts.map(c => [c.id, { id: c.id, name: c.name, url_slug: c.url_slug, active: c.active }]));

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

        // Enrich with minimal author/decider info
        const enrichedRequest = { 
            ...request, 
            creator: request.created_by_user_id ? userMap.get(request.created_by_user_id) : null 
        };

        const enrichedComments = comments.map(c => ({
            ...c,
            author: c.author_type === 'internal_user' ? userMap.get(c.author_id) : contactMap.get(c.author_id)
        }));

        const enrichedDecisions = decisions.map(d => ({
            ...d,
            decider: d.decided_by_type === 'internal_user' ? userMap.get(d.decided_by_id) : contactMap.get(d.decided_by_id)
        }));

        const enrichedAttachments = attachments.map(a => ({
            ...a,
            creator: a.created_by_type === 'internal_user' ? userMap.get(a.created_by_id) : contactMap.get(a.created_by_id)
        }));

        const taskMap = new Map(tasks.map(t => [t.id, t]));
        const linkedTaskDetails = linkedTasks
            .map(link => {
                const task = taskMap.get(link.task_id);
                return task ? { ...link, task } : null;
            })
            .filter(Boolean);

        const enrichedTodoTasks = todoTasksRaw.map(t => ({
            ...t,
            assignee: t.assigned_to_type === 'internal_user' ? userMap.get(t.assigned_to_id) : contactMap.get(t.assigned_to_id)
        }));

        // Build assignable lists from project accesses (not global lists)
        const projectClientContactIds = new Set(activeAccesses.map(pa => pa.client_contact_id));
        const projectClients = allClientContacts.filter(c => projectClientContactIds.has(c.id) && c.active !== false);

        // Get primary client slug
        let primaryClientSlug = null;
        for (const access of activeAccesses) {
            const contact = contactMap.get(access.client_contact_id);
            if (contact?.url_slug) {
                primaryClientSlug = contact.url_slug;
                break;
            }
            if (access.url_slug && !primaryClientSlug) {
                primaryClientSlug = access.url_slug;
            }
        }

        // For assignable users, we need team members - but ONLY fetch if there are project accesses
        // This is a targeted fetch, not User.list() or TeamMember.list()
        let assignableUsers = [];
        if (projectIdForAccess) {
            // Fetch team members with user_ids who are Achtung Kraft members
            const teamMembers = await base44.asServiceRole.entities.TeamMember.filter({ is_achtung_kraft_member: true });
            const akUserIds = teamMembers.filter(tm => tm.user_id).map(tm => tm.user_id);
            const neededAkUserIds = akUserIds.filter(id => !userMap.has(id));
            
            if (neededAkUserIds.length > 0) {
                const akUsers = await fetchByIdsBatched(base44.asServiceRole.entities.User, neededAkUserIds);
                akUsers.forEach(u => userMap.set(u.id, { id: u.id, full_name: u.full_name, email: u.email }));
            }
            
            assignableUsers = teamMembers
                .filter(tm => tm.user_id)
                .map(tm => {
                    const userRecord = userMap.get(tm.user_id);
                    return userRecord ? { id: userRecord.id, full_name: tm.full_name || userRecord.full_name, type: 'internal_user' } : null;
                })
                .filter(Boolean);
        }

        const assignableContacts = projectClients.map(c => ({ id: c.id, name: c.name, type: 'client_contact' }));

        const executionTime = Date.now() - startTime;
        const payloadSize = JSON.stringify({
            request: enrichedRequest,
            comments: enrichedComments,
            decisions: enrichedDecisions,
            attachments: enrichedAttachments,
        }).length;

        console.log(`[getInternalFeedbackDetail] ${executionTime}ms | Users:${users.length} Contacts:${allClientContacts.length} | Payload:${Math.round(payloadSize/1024)}KB`);

        return Response.json({
            success: true,
            request: enrichedRequest,
            comments: enrichedComments,
            decisions: enrichedDecisions,
            attachments: enrichedAttachments,
            todoTasks: enrichedTodoTasks,
            linkedTasks: linkedTaskDetails,
            project: projects[0] || null,
            users: [...userMap.values()],
            clientContacts: [...contactMap.values()],
            assignableUsers,
            assignableContacts,
            primaryClientSlug,
            _debug: { executionTimeMs: executionTime, userCount: users.length, contactCount: allClientContacts.length }
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in getInternalFeedbackDetail:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});

// Batched fetch by IDs - avoids N+1 while not fetching entire table
// Uses bounded concurrency (10) and batch size (25)
async function fetchByIdsBatched(entity, ids) {
    if (!ids || ids.length === 0) return [];
    
    const uniqueIds = [...new Set(ids)];
    const BATCH_SIZE = 25;
    const CONCURRENCY = 10;
    const results = [];
    
    // Process in batches with bounded concurrency
    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE * CONCURRENCY) {
        const batchPromises = [];
        
        for (let j = 0; j < CONCURRENCY && (i + j * BATCH_SIZE) < uniqueIds.length; j++) {
            const start = i + j * BATCH_SIZE;
            const batchIds = uniqueIds.slice(start, start + BATCH_SIZE);
            
            // Fetch each ID in the batch in parallel
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