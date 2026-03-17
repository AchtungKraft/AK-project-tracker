import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ── Server-side comment normalizer (authoritative) ──────────────────
function normalizeComment(comment, attachments) {
    // Gather attachments belonging to this comment
    const commentAttachments = attachments.filter(a => a.comment_id === comment.id);

    // --- content chain: content_html → content_fallback → body ---
    const contentHtml = comment.content_html || null;
    const body = comment.body || '';
    const contentFallback = comment.content_fallback || body;

    // --- links: merge inline + attachment-sourced ---
    let links = [];
    if (Array.isArray(comment.links) && comment.links.length > 0) {
        links = comment.links.map((link, idx) => {
            if (typeof link === 'string') {
                return { id: `legacy-${idx}`, name: link, url: link, description: '', type: 'external' };
            }
            return {
                id: link.id || `link-${idx}`,
                name: link.name || link.url || '',
                url: link.url || '',
                description: link.description || '',
                type: link.type || 'external',
            };
        });
    } else {
        // Fall back to attachment-sourced links
        links = commentAttachments
            .filter(a => a.attachment_type === 'link')
            .map((a, idx) => ({
                id: a.id || `att-link-${idx}`,
                name: a.label || a.link_url || '',
                url: a.link_url || '',
                description: '',
                type: 'external',
            }));
    }

    // --- photos: merge inline + attachment-sourced ---
    let photos = [];
    if (Array.isArray(comment.photos) && comment.photos.length > 0) {
        photos = comment.photos.filter(Boolean);
    } else {
        photos = commentAttachments
            .filter(a => a.attachment_type === 'image')
            .map(a => a.file_url)
            .filter(Boolean);
    }

    // --- files: merge inline + attachment-sourced ---
    let files = [];
    if (Array.isArray(comment.files) && comment.files.length > 0) {
        files = comment.files.map(f => ({
            name: f.name || 'File',
            url: f.url || '',
        }));
    } else {
        files = commentAttachments
            .filter(a => a.attachment_type === 'file')
            .map(a => ({
                name: a.label || 'File',
                url: a.file_url || '',
            }));
    }

    return {
        id: comment.id,
        request_id: comment.request_id,
        author_type: comment.author_type,
        author_id: comment.author_id,
        content_html: contentHtml,
        content_fallback: contentFallback,
        body: body,
        links,
        photos,
        files,
        visibility: comment.visibility || 'client_visible',
        target_type: comment.target_type || 'request',
        target_attachment_id: comment.target_attachment_id || null,
        posted_at: comment.posted_at,
        created_date: comment.created_date,
        created_by: comment.created_by,
        // Enrichment fields (added later)
        author: comment.author || null,
        author_display_name: comment.author_display_name || null,
    };
}

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

        if (request.created_by_user_id) internalUserIds.add(request.created_by_user_id);

        commentsRaw.forEach(c => {
            if (c.author_type === 'internal_user' && c.author_id) internalUserIds.add(c.author_id);
            else if (c.author_type === 'client_contact' && c.author_id) clientContactIds.add(c.author_id);
        });

        decisionsRaw.forEach(d => {
            if (d.decided_by_type === 'internal_user' && d.decided_by_id) internalUserIds.add(d.decided_by_id);
            else if (d.decided_by_type === 'client_contact' && d.decided_by_id) clientContactIds.add(d.decided_by_id);
        });

        attachmentsRaw.forEach(a => {
            if (a.created_by_type === 'internal_user' && a.created_by_id) internalUserIds.add(a.created_by_id);
            else if (a.created_by_type === 'client_contact' && a.created_by_id) clientContactIds.add(a.created_by_id);
        });

        todoTasksRaw.forEach(t => {
            if (t.assigned_to_type === 'internal_user' && t.assigned_to_id) internalUserIds.add(t.assigned_to_id);
            else if (t.assigned_to_type === 'client_contact' && t.assigned_to_id) clientContactIds.add(t.assigned_to_id);
        });

        linkedTasks.forEach(link => {
            if (link.task_id) taskIds.add(link.task_id);
        });

        // STEP C: Fetch project data + referenced people in parallel
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
            fetchByIdsBatched(base44.asServiceRole.entities.User, [...internalUserIds]),
            fetchByIdsBatched(base44.asServiceRole.entities.ClientContact, [...clientContactIds]),
            fetchByIdsBatched(base44.asServiceRole.entities.Task, [...taskIds]),
        ]);

        const activeAccesses = projectClientAccesses.filter(pa => pa.access_status === 'active');
        const accessContactIds = activeAccesses.map(pa => pa.client_contact_id).filter(id => !clientContactIds.has(id));
        
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

        // Enrich request
        const enrichedRequest = { 
            ...request, 
            creator: request.created_by_user_id ? userMap.get(request.created_by_user_id) : null 
        };

        // ── NORMALIZED COMMENTS ──────────────────────────────────────
        const enrichedComments = comments.map(c => {
            const author = c.author_type === 'internal_user' ? userMap.get(c.author_id) : contactMap.get(c.author_id);
            const normalized = normalizeComment({ ...c, author, author_display_name: author?.full_name || author?.name || 'System' }, attachments);
            return normalized;
        });

        const enrichedDecisions = decisions.map(d => {
            const decider = d.decided_by_type === 'internal_user' ? userMap.get(d.decided_by_id) : contactMap.get(d.decided_by_id);
            
            let decider_display_name = null;
            if (d.decided_by_type === 'client_contact' && contactMap.get(d.decided_by_id)) {
                decider_display_name = contactMap.get(d.decided_by_id).name;
            } else if (d.decided_by_type === 'internal_user' && userMap.get(d.decided_by_id)) {
                decider_display_name = userMap.get(d.decided_by_id).full_name;
            } else if (d.decided_by_type === 'client_contact') {
                decider_display_name = 'Client';
            }
            if (!decider_display_name) {
                decider_display_name = 'System';
            }
            
            return {
                ...d,
                decider,
                decider_display_name
            };
        });

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

        const projectClientContactIds = new Set(activeAccesses.map(pa => pa.client_contact_id));
        const projectClients = allClientContacts.filter(c => projectClientContactIds.has(c.id) && c.active !== false);

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

        let assignableUsers = [];
        if (projectIdForAccess) {
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

        console.log(`[getInternalFeedbackDetail] ${executionTime}ms | Users:${users.length} Contacts:${allClientContacts.length}`);

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

// Batched fetch by IDs
async function fetchByIdsBatched(entity, ids) {
    if (!ids || ids.length === 0) return [];
    const uniqueIds = [...new Set(ids)];
    try {
        return await entity.filter({ id: { $in: uniqueIds } });
    } catch (error) {
        console.error('fetchByIdsBatched error:', error);
        return [];
    }
}