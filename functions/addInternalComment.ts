import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();
        const {
            requestId,
            // New rich content fields
            content_html,
            content_fallback,
            links,
            // Legacy field — still accepted for backward compatibility
            body,
            visibility,
            photos,
            files,
        } = payload;

        if (!requestId) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const currentTimestamp = new Date().toISOString();

        // Build comment record — support both new and legacy payloads
        const commentData = {
            request_id: requestId,
            author_type: 'internal_user',
            author_id: user.id,
            visibility: visibility || 'client_visible',
            target_type: 'request',
            posted_at: currentTimestamp,
        };

        // Rich content fields (preferred)
        if (content_html) {
            commentData.content_html = content_html;
            commentData.content_fallback = content_fallback || '';
            // Also populate legacy body field for backward compat
            commentData.body = content_fallback || '';
        } else if (body) {
            // Legacy plain text path
            commentData.body = body;
            commentData.content_fallback = body;
        }

        // Structured links stored directly on comment
        if (links && Array.isArray(links) && links.length > 0) {
            commentData.links = links.filter(l => l && l.url && l.url.trim());
        }

        // Photos and files stored directly on comment
        if (photos && Array.isArray(photos) && photos.length > 0) {
            commentData.photos = photos;
        }
        if (files && Array.isArray(files) && files.length > 0) {
            commentData.files = files;
        }

        const comment = await base44.asServiceRole.entities.ClientFeedbackComment.create(commentData);

        // Also create ClientFeedbackAttachment records for backward compat with thread rendering
        const attachments = [];

        if (photos && photos.length > 0) {
            for (const photoUrl of photos) {
                const attachment = await base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                    request_id: requestId,
                    comment_id: comment.id,
                    attachment_type: 'image',
                    file_url: photoUrl,
                    created_by_type: 'internal_user',
                    created_by_id: user.id,
                    posted_at: currentTimestamp
                });
                attachments.push(attachment);
            }
        }

        if (files && files.length > 0) {
            for (const file of files) {
                const attachment = await base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                    request_id: requestId,
                    comment_id: comment.id,
                    attachment_type: 'file',
                    file_url: file.url,
                    label: file.name,
                    created_by_type: 'internal_user',
                    created_by_id: user.id,
                    posted_at: currentTimestamp
                });
                attachments.push(attachment);
            }
        }

        // Structured links also saved as attachment records for legacy thread rendering
        if (links && Array.isArray(links) && links.length > 0) {
            for (const link of links) {
                if (link && link.url && link.url.trim()) {
                    const attachment = await base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                        request_id: requestId,
                        comment_id: comment.id,
                        attachment_type: 'link',
                        link_url: link.url.trim(),
                        label: link.name || link.url.trim(),
                        created_by_type: 'internal_user',
                        created_by_id: user.id,
                        posted_at: currentTimestamp
                    });
                    attachments.push(attachment);
                }
            }
        }

        // AUTO-REOPEN IF ARCHIVED
        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];
        if (request && request.status === 'archived') {
            await base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, {
                status: 'posted',
                archived_at: null
            });
        }

        return Response.json({
            success: true,
            comment,
            attachments
        });

    } catch (error) {
        console.error("Error in addInternalComment:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});