import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Simple retry wrapper for rate-limit resilience
async function withRetry(fn, retries = 2, delayMs = 300) {
    try {
        return await fn();
    } catch (err) {
        if (retries > 0 && (err?.status === 429 || err?.message?.includes('Rate limit'))) {
            console.warn('RATE LIMIT RETRY', { retriesLeft: retries, delayMs });
            await new Promise(r => setTimeout(r, delayMs));
            return withRetry(fn, retries - 1, delayMs * 2);
        }
        throw err;
    }
}

// Small delay between sequential calls to avoid bursts
const pause = (ms = 50) => new Promise(r => setTimeout(r, ms));

// Centralized request type UI mapping
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
        let token, slug, projectId, clientContactIdPassthrough;
        
        try {
            const contentType = req.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const body = await req.json();
                token = body.token;
                slug = body.slug;
                projectId = body.projectId;
                clientContactIdPassthrough = body.client_contact_id;
            }
        } catch (e) {
            const url = new URL(req.url);
            token = url.searchParams.get('token');
            slug = url.searchParams.get('slug');
            projectId = url.searchParams.get('projectId');
            clientContactIdPassthrough = url.searchParams.get('client_contact_id');
        }

        if ((!token && !slug) || !projectId) {
            return Response.json({ error: 'Missing required parameters' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // --- SEQUENTIAL QUERIES WITH RETRY (rate-limit safe) ---

        // 1. Fetch project
        const projectResults = await withRetry(() =>
            base44.asServiceRole.entities.Project.filter({ id: projectId })
        );
        const project = projectResults[0];
        if (!project) {
            return Response.json({ error: 'Project not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // 2. Resolve client contact — skip lookup if ID was passed through from projects page
        let clientContactId = clientContactIdPassthrough || null;
        let contactFromSlug = null;
        if (!clientContactId && slug) {
            await pause();
            const contactResults = await withRetry(() =>
                base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug, active: true })
            );
            if (contactResults.length === 0) {
                return Response.json({ error: 'Client contact not found' }, { 
                    status: 404,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            contactFromSlug = contactResults[0];
            clientContactId = contactFromSlug.id;
        }

        // 3. Access check — critical gate, no artificial delay before this
        const filter = { project_id: projectId, access_status: 'active' };
        if (token) filter.share_token = token;
        if (clientContactId) filter.client_contact_id = clientContactId;

        const accesses = await withRetry(() =>
            base44.asServiceRole.entities.ProjectClientAccess.filter(filter)
        );

        if (accesses.length === 0) {
            return Response.json({ error: 'No active access found' }, { 
                status: 403,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const access = accesses[0];

        // 4. Fetch ClientContact for consent data — reuse slug lookup if available
        let clientContact = contactFromSlug;
        if (!clientContact) {
            await pause();
            const contactFetch = await withRetry(() =>
                base44.asServiceRole.entities.ClientContact.filter({ id: access.client_contact_id })
            );
            clientContact = contactFetch[0] || null;
        }

        // 5. Fetch feedback requests
        await pause();
        const allRequests = await withRetry(() =>
            base44.asServiceRole.entities.ClientFeedbackRequest.filter({ project_id: projectId })
        );

        const visibleRequests = allRequests.filter(r => r.status !== 'draft');
        const requestIdArray = visibleRequests.map(r => r.id);

        // 6. Fetch feedback data — SEQUENTIAL to avoid rate limit bursts
        let allComments = [], allDecisions = [], allAttachments = [];
        if (requestIdArray.length > 0) {
            await pause();
            allComments = await withRetry(() =>
                base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: { $in: requestIdArray } }, '-created_date', 500)
            );
            await pause();
            allDecisions = await withRetry(() =>
                base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: { $in: requestIdArray } }, '-created_date', 500)
            );
            await pause();
            allAttachments = await withRetry(() =>
                base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: { $in: requestIdArray } }, '-created_date', 500)
            );
        }

        // --- BUILD RESPONSE ---

        const minimalRequests = visibleRequests.map(r => {
            const typeInfo = getRequestTypeInfo(r.request_type);
            return {
                id: r.id,
                title: r.title,
                body: r.body,
                request_type: r.request_type,
                request_type_label: typeInfo.label,
                request_type_color: typeInfo.color,
                status: r.status,
                due_date: r.due_date,
                posted_at: r.posted_at,
                created_date: r.created_date,
                project_id: r.project_id
            };
        });

        const minimalComments = allComments.map(c => ({
            id: c.id,
            request_id: c.request_id,
            author_type: c.author_type,
            author_id: c.author_id,
            body: c.body,
            visibility: c.visibility,
            posted_at: c.posted_at,
            created_date: c.created_date
        }));

        const minimalDecisions = allDecisions.map(d => ({
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

        const minimalAttachments = allAttachments.map(a => ({
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

        // Determine consent completion: has at least one opt-in date
        const hasCompletedConsent = clientContact
            ? !!(clientContact.opt_in_email_date || clientContact.opt_in_sms_date || clientContact.opt_in_whatsapp_date)
            : false;

        return Response.json({
            success: true,
            access: {
                id: access.id,
                access_role: access.access_role,
                client_contact_id: access.client_contact_id,
                contact_email: clientContact?.email || null,
                has_completed_consent: hasCompletedConsent,
                opt_in_email_date: clientContact?.opt_in_email_date || null,
                opt_in_sms_date: clientContact?.opt_in_sms_date || null,
                opt_in_whatsapp_date: clientContact?.opt_in_whatsapp_date || null,
                phone_sms: (clientContact?.notify_sms && clientContact?.phone) ? clientContact.phone : null,
                phone_whatsapp: (clientContact?.notify_whatsapp && clientContact?.phone) ? clientContact.phone : null,
                phone_country_code: null,
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