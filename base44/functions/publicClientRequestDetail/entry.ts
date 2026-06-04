import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Retry wrapper — only retries 429s
async function withRetry(fn, retries = 3, delayMs = 500) {
    let lastError;
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (!err?.message?.includes('Rate limit') || i === retries) {
                throw err;
            }
            console.warn('RATE LIMIT RETRY', { retriesLeft: retries - i, delayMs });
            await new Promise(r => setTimeout(r, delayMs));
            delayMs *= 2;
        }
    }
    throw lastError;
}

function safeArray(val) {
    return Array.isArray(val) ? val : [];
}

// PERF: All pause() calls removed — artificial 50ms delays eliminated.
// Was 10 pause() × 50ms = 500ms of dead time. Retry handles real 429s.

const REQUEST_TYPE_UI = {
    question: { label: "Question", color: "#3b82f6" },
    feedback_needed: { label: "Review Required", color: "#6366f1" },
    design_review: { label: "Design Review", color: "#a855f7" },
    client_need: { label: "Need From Client", color: "#f59e0b" },
    todo_list: { label: "Task List", color: "#14b8a6" },
    update: { label: "Project Update", color: "#6b7280" },
    budget_review: { label: "Budget Review", color: "#e11d48" },
    deliverable_review: { label: "Deliverable Review", color: "#10b981" }
};

const getRequestTypeInfo = (type) => {
    return REQUEST_TYPE_UI[type] || { label: type || "General", color: "#6b7280" };
};

// Server-side comment normalizer
function normalizeComment(comment, attachmentsByCommentId) {
    const commentAttachments = attachmentsByCommentId.get(comment.id) || [];

    const contentHtml = comment.content_html || null;
    const body = comment.body || '';
    const contentFallback = comment.content_fallback || body;

    let links = [];
    if (Array.isArray(comment.links) && comment.links.length > 0) {
        links = comment.links.map((link, idx) => {
            if (typeof link === 'string') {
                return { id: `legacy-${idx}`, name: link, url: link, description: null, type: 'external' };
            }
            return {
                id: link.id || `link-${idx}`,
                name: link.name || link.url || '',
                url: link.url || '',
                description:
                    typeof link.description === 'string' && link.description.trim().length > 0
                        ? link.description.trim()
                        : null,
                type: link.type || 'external',
            };
        });
    } else {
        links = commentAttachments
            .filter(a => a.attachment_type === 'link')
            .map((a, idx) => ({
                id: a.id || `att-link-${idx}`,
                name: a.label || a.link_url || '',
                url: a.link_url || '',
                description: null,
                type: 'external',
            }));
    }

    const isSafeImage = (a) => {
        if (a.mime_type && a.mime_type.toLowerCase() === 'image/svg+xml') return false;
        return a.attachment_type === 'image';
    };
    let photos = [];
    if (Array.isArray(comment.photos) && comment.photos.length > 0) {
        photos = comment.photos.filter(Boolean);
    } else {
        photos = commentAttachments.filter(isSafeImage).map(a => a.file_url).filter(Boolean);
    }

    let files = [];
    if (Array.isArray(comment.files) && comment.files.length > 0) {
        files = comment.files.map(f => ({ name: f.name || 'File', url: f.url || '' }));
    } else {
        files = commentAttachments
            .filter(a => a.attachment_type === 'file')
            .map(a => ({ name: a.label || 'File', url: a.file_url || '' }));
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
        author: comment.author || null,
        author_display_name: comment.author_display_name || null,
    };
}

const EMPTY_RESPONSE = {
    success: false,
    access: null,
    request: null,
    comments: [],
    decisions: [],
    attachments: [],
    todoTasks: [],
    taskGroups: [],
    assignableUsers: [],
    assignableContacts: []
};

// Batched fetch by IDs
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
async function fetchByIdsBatched(entity, ids) {
    if (!ids || ids.length === 0) return [];
    const uniqueIds = [...new Set(ids)].filter(id => OBJECT_ID_RE.test(id));
    if (uniqueIds.length === 0) return [];
    try {
        return safeArray(await withRetry(() => entity.filter({ id: { $in: uniqueIds } })));
    } catch (error) {
        console.error('fetchByIdsBatched error:', error.message);
        return [];
    }
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

    let token, slug, requestId;

    try {
        const base44 = createClientFromRequest(req);
        
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

        // ── PHASE 1: Fetch request (sequential — has early exit) ──
        const requestResults = safeArray(await withRetry(() =>
            base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId })
        ));
        const request = requestResults[0] || null;

        if (!request) {
            return Response.json({ ...EMPTY_RESPONSE, error: 'Request not found' }, { 
                status: 200,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // ── PHASE 2: Auth + slug resolution (sequential — has early exit) ──
        let clientContactId;
        if (slug) {
            const contactResults = safeArray(await withRetry(() =>
                base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug, active: true })
            ));
            if (contactResults.length === 0) {
                return Response.json({ ...EMPTY_RESPONSE, error: 'Invalid slug' }, { 
                    status: 200,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            clientContactId = contactResults[0].id;
        }

        const accessFilter = { project_id: request.project_id, access_status: 'active' };
        if (token) accessFilter.share_token = token;
        if (clientContactId) accessFilter.client_contact_id = clientContactId;

        const accesses = safeArray(await withRetry(() =>
            base44.asServiceRole.entities.ProjectClientAccess.filter(accessFilter)
        ));
        
        if (accesses.length === 0) {
            return Response.json({ ...EMPTY_RESPONSE, error: 'Invalid access' }, { 
                status: 200,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const access = accesses[0];

        // ── PHASE 3: Parallel fetch — ALL request-scoped data at once ──
        // These 6 reads are completely independent of each other.
        const [
            commentsRaw,
            decisionsRaw,
            attachmentsRaw,
            todoTasksRaw,
            projectClientAccesses,
            taskGroupsRaw,
        ] = await Promise.all([
            withRetry(() => base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: requestId })).then(r => safeArray(r)),
            withRetry(() => base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId })).then(r => safeArray(r)),
            withRetry(() => base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId })).then(r => safeArray(r)),
            withRetry(() => base44.asServiceRole.entities.ToDoListTask.filter({ request_id: requestId })).then(r => safeArray(r)).catch(() => []),
            withRetry(() => base44.asServiceRole.entities.ProjectClientAccess.filter({ project_id: request.project_id, access_status: 'active' })).then(r => safeArray(r)),
            withRetry(() => base44.asServiceRole.entities.TaskGroup.filter({ request_id: requestId })).then(r => safeArray(r)).catch(() => []),
        ]);

        // ── PHASE 4: Build ID sets for enrichment ──
        const internalUserIds = new Set();
        const clientContactIds = new Set();

        if (request.created_by_user_id) internalUserIds.add(request.created_by_user_id);

        for (const c of commentsRaw) {
            if (c.author_type === 'internal_user' && c.author_id) internalUserIds.add(c.author_id);
            else if (c.author_type === 'client_contact' && c.author_id) clientContactIds.add(c.author_id);
        }
        for (const d of decisionsRaw) {
            if (d.decided_by_type === 'internal_user' && d.decided_by_id) internalUserIds.add(d.decided_by_id);
            else if (d.decided_by_type === 'client_contact' && d.decided_by_id) clientContactIds.add(d.decided_by_id);
        }
        for (const t of todoTasksRaw) {
            if (t.assigned_to_type === 'internal_user' && t.assigned_to_id) internalUserIds.add(t.assigned_to_id);
            else if (t.assigned_to_type === 'client_contact' && t.assigned_to_id) clientContactIds.add(t.assigned_to_id);
        }
        for (const pa of projectClientAccesses) {
            if (pa.client_contact_id) clientContactIds.add(pa.client_contact_id);
        }

        // ── PHASE 5: Parallel fetch — users, contacts, team members ──
        const [users, clientContacts, teamMembers] = await Promise.all([
            fetchByIdsBatched(base44.asServiceRole.entities.User, [...internalUserIds]),
            fetchByIdsBatched(base44.asServiceRole.entities.ClientContact, [...clientContactIds]),
            withRetry(() => base44.asServiceRole.entities.TeamMember.filter({ is_achtung_kraft_member: true })).then(r => safeArray(r)),
        ]);

        // Fold AK team member user_ids and do single additional fetch if needed
        const akUserIds = teamMembers.filter(tm => tm.user_id).map(tm => tm.user_id);
        const neededAkUserIds = akUserIds.filter(id => !internalUserIds.has(id));
        
        let akUsers = users;
        if (neededAkUserIds.length > 0) {
            const additionalUsers = safeArray(await fetchByIdsBatched(base44.asServiceRole.entities.User, neededAkUserIds));
            akUsers = [...users, ...additionalUsers];
        }

        // ── PHASE 6: Build maps and enrich (no more entity reads) ──
        const userMap = new Map(akUsers.map(u => [u.id, { id: u.id, full_name: u.full_name }]));
        const contactMap = new Map(clientContacts.map(c => [c.id, { id: c.id, name: c.name, active: c.active }]));

        // Build attachment index for O(1) comment lookups
        const attachmentsByCommentId = new Map();
        for (const a of attachmentsRaw) {
            if (a.comment_id) {
                let list = attachmentsByCommentId.get(a.comment_id);
                if (!list) { list = []; attachmentsByCommentId.set(a.comment_id, list); }
                list.push(a);
            }
        }

        // Sort
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
            group_id: t.group_id || null,
            title: t.title,
            is_complete: t.is_complete,
            completed_at: t.completed_at,
            assigned_to_id: t.assigned_to_id,
            assigned_to_type: t.assigned_to_type,
            details: t.details,
            images: t.images,
            due_date: t.due_date,
            order: t.order || 0,
            created_date: t.created_date,
            created_by: t.created_by,
            assignee: t.assigned_to_type === 'internal_user' ? userMap.get(t.assigned_to_id) : contactMap.get(t.assigned_to_id)
        }));

        const taskGroups = [...taskGroupsRaw].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        // Assignable lists
        const projectClientContactIds = projectClientAccesses.map(pa => pa.client_contact_id);
        const projectClients = clientContacts.filter(c => projectClientContactIds.includes(c.id) && c.active !== false);

        const assignableUsers = teamMembers
            .filter(tm => tm.user_id)
            .map(tm => {
                const userRecord = userMap.get(tm.user_id);
                return userRecord ? { id: userRecord.id, full_name: tm.full_name || userRecord.full_name, type: 'internal_user' } : null;
            })
            .filter(Boolean);

        const requestCreator = request.created_by_user_id ? userMap.get(request.created_by_user_id) : null;

        // Normalized comments — uses pre-indexed attachmentsByCommentId
        const enrichedComments = comments.map(c => {
            const author = c.author_type === 'internal_user' ? userMap.get(c.author_id) : contactMap.get(c.author_id);
            return normalizeComment({
                ...c,
                author,
                author_display_name: author?.full_name || author?.name || 'System'
            }, attachmentsByCommentId);
        });

        // Enrich decisions
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
                decider,
                decider_display_name
            };
        });

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

        const typeInfo = getRequestTypeInfo(request.request_type);

        const executionTime = Date.now() - startTime;
        console.log(`[publicClientRequestDetail] ${executionTime}ms | comments:${enrichedComments.length} decisions:${enrichedDecisions.length} attachments:${minimalAttachments.length} todos:${enrichedTodoTasks.length}`);

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
                request_type: request.request_type || null,
                request_type_label: typeInfo.label,
                request_type_color: typeInfo.color,
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
            taskGroups,
            assignableUsers: assignableUsers,
            assignableContacts: projectClients.map(c => ({ id: c.id, name: c.name, type: 'client_contact' }))
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error('UPSTREAM REQUEST DETAIL FAILURE', {
            requestId,
            slug,
            message: error.message,
            status: error?.status,
        });
        return Response.json({
            ...EMPTY_RESPONSE,
            error: error.message
        }, { 
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});