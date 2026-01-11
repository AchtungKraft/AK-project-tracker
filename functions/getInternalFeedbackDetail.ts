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

        // Fetch all data in parallel for maximum performance
        const [
            requests,
            commentsRaw,
            decisionsRaw,
            attachmentsRaw,
            todoTasksRaw,
            users,
            clientContacts,
            linkedTasks,
            tasks,
            projects,
            projectClientAccesses,
            teamMembers
        ] = await Promise.all([
            base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId }),
            base44.asServiceRole.entities.ToDoListTask.filter({ request_id: requestId }).catch(() => []),
            base44.asServiceRole.entities.User.list(),
            base44.asServiceRole.entities.ClientContact.list(),
            base44.asServiceRole.entities.ClientFeedbackTaskLink.filter({ feedback_request_id: requestId }),
            base44.asServiceRole.entities.Task.list(),
            projectId ? base44.asServiceRole.entities.Project.filter({ id: projectId }) : Promise.resolve([]),
            base44.asServiceRole.entities.ProjectClientAccess.list(),
            base44.asServiceRole.entities.TeamMember.list().catch(() => [])
        ]);

        const request = requests[0];
        if (!request) {
            return Response.json({ error: 'Request not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

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
            ? users.find(u => u.id === request.created_by_user_id)
            : null;
        const enrichedRequest = { ...request, creator: requestCreator };

        // Enrich comments with author details
        const enrichedComments = comments.map(comment => {
            const author = comment.author_type === 'internal_user'
                ? users.find(u => u.id === comment.author_id)
                : clientContacts.find(c => c.id === comment.author_id);
            return { ...comment, author };
        });

        // Enrich decisions with decider details
        const enrichedDecisions = decisions.map(decision => {
            const decider = decision.decided_by_type === 'internal_user'
                ? users.find(u => u.id === decision.decided_by_id)
                : clientContacts.find(c => c.id === decision.decided_by_id);
            return { ...decision, decider };
        });

        // Enrich attachments with creator details
        const enrichedAttachments = attachments.map(attachment => {
            const creator = attachment.created_by_type === 'internal_user'
                ? users.find(u => u.id === attachment.created_by_id)
                : clientContacts.find(c => c.id === attachment.created_by_id);
            return { ...attachment, creator };
        });

        // Build linked task details
        const linkedTaskDetails = linkedTasks.map(link => {
            const task = tasks.find(t => t.id === link.task_id);
            return task ? { ...link, task } : null;
        }).filter(Boolean);

        // Enrich todo tasks with assignee info
        const enrichedTodoTasks = todoTasksRaw.map(t => {
            const assignee = t.assigned_to_type === 'internal_user'
                ? users.find(u => u.id === t.assigned_to_id)
                : clientContacts.find(c => c.id === t.assigned_to_id);
            return { ...t, assignee };
        });

        // Get project-specific client contacts
        const projectIdForAccess = request.project_id || projectId;
        const projectAccesses = projectClientAccesses.filter(
            pa => pa.project_id === projectIdForAccess && pa.access_status === 'active'
        );
        const projectClientContactIds = projectAccesses.map(pa => pa.client_contact_id);
        const projectClients = clientContacts.filter(c => projectClientContactIds.includes(c.id) && c.active);

        // Get Achtung Kraft team members (is_achtung_kraft_member = true)
        const achtungKraftMembers = teamMembers.filter(tm => tm.is_achtung_kraft_member);
        
        // Build assignable users: only Achtung Kraft members (matched to User records)
        const assignableUsers = achtungKraftMembers
            .filter(tm => tm.user_id)
            .map(tm => {
                const userRecord = users.find(u => u.id === tm.user_id);
                return userRecord ? { id: userRecord.id, full_name: tm.full_name || userRecord.full_name, type: 'internal_user' } : null;
            })
            .filter(Boolean);

        // Only project-assigned clients
        const assignableContacts = projectClients.map(c => ({ id: c.id, name: c.name, type: 'client_contact' }));

        return Response.json({
            success: true,
            request: enrichedRequest,
            comments: enrichedComments,
            decisions: enrichedDecisions,
            attachments: enrichedAttachments,
            todoTasks: enrichedTodoTasks,
            linkedTasks: linkedTaskDetails,
            project: projects[0] || null,
            users,
            clientContacts,
            assignableUsers,
            assignableContacts
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