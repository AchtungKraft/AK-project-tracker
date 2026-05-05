import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_TEMPLATES = {
    bulk_review: {
        subject: "Review Requested: {item_count} items — {project_name}",
        button_text: "Review & Submit Feedback",
    }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function replacePlaceholders(text, data) {
    if (!text) return '';
    return text
        .replace(/{project_name}/g, data.project_name || '')
        .replace(/{item_count}/g, data.item_count || '')
        .replace(/{client_name}/g, data.client_name || '')
        .replace(/{client_slug}/g, data.client_slug || '');
}

function getFirstName(fullName) {
  if (!fullName || typeof fullName !== 'string') return null;
  return fullName.trim().split(/\s+/)[0] || null;
}

function stripHtmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  let text = html;
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => '• ' + c.replace(/<[^>]*>/g, '').trim() + '\n');
  text = text.replace(/<\/?(?:ul|ol|h[1-4]|p|br|div)[^>]*>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  text = text.replace(/[ \t]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function getLatestTeamComment(comments, requestId) {
  if (!comments?.length) return null;
  return comments
    .filter(c =>
      c.request_id === requestId &&
      c.author_type === 'internal_user' &&
      !c.is_system &&
      (c.visibility === 'client_visible' || !c.visibility)
    )
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0] || null;
}

function getCommentSnippet(comment, request) {
  // Priority: latest team comment → request body → fallback
  let text = '';
  if (comment) {
    if (comment.content_html?.trim()) {
      text = stripHtmlToText(comment.content_html);
    } else {
      text = comment.content_fallback?.trim() || comment.body?.trim() || '';
    }
  }
  if (!text) text = request.body?.trim() || '';
  if (!text) text = 'Please review the materials and share your feedback.';
  // Limit to ~120 chars for per-item snippet
  if (text.length > 120) text = text.substring(0, 117).trim() + '…';
  return text;
}

// ── Build editorial bulk review HTML ─────────────────────────────────
function buildBulkReviewHtml({
  projectName, greeting, introLine,
  itemsHtml, ctaUrl, ctaText, clientSlug,
}) {
  return `<div style="max-width:580px;margin:0 auto;padding:36px 24px;background:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">

  <!-- Project label -->
  <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#999;">Project</div>
  <div style="font-size:16px;font-weight:600;color:#111;margin-top:4px;">${projectName}</div>

  <!-- Greeting + Single-line intro -->
  <div style="margin-top:20px;font-size:15px;color:#333;line-height:1.5;">${greeting} ${introLine}</div>

  <!-- Items -->
  ${itemsHtml}

  <!-- Next Step (inline) -->
  <div style="margin-top:24px;font-size:14px;color:#555;line-height:1.5;">Once we receive your feedback, we'll finalize the direction and move into the next phase.</div>

  <!-- CTA Button -->
  <div style="margin-top:28px;">
    <a href="${ctaUrl}" style="display:inline-block;background:#cc0000;color:#fff;padding:12px 20px;border-radius:6px;font-weight:600;font-size:15px;text-decoration:none;">${ctaText}</a>
  </div>

  <!-- Direct Link -->
  <div style="font-size:13px;color:#666;margin-top:16px;">Direct link: <a href="${ctaUrl}" style="color:#666;text-decoration:underline;word-break:break-all;">${ctaUrl}</a></div>

  ${clientSlug ? `<div style="font-size:13px;color:#666;margin-top:12px;">Your portal code: <strong>${clientSlug}</strong></div>` : ''}

  <!-- Sign-off -->
  <div style="margin-top:32px;font-size:13px;color:#666;">— Achtung Kraft Projects<br/>Precision builds. Clear communication.</div>

</div>`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { projectId, requestIds } = await req.json();
        if (!projectId || !requestIds || requestIds.length === 0) {
            return Response.json({ error: 'Missing projectId or requestIds' }, { status: 400 });
        }

        const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        const project = projects[0];
        if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

        const allRequests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ project_id: projectId });
        const requests = allRequests.filter(r => requestIds.includes(r.id));
        if (requests.length === 0) return Response.json({ error: 'No requests found' }, { status: 404 });

        // Fetch all comments for these requests to get per-item snippets
        const allComments = await base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: { $in: requestIds } });

        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'bulk_review' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.bulk_review;

        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: projectId, access_status: 'active'
        });
        if (accesses.length === 0) return Response.json({ message: 'No active clients found' });

        const clientContactIds = [...new Set(accesses.map(a => a.client_contact_id).filter(Boolean))];
        const contacts = clientContactIds.length > 0
            ? await base44.asServiceRole.entities.ClientContact.filter({ id: { $in: clientContactIds } })
            : [];
        if (contacts.length === 0) return Response.json({ message: 'No client contacts found' });

        const clientPortalBaseUrl = 'https://akclient.base44.app';
        const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;

        const introLine = `We've prepared ${requests.length} item${requests.length > 1 ? 's' : ''} for your review and need your input to proceed.`;

        // Build per-item HTML blocks (title + comment snippet as hero)
        const itemsHtml = requests.map((r, idx) => {
          const comment = getLatestTeamComment(allComments, r.id);
          const snippet = getCommentSnippet(comment, r);
          const divider = idx === 0
            ? `<div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee;">`
            : `<div style="margin-top:20px;padding-top:20px;border-top:1px solid #eee;">`;
          return `${divider}
    <div style="font-size:16px;font-weight:700;color:#111;line-height:1.3;">${r.title}</div>
    <div style="margin-top:6px;font-size:15px;font-weight:500;color:#222;line-height:1.5;">${snippet}</div>
  </div>`;
        }).join('\n');

        const itemsText = requests.map(r => {
          const comment = getLatestTeamComment(allComments, r.id);
          const snippet = getCommentSnippet(comment, r);
          return `• ${r.title}\n  ${snippet}`;
        }).join('\n\n');

        const results = [];
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];

            if (contact.notify_email === false) {
                results.push({ contact: contact.email, success: false, skipped: true, reason: 'email_opt_out' });
                continue;
            }

            const access = accesses.find(a => a.client_contact_id === contact.id);
            if (!access) { results.push(null); continue; }

            const clientSlug = contact.url_slug || access.url_slug || '';

            let portalUrl;
            if (contact.url_slug) {
                portalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${projectId}&slug=${contact.url_slug}`;
            } else if (access.url_slug) {
                portalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${projectId}&slug=${access.url_slug}`;
            } else if (access.share_token) {
                portalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${projectId}&token=${access.share_token}`;
            } else {
                results.push(null);
                continue;
            }

            const firstName = getFirstName(contact.name);
            const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

            const placeholderData = { project_name: project.name, item_count: requests.length, client_name: contact.name, client_slug: clientSlug };
            const subject = replacePlaceholders(subjectTemplate, placeholderData);

            const rawHtml = buildBulkReviewHtml({
                projectName: project.name,
                greeting,
                introLine,
                itemsHtml,
                ctaUrl: portalUrl,
                ctaText: buttonText,
                clientSlug: clientSlug || null,
            });

            const textBody = [
                `PROJECT: ${project.name}`,
                '',
                `${greeting} ${introLine}`,
                '',
                '---',
                '',
                itemsText,
                '',
                'Once we receive your feedback, we\'ll finalize the direction and move into the next phase.',
                '',
                `${buttonText}:`,
                portalUrl,
                '',
                clientSlug ? `Your portal code: ${clientSlug}` : '',
                '',
                '— Achtung Kraft Projects',
                'Precision builds. Clear communication.',
            ].filter(Boolean).join('\n');

            try {
                const sendResponse = await base44.functions.invoke('sendClientEmail', {
                    to: contact.email,
                    subject,
                    emailType: 'bulk_review',
                    rawHtml,
                    textBody,
                    projectId,
                });

                if (sendResponse.data?.success) {
                    results.push({ contact: contact.email, success: true, emailId: sendResponse.data.emailId });
                } else {
                    results.push({ contact: contact.email, success: false, error: sendResponse.data?.error });
                }
            } catch (emailError) {
                results.push({ contact: contact.email, success: false, error: emailError.message });
            }

            if (i < contacts.length - 1) await delay(600);
        }

        const successfulEmails = results.filter(r => r && r.success);
        const now = new Date().toISOString();
        await Promise.all(requestIds.map(id => 
            base44.asServiceRole.entities.ClientFeedbackRequest.update(id, { last_email_sent_at: now })
        ));

        return Response.json({ 
            success: true, emailsSent: successfulEmails.length,
            requestsUpdated: requestIds.length, results: results.filter(Boolean)
        });

    } catch (error) {
        console.error("Error in sendBulkReviewEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});