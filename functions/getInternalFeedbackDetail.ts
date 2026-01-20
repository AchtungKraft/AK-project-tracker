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
        
        // Verify user is authenticated
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

        // PHASE 1: Fetch request-specific data + commonly needed lists in ONE parallel batch
        // Trade-off: fetching User.list() and TeamMember.list() is faster than multiple individual fetches
        const [
            requests,
            commentsRaw,
            decisionsRaw,
            attachmentsRaw,
            todoTasksRaw,
            linkedTasks,
            allUsers,
            allTeamMembers,
        ] = await Promise.all([
            base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ToDoListTask.filter({ request_id: requestId }).catch(() => []),
            base44.asServiceRole.entities.ClientFeedbackTaskLink.filter({ feedback_request_id: requestId }),
            base44.asServiceRole.entities.User.list(),
            base44.asServiceRole.entities.TeamMember.list().catch(() => []),
        ]);

        const request = requests[0];
        if (!request) {
            return Response.json({ error: 'Request not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const projectIdForAccess = request.project_id || projectId;

        // PHASE 2: Fetch project-specific data + contacts (smaller dataset, targeted)
        const neededContactIds = new Set();
        const neededTaskIds = new Set();

        // Collect contact IDs from comments/decisions/attachments/todos
        commentsRaw.forEach(c => {
            if (c.author_type === 'client_contact' && c.author_id) neededContactIds.add(c.author_id);
        });
        decisionsRaw.forEach(d => {
            if (d.decided_by_type === 'client_contact' && d.decided_by_id) neededContactIds.add(d.decided_by_id);
        });
        attachmentsRaw.forEach(a => {
            if (a.created_by_type === 'client_contact' && a.created_by_id) neededContactIds.add(a.created_by_id);
        });
        todoTasksRaw.forEach(t => {
            if (t.assigned_to_type === 'client_contact' && t.assigned_to_id) neededContactIds.add(t.assigned_to_id);
        });
        linkedTasks.forEach(link => {
            if (link.task_id) neededTaskIds.add(link.task_id);
        });

        // Fetch project, accesses, and tasks in parallel
        const [
            projects,
            projectClientAccesses,
            allClientContacts,
            linkedTasksData,
        ] = await Promise.all([
            projectIdForAccess 
                ? base44.asServiceRole.entities.Project.filter({ id: projectIdForAccess })
                : Promise.resolve([]),
            projectIdForAccess
                ? base44.asServiceRole.entities.ProjectClientAccess.filter({ project_id: projectIdForAccess })
                : Promise.resolve([]),
            // Fetch all contacts for this project (usually small list)
            base44.asServiceRole.entities.ClientContact.list(),
            // Fetch linked tasks
            neededTaskIds.size > 0
                ? Promise.all([...neededTaskIds].map(id => 
                    base44.asServiceRole.entities.Task.filter({ id }).catch(() => [])
                  )).then(results => results.flat())
                : Promise.resolve([]),
        ]);

        // Sort by event timestamps
        const comments = [...commentsRaw].sort((a, b) => 
            new Date(b.posted_at || b.created_date) - new Date(a.posted_at || a.created_date)
        );
        const decisions = [...decisionsRaw].sort((a, b) => 
            new Date(b.decided_at || b.created_date) - new Date(a.decided_at || a.created_date)
        );
        const attachments = [...attachmentsRaw].sort((a, b) => 
            new Date(b.posted_at || b.created_date) - new Date(a.posted_at || a.created_date)
        );

        // Build lookup maps for fast enrichment
        const userMap = new Map(allUsers.map(u => [u.id, u]));
        const contactMap = new Map(allClientContacts.map(c => [c.id, c]));

        // Enrich request with creator
        const enrichedRequest = { 
            ...request, 
            creator: request.created_by_user_id ? userMap.get(request.created_by_user_id) : null 
        };

        // Enrich comments
        const enrichedComments = comments.map(c => ({
            ...c,
            author: c.author_type === 'internal_user' 
                ? userMap.get(c.author_id) 
                : contactMap.get(c.author_id)
        }));

        // Enrich decisions
        const enrichedDecisions = decisions.map(d => ({
            ...d,
            decider: d.decided_by_type === 'internal_user' 
                ? userMap.get(d.decided_by_id) 
                : contactMap.get(d.decided_by_id)
        }));

        // Enrich attachments
        const enrichedAttachments = attachments.map(a => ({
            ...a,
            creator: a.created_by_type === 'internal_user' 
                ? userMap.get(a.created_by_id) 
                : contactMap.get(a.created_by_id)
        }));

        // Build linked task details
        const taskMap = new Map(linkedTasksData.map(t => [t.id, t]));
        const linkedTaskDetails = linkedTasks
            .map(link => {
                const task = taskMap.get(link.task_id);
                return task ? { ...link, task } : null;
            })
            .filter(Boolean);

        // Enrich todo tasks
        const enrichedTodoTasks = todoTasksRaw.map(t => ({
            ...t,
            assignee: t.assigned_to_type === 'internal_user' 
                ? userMap.get(t.assigned_to_id) 
                : contactMap.get(t.assigned_to_id)
        }));

        // Get project-specific client contacts
        const activeAccesses = projectClientAccesses.filter(pa => pa.access_status === 'active');
        const projectClientContactIds = new Set(activeAccesses.map(pa => pa.client_contact_id));
        const projectClients = allClientContacts.filter(c => projectClientContactIds.has(c.id) && c.active);

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

        // Build assignable users from Achtung Kraft team members
        const achtungKraftMembers = allTeamMembers.filter(tm => tm.is_achtung_kraft_member);
        const assignableUsers = achtungKraftMembers
            .filter(tm => tm.user_id)
            .map(tm => {
                const userRecord = userMap.get(tm.user_id);
                return userRecord 
                    ? { id: userRecord.id, full_name: tm.full_name || userRecord.full_name, type: 'internal_user' } 
                    : null;
            })
            .filter(Boolean);

        const assignableContacts = projectClients.map(c => ({ id: c.id, name: c.name, type: 'client_contact' }));

        const executionTime = Date.now() - startTime;
        console.log(`[getInternalFeedbackDetail] ${executionTime}ms - Comments:${comments.length} Decisions:${decisions.length} Attachments:${attachments.length}`);

        return Response.json({
            success: true,
            request: enrichedRequest,
            comments: enrichedComments,
            decisions: enrichedDecisions,
            attachments: enrichedAttachments,
            todoTasks: enrichedTodoTasks,
            linkedTasks: linkedTaskDetails,
            project: projects[0] || null,
            users: allUsers,
            clientContacts: allClientContacts,
            assignableUsers,
            assignableContacts,
            primaryClientSlug,
            _debug: { executionTimeMs: executionTime }
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