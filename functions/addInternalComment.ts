import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { requestId, body, visibility, photos, files, links } = await req.json();

        if (!requestId) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const currentTimestamp = new Date().toISOString();

        // Create the comment with server-side timestamp
        const comment = await base44.asServiceRole.entities.ClientFeedbackComment.create({
            request_id: requestId,
            author_type: 'internal_user',
            author_id: user.id,
            body: body || null,
            visibility: visibility || 'client_visible',
            target_type: 'request',
            created_date: currentTimestamp
        });

        // Create attachments with the same timestamp
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
                    created_date: currentTimestamp
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
                    created_date: currentTimestamp
                });
                attachments.push(attachment);
            }
        }

        if (links && links.length > 0) {
            for (const link of links) {
                if (link.trim()) {
                    const attachment = await base44.asServiceRole.entities.ClientFeedbackAttachment.create({
                        request_id: requestId,
                        comment_id: comment.id,
                        attachment_type: 'link',
                        link_url: link.trim(),
                        created_by_type: 'internal_user',
                        created_by_id: user.id,
                        created_date: currentTimestamp
                    });
                    attachments.push(attachment);
                }
            }
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