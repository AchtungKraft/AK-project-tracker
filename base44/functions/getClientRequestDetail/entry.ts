import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Retry wrapper with resilience for rate limits
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

// Safe array coercion
function safeArray(val) {
    return Array.isArray(val) ? val : [];
}

// Small delay between sequential calls
const pause = (ms = 50) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
    let token, slug, requestId;

    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        token = body.token;
        slug = body.slug;
        requestId = body.requestId;

        if ((!token && !slug) || !requestId) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Fetch request
        const requests = safeArray(await withRetry(() =>
            base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId })
        ));
        const request = requests[0] || null;

        if (!request) {
            return Response.json({
                success: false,
                error: 'Request not found',
                access: null,
                request: null,
                comments: [],
                decisions: [],
                attachments: [],
                users: [],
                clientContacts: []
            }, { status: 200 });
        }

        // Verify client access to this project
        await pause();
        const filter = { project_id: request.project_id, access_status: 'active' };
        if (token) filter.share_token = token;
        if (slug) filter.url_slug = slug;

        const accesses = safeArray(await withRetry(() =>
            base44.asServiceRole.entities.ProjectClientAccess.filter(filter)
        ));
        
        if (accesses.length === 0) {
            return Response.json({
                success: false,
                error: 'Invalid access',
                access: null,
                request: null,
                comments: [],
                decisions: [],
                attachments: [],
                users: [],
                clientContacts: []
            }, { status: 200 });
        }

        const access = accesses[0];

        // Fetch related data SEQUENTIALLY
        await pause();
        const comments = safeArray(await withRetry(() =>
            base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: requestId })
        ));

        await pause();
        const decisions = safeArray(await withRetry(() =>
            base44.asServiceRole.entities.ClientFeedbackDecision.filter({ request_id: requestId })
        ));

        await pause();
        const attachments = safeArray(await withRetry(() =>
            base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: requestId })
        ));

        // Fetch users and client contacts for display
        await pause();
        const users = safeArray(await withRetry(() =>
            base44.asServiceRole.entities.User.list()
        ));

        await pause();
        const clientContacts = safeArray(await withRetry(() =>
            base44.asServiceRole.entities.ClientContact.list()
        ));

        console.log('REQUEST DETAIL RESPONSE (legacy)', {
            requestId,
            hasRequest: !!request,
            requestType: request.request_type || null,
            commentsCount: comments.length,
            attachmentsCount: attachments.length
        });

        return Response.json({
            success: true,
            access,
            request,
            comments,
            decisions,
            attachments,
            users,
            clientContacts
        });

    } catch (error) {
        console.error('UPSTREAM REQUEST DETAIL FAILURE (legacy)', {
            requestId,
            slug,
            message: error.message,
            status: error?.status,
        });
        return Response.json({
            success: false,
            error: error.message,
            access: null,
            request: null,
            comments: [],
            decisions: [],
            attachments: [],
            users: [],
            clientContacts: []
        }, { status: 200 });
    }
});