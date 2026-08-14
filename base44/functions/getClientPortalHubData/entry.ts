import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * getClientPortalHubData — Single read model for ClientPortalHub
 *
 * Replaces 4 separate frontend .list() calls:
 *   - ClientFeedbackRequest.list()
 *   - ClientFeedbackComment.list()
 *   - ClientFeedbackDecision.list()
 *   - ClientFeedbackAttachment.list()
 *
 * Returns only the fields the Hub UI actually consumes,
 * reducing payload size by ~60-80%.
 */

Deno.serve(async (req) => {
    const startTime = Date.now();

    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parallel fetch — all 4 entities at once
        const [
            allRequests,
            allComments,
            allDecisions,
            allAttachments,
        ] = await Promise.all([
            base44.entities.ClientFeedbackRequest.list(),
            base44.entities.ClientFeedbackComment.list(),
            base44.entities.ClientFeedbackDecision.list(),
            base44.entities.ClientFeedbackAttachment.list(),
        ]);

        // Project only the fields the Hub UI actually reads

        const requests = allRequests.map(r => ({
            id: r.id,
            title: r.title,
            body: r.body,
            request_type: r.request_type,
            status: r.status,
            due_date: r.due_date,
            posted_at: r.posted_at,
            created_date: r.created_date,
            updated_date: r.updated_date,
            project_id: r.project_id,
            review_state: r.review_state,
            review_started_at: r.review_started_at,
            client_last_viewed_at: r.client_last_viewed_at,
            last_viewed_by_internal_at: r.last_viewed_by_internal_at,
            // Queue disposition fields — required for Action Queue eligibility
            queue_hidden: r.queue_hidden || false,
            queue_hidden_at: r.queue_hidden_at || null,
            queue_resume_date: r.queue_resume_date || null,
        }));

        // Comments: Hub only needs request_id for counting, and basic fields for state derivation
        const comments = allComments.map(c => ({
            id: c.id,
            request_id: c.request_id,
            author_type: c.author_type,
            author_id: c.author_id,
            body: c.body,
            visibility: c.visibility,
            posted_at: c.posted_at,
            created_date: c.created_date,
            updated_date: c.updated_date,
        }));

        // Decisions: Hub needs these for state derivation (approved/changes_requested)
        const decisions = allDecisions.map(d => ({
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
        }));

        // Attachments: Hub needs these for structured review state derivation
        const attachments = allAttachments.map(a => ({
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
            created_date: a.created_date,
        }));

        const executionTime = Date.now() - startTime;
        console.log(`[getClientPortalHubData] ${executionTime}ms | ${requests.length} requests, ${comments.length} comments, ${decisions.length} decisions, ${attachments.length} attachments`);

        return Response.json({
            success: true,
            requests,
            comments,
            decisions,
            attachments,
        });

    } catch (error) {
        console.error('[getClientPortalHubData] Error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});