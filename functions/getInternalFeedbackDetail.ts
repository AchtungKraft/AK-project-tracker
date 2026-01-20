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

        // SINGLE PARALLEL FETCH: Get all request-specific data AND lookup tables together
        // This eliminates the sequential phases that were causing slowness
        const [
            requests,
            commentsRaw,
            decisionsRaw,
            attachmentsRaw,
            todoTasksRaw,
            linkedTasks,
            allUsers,
            allClientContacts,
            allTasks,
            projects,
            projectClientAccesses,
            teamMembers
        ] = await Promise.all([
            base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ToDoListTask.filter({ request_id: requestId }).catch(() => []),
            base44.asServiceRole.entities.ClientFeedbackTaskLink.filter({ feedback_request_id: requestId }),
            // Fetch all users/contacts/tasks in parallel - faster than sequential ID lookups
            base44.asServiceRole.entities.User.list(),
            base44.asServiceRole.entities.ClientContact.list(),
            base44.asServiceRole.entities.Task.list(),
            projectId 
                ? base44.asServiceRole.entities.Project.filter({ id: projectId })
                : Promise.resolve([]),
            projectId
                ? base44.asServiceRole.entities.ProjectClientAccess.filter({ project_id: projectId })
                : Promise.resolve([]),
            base44.asServiceRole.entities.TeamMember.list().catch(() => [])
        ]);

        const request = requests[0];
        if (!request) {
            return Response.json({ error: 'Request not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // If projectId wasn't provided, fetch project data now
        let project = projects[0];
        let projectAccesses = projectClientAccesses;
        
        if (!project && request.project_id) {
            const [projectResult, accessResult] = await Promise.all([
                base44.asServiceRole.entities.Project.filter({ id: request.project_id }),
                base44.asServiceRole.entities.ProjectClientAccess.filter({ project_id: request.project_id })
            ]);
            project = projectResult[0];
            projectAccesses = accessResult;
        }

        // Build lookup maps for O(1) access
        const userMap = new Map(allUsers.map(u => [u.id, u]));
        const contactMap = new Map(allClientContacts.map(c => [c.id, c]));
        const taskMap = new Map(allTasks.map(t => [t.id, t]));

        // Sort by event timestamps
        const comments = [...commentsRaw].sort((a, b) => {
            const timeA = new Date(a.posted_at || a.created_date).getTime();
            const timeB = new Date(b.posted_at || b.created_date).getTime();
            return timeB - timeA;
        });

        const decisions = [...decisionsRaw].sort((a, b) => {
            const timeA = new Date(a.decided_at || a.created_date).getTime();
            const timeB = new Date(b.decided_at || b.created_date).getTime();
            return timeB - timeA;
        });

        const attachments = [...attachmentsRaw].sort((a, b) => {
            const timeA = new Date(a.posted_at || a.created_date).getTime();
            const timeB = new Date(b.posted_at || b.created_date).getTime();
            return timeB - timeA;
        });

        // Enrich request with creator
        const requestCreator = request.created_by_user_id
            ? userMap.get(request.created_by_user_id)
            : null;
        const enrichedRequest = { ...request, creator: requestCreator };

        // Enrich comments with author details
        const enrichedComments = comments.map(comment => {
            const author = comment.author_type === 'internal_user'
                ? userMap.get(comment.author_id)
                : contactMap.get(comment.author_id);
            return { ...comment, author };
        });

        // Enrich decisions with decider details
        const enrichedDecisions = decisions.map(decision => {
            const decider = decision.decided_by_type === 'internal_user'
                ? userMap.get(decision.decided_by_id)
                : contactMap.get(decision.decided_by_id);
            return { ...decision, decider };
        });

        // Enrich attachments with creator details
        const enrichedAttachments = attachments.map(attachment => {
            const creator = attachment.created_by_type === 'internal_user'
                ? userMap.get(attachment.created_by_id)
                : contactMap.get(attachment.created_by_id);
            return { ...attachment, creator };
        });

        // Build linked task details
        const linkedTaskDetails = linkedTasks.map(link => {
            const task = taskMap.get(link.task_id);
            return task ? { ...link, task } : null;
        }).filter(Boolean);

        // Enrich todo tasks with assignee info
        const enrichedTodoTasks = todoTasksRaw.map(t => {
            const assignee = t.assigned_to_type === 'internal_user'
                ? userMap.get(t.assigned_to_id)
                : contactMap.get(t.assigned_to_id);
            return { ...t, assignee };
        });

        // Get project-specific client contacts for assignable list
        const activeAccesses = (projectAccesses || []).filter(pa => pa.access_status === 'active');
        const projectClientContactIds = new Set(activeAccesses.map(pa => pa.client_contact_id));
        const projectClients = allClientContacts.filter(c => projectClientContactIds.has(c.id) && c.active);

        // Get primary client slug for client portal URLs
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

        // Get Achtung Kraft team members
        const achtungKraftMembers = teamMembers.filter(tm => tm.is_achtung_kraft_member);
        
        // Build assignable users
        const assignableUsers = achtungKraftMembers
            .filter(tm => tm.user_id)
            .map(tm => {
                const userRecord = userMap.get(tm.user_id);
                return userRecord 
                    ? { id: userRecord.id, full_name: tm.full_name || userRecord.full_name, type: 'internal_user' } 
                    : null;
            })
            .filter(Boolean);

        // Only project-assigned clients
        const assignableContacts = projectClients.map(c => ({ id: c.id, name: c.name, type: 'client_contact' }));

        // Collect IDs actually used (for minimal response)
        const usedUserIds = new Set();
        const usedContactIds = new Set();
        
        if (request.created_by_user_id) usedUserIds.add(request.created_by_user_id);
        comments.forEach(c => {
            if (c.author_type === 'internal_user') usedUserIds.add(c.author_id);
            else usedContactIds.add(c.author_id);
        });
        decisions.forEach(d => {
            if (d.decided_by_type === 'internal_user') usedUserIds.add(d.decided_by_id);
            else usedContactIds.add(d.decided_by_id);
        });
        assignableUsers.forEach(u => usedUserIds.add(u.id));
        projectClients.forEach(c => usedContactIds.add(c.id));

        // Return only the users/contacts that are actually needed
        const usedUsers = allUsers.filter(u => usedUserIds.has(u.id));
        const usedContacts = allClientContacts.filter(c => usedContactIds.has(c.id));

        const endTime = Date.now();
        const executionTime = endTime - startTime;

        // Log performance metrics
        console.log(`[getInternalFeedbackDetail] Performance: ${executionTime}ms | Comments: ${comments.length} | Decisions: ${decisions.length} | Attachments: ${attachments.length}`);

        return Response.json({
            success: true,
            request: enrichedRequest,
            comments: enrichedComments,
            decisions: enrichedDecisions,
            attachments: enrichedAttachments,
            todoTasks: enrichedTodoTasks,
            linkedTasks: linkedTaskDetails,
            project: project || null,
            users: usedUsers,
            clientContacts: usedContacts,
            assignableUsers,
            assignableContacts,
            primaryClientSlug,
            _debug: {
                executionTimeMs: executionTime,
                counts: {
                    users: usedUsers.length,
                    contacts: usedContacts.length,
                    comments: comments.length,
                    decisions: decisions.length,
                    attachments: attachments.length
                }
            }
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