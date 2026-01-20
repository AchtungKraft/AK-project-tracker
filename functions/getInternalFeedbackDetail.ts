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

        // PHASE 1: Fetch only request-specific data (not global lists)
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

        // PHASE 2: Collect only the IDs we actually need
        const neededUserIds = new Set();
        const neededContactIds = new Set();
        const neededTaskIds = new Set();

        // From request creator
        if (request.created_by_user_id) {
            neededUserIds.add(request.created_by_user_id);
        }

        // From comments
        commentsRaw.forEach(c => {
            if (c.author_type === 'internal_user' && c.author_id) {
                neededUserIds.add(c.author_id);
            } else if (c.author_type === 'client_contact' && c.author_id) {
                neededContactIds.add(c.author_id);
            }
        });

        // From decisions
        decisionsRaw.forEach(d => {
            if (d.decided_by_type === 'internal_user' && d.decided_by_id) {
                neededUserIds.add(d.decided_by_id);
            } else if (d.decided_by_type === 'client_contact' && d.decided_by_id) {
                neededContactIds.add(d.decided_by_id);
            }
        });

        // From attachments
        attachmentsRaw.forEach(a => {
            if (a.created_by_type === 'internal_user' && a.created_by_id) {
                neededUserIds.add(a.created_by_id);
            } else if (a.created_by_type === 'client_contact' && a.created_by_id) {
                neededContactIds.add(a.created_by_id);
            }
        });

        // From todo tasks
        todoTasksRaw.forEach(t => {
            if (t.assigned_to_type === 'internal_user' && t.assigned_to_id) {
                neededUserIds.add(t.assigned_to_id);
            } else if (t.assigned_to_type === 'client_contact' && t.assigned_to_id) {
                neededContactIds.add(t.assigned_to_id);
            }
        });

        // From linked tasks
        linkedTasks.forEach(link => {
            if (link.task_id) {
                neededTaskIds.add(link.task_id);
            }
        });

        const projectIdForAccess = request.project_id || projectId;

        // PHASE 3: Fetch only needed records in parallel
        const [
            users,
            clientContacts,
            tasks,
            projects,
            projectClientAccesses,
            teamMembers
        ] = await Promise.all([
            // Fetch only needed users (batch by filtering if possible, or individual)
            neededUserIds.size > 0 
                ? fetchByIds(base44.asServiceRole.entities.User, [...neededUserIds])
                : Promise.resolve([]),
            // Fetch only needed contacts
            neededContactIds.size > 0
                ? fetchByIds(base44.asServiceRole.entities.ClientContact, [...neededContactIds])
                : Promise.resolve([]),
            // Fetch only linked tasks
            neededTaskIds.size > 0
                ? fetchByIds(base44.asServiceRole.entities.Task, [...neededTaskIds])
                : Promise.resolve([]),
            // Fetch single project
            projectIdForAccess 
                ? base44.asServiceRole.entities.Project.filter({ id: projectIdForAccess })
                : Promise.resolve([]),
            // Fetch only project-specific accesses
            projectIdForAccess
                ? base44.asServiceRole.entities.ProjectClientAccess.filter({ project_id: projectIdForAccess })
                : Promise.resolve([]),
            // Fetch team members (needed for assignable users - this is smaller than User.list())
            base44.asServiceRole.entities.TeamMember.list().catch(() => [])
        ]);

        // Get additional contacts from project access (for assignable contacts)
        const accessContactIds = projectClientAccesses
            .filter(pa => pa.access_status === 'active' && pa.client_contact_id)
            .map(pa => pa.client_contact_id)
            .filter(id => !neededContactIds.has(id));
        
        let additionalContacts = [];
        if (accessContactIds.length > 0) {
            additionalContacts = await fetchByIds(base44.asServiceRole.entities.ClientContact, accessContactIds);
        }
        
        const allClientContacts = [...clientContacts, ...additionalContacts];

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
                : allClientContacts.find(c => c.id === comment.author_id);
            return { ...comment, author };
        });

        // Enrich decisions with decider details
        const enrichedDecisions = decisions.map(decision => {
            const decider = decision.decided_by_type === 'internal_user'
                ? users.find(u => u.id === decision.decided_by_id)
                : allClientContacts.find(c => c.id === decision.decided_by_id);
            return { ...decision, decider };
        });

        // Enrich attachments with creator details
        const enrichedAttachments = attachments.map(attachment => {
            const creator = attachment.created_by_type === 'internal_user'
                ? users.find(u => u.id === attachment.created_by_id)
                : allClientContacts.find(c => c.id === attachment.created_by_id);
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
                : allClientContacts.find(c => c.id === t.assigned_to_id);
            return { ...t, assignee };
        });

        // Get project-specific client contacts for assignable list
        const projectAccesses = projectClientAccesses.filter(
            pa => pa.access_status === 'active'
        );
        const projectClientContactIds = projectAccesses.map(pa => pa.client_contact_id);
        const projectClients = allClientContacts.filter(c => projectClientContactIds.includes(c.id) && c.active);

        // Get primary client slug for client portal URLs
        let primaryClientSlug = null;
        for (const access of projectAccesses) {
            const contact = allClientContacts.find(c => c.id === access.client_contact_id);
            if (contact?.url_slug) {
                primaryClientSlug = contact.url_slug;
                break;
            }
            if (access.url_slug && !primaryClientSlug) {
                primaryClientSlug = access.url_slug;
            }
        }

        // Get Achtung Kraft team members (is_achtung_kraft_member = true)
        const achtungKraftMembers = teamMembers.filter(tm => tm.is_achtung_kraft_member);
        
        // Build assignable users: only Achtung Kraft members (matched to User records)
        // Fetch only the users we need for assignable list
        const akUserIds = achtungKraftMembers.filter(tm => tm.user_id).map(tm => tm.user_id);
        const akUsersNeeded = akUserIds.filter(id => !neededUserIds.has(id));
        
        let akUsers = users.filter(u => akUserIds.includes(u.id));
        if (akUsersNeeded.length > 0) {
            const additionalAkUsers = await fetchByIds(base44.asServiceRole.entities.User, akUsersNeeded);
            akUsers = [...akUsers, ...additionalAkUsers];
        }
        
        const assignableUsers = achtungKraftMembers
            .filter(tm => tm.user_id)
            .map(tm => {
                const userRecord = akUsers.find(u => u.id === tm.user_id);
                return userRecord ? { id: userRecord.id, full_name: tm.full_name || userRecord.full_name, type: 'internal_user' } : null;
            })
            .filter(Boolean);

        // Only project-assigned clients
        const assignableContacts = projectClients.map(c => ({ id: c.id, name: c.name, type: 'client_contact' }));

        const endTime = Date.now();
        const executionTime = endTime - startTime;

        // Log performance metrics
        console.log(`[getInternalFeedbackDetail] Performance metrics:
  - Execution time: ${executionTime}ms
  - Users fetched: ${users.length + (akUsersNeeded.length > 0 ? akUsersNeeded.length : 0)} (needed: ${neededUserIds.size})
  - Contacts fetched: ${allClientContacts.length} (needed: ${neededContactIds.size + accessContactIds.length})
  - Tasks fetched: ${tasks.length} (needed: ${neededTaskIds.size})
  - Comments: ${comments.length}
  - Decisions: ${decisions.length}
  - Attachments: ${attachments.length}`);

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
            clientContacts: allClientContacts,
            assignableUsers,
            assignableContacts,
            primaryClientSlug,
            _debug: {
                executionTimeMs: executionTime,
                counts: {
                    users: users.length,
                    contacts: allClientContacts.length,
                    tasks: tasks.length,
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

// Helper function to fetch records by IDs efficiently
// Uses parallel filter calls for each ID (Base44 doesn't support IN queries)
async function fetchByIds(entity, ids) {
    if (!ids || ids.length === 0) return [];
    
    // Deduplicate IDs
    const uniqueIds = [...new Set(ids)];
    
    // For small sets, fetch individually in parallel
    if (uniqueIds.length <= 20) {
        const results = await Promise.all(
            uniqueIds.map(id => entity.filter({ id }).catch(() => []))
        );
        return results.flat();
    }
    
    // For larger sets, fall back to list and filter client-side
    // This is still more efficient than the original if we only need a subset
    const all = await entity.list();
    const idSet = new Set(uniqueIds);
    return all.filter(item => idSet.has(item.id));
}