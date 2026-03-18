import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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
        let token, slug, requestId, comment, attachments;
        
        try {
            const contentType = req.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const body = await req.json();
                token = body.token;
                slug = body.slug;
                requestId = body.requestId;
                comment = body.comment;
                attachments = body.attachments;
            }
        } catch (e) {
            const url = new URL(req.url);
            token = url.searchParams.get('token');
            slug = url.searchParams.get('slug');
            requestId = url.searchParams.get('requestId');
            const commentParam = url.searchParams.get('comment');
            const attachmentsParam = url.searchParams.get('attachments');
            comment = commentParam ? JSON.parse(commentParam) : null;
            attachments = attachmentsParam ? JSON.parse(attachmentsParam) : null;
        }

        if ((!token && !slug) || !requestId) {
            return Response.json({ error: 'Missing required parameters' }, { 
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Verify access
        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];

        if (!request) {
            return Response.json({ error: 'Request not found' }, { 
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        let clientContactId;
        
        if (slug) {
            const contacts = await base44.asServiceRole.entities.ClientContact.filter({ url_slug: slug, active: true });
            if (contacts.length === 0) {
                return Response.json({ error: 'Invalid slug' }, { 
                    status: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
            clientContactId = contacts[0].id;
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
        const currentTimestamp = new Date().toISOString();

        // ── Build normalized comment record ──────────────────────
        // Handle both string input (legacy) and object input (modern rich content)
        const isObjectComment = typeof comment === 'object' && comment !== null;
        
        // Extract raw values from input
        const rawContentHtml = isObjectComment ? (comment.content_html || null) : null;
        const rawContentFallback = isObjectComment ? (comment.content_fallback || null) : null;
        const rawBody = isObjectComment ? (comment.body || null) : (typeof comment === 'string' ? comment : null);
        
        // Normalize with proper fallback chain:
        // content_html: store exactly as provided (DO NOT strip/sanitize - frontend handles safety)
        // content_fallback: content_fallback → body → null
        // body: body → content_fallback → null (for legacy compatibility)
        const commentContentHtml = rawContentHtml || null;
        const commentContentFallback = rawContentFallback || rawBody || null;
        const commentBody = rawBody || rawContentFallback || null;

        console.log('[publicAddClientComment] Storing comment:', {
            hasContentHtml: !!commentContentHtml,
            contentHtmlLength: commentContentHtml?.length,
            hasContentFallback: !!commentContentFallback,
            hasBody: !!commentBody
        });

        const commentData = {
            request_id: requestId,
            author_type: 'client_contact',
            author_id: access.client_contact_id,
            body: commentBody,
            content_html: commentContentHtml,
            content_fallback: commentContentFallback,
            visibility: 'client_visible',
            target_type: 'request',
            posted_at: currentTimestamp,
        };

        // Inline photos/files/links from comment object (new path)
        if (typeof comment === 'object') {
            if (Array.isArray(comment.photos) && comment.photos.length > 0) {
                commentData.photos = comment.photos;
            }
            if (Array.isArray(comment.files) && comment.files.length > 0) {
                commentData.files = comment.files;
            }
            if (Array.isArray(comment.links) && comment.links.length > 0) {
                commentData.links = comment.links.filter(l => l && (typeof l === 'string' ? l.trim() : l.url?.trim()));
            }
        }

        const newComment = await base44.asServiceRole.entities.ClientFeedbackComment.create(commentData);

        // ── Create attachment entities (backward compat + legacy client path) ──
        const createdAttachments = [];
        if (attachments && attachments.length > 0) {
            const attachmentPromises = attachments.map(att => 
                base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                    request_id: requestId,
                    comment_id: newComment.id,
                    attachment_type: att.attachment_type || att.type,
                    file_url: att.file_url,
                    link_url: att.link_url,
                    label: att.label,
                    created_by_type: 'client_contact',
                    created_by_id: access.client_contact_id,
                    posted_at: currentTimestamp
                })
            );
            createdAttachments.push(...await Promise.all(attachmentPromises));
        }

        // AUTO-REOPEN IF ARCHIVED
        if (request.status === 'archived') {
            await base44.asServiceRole.entities.ClientFeedbackRequest.update(request.id, {
                status: 'posted',
                archived_at: null
            });
        }

        return Response.json({
            success: true,
            comment: newComment,
            attachments: createdAttachments
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Error in publicAddClientComment:", error);
        return Response.json({ error: error.message }, { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
});