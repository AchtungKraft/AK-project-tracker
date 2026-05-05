import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Default template values (overridable via EmailTemplate entity)
const DEFAULT_TEMPLATES = {
    needs_review: {
        subject: "Review Requested: {request_title} — {project_name}",
        button_text: "Review & Submit Feedback",
    }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Latest client-visible internal team comment ──────────────────────
function getLatestTeamComment(comments) {
  if (!comments?.length) return null;
  return comments
    .filter(c =>
      c.author_type === 'internal_user' &&
      !c.is_system &&
      (c.visibility === 'client_visible' || !c.visibility)
    )
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0] || null;
}

// ── HTML → plain text converter ──────────────────────────────────────
function convertHtmlToEmailText(html) {
  if (!html || typeof html !== 'string') return '';
  let text = html;
  text = text.replace(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi, (_, c) => '\n\n' + c.replace(/<[^>]*>/g, '').trim() + '\n');
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => '• ' + c.replace(/<[^>]*>/g, '').trim() + '\n');
  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '').replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
  text = text.replace(/[ \t]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// ── Comment → email-safe HTML ────────────────────────────────────────
function convertHtmlToEmailHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let safe = html;
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  safe = safe.replace(/<h2([^>]*)>/gi, '<h2$1 style="margin:12px 0 4px 0;font-size:16px;color:#fff;">');
  safe = safe.replace(/<h3([^>]*)>/gi, '<h3$1 style="margin:10px 0 4px 0;font-size:14px;color:#e5e5e5;">');
  safe = safe.replace(/<ul([^>]*)>/gi, '<ul$1 style="margin:4px 0;padding-left:20px;color:#e5e5e5;">');
  safe = safe.replace(/<li([^>]*)>/gi, '<li$1 style="margin:2px 0;color:#e5e5e5;">');
  safe = safe.replace(/<p([^>]*)>/gi, '<p$1 style="margin:6px 0;color:#e5e5e5;line-height:1.5;">');
  safe = safe.replace(/<em([^>]*)>/gi, '<em$1 style="font-style:italic;color:#d4d4d4;">');
  return safe;
}

function formatLinksForEmailHtml(links) {
  if (!Array.isArray(links) || links.length === 0) return '';
  const items = links.map(l =>
    `<li style="margin:2px 0;"><a href="${l.url}" style="color:#60a5fa;text-decoration:underline;">${l.name || l.url}</a>${l.description ? ' — ' + l.description : ''}</li>`
  );
  return `<div style="margin-top:10px;"><p style="margin:0 0 4px 0;font-weight:bold;color:#fff;font-size:12px;">Links:</p><ul style="margin:0;padding-left:20px;">${items.join('')}</ul></div>`;
}

function getCommentEmailHtml(comment) {
  if (!comment) return '';
  if (comment.content_html?.trim()) {
    return convertHtmlToEmailHtml(comment.content_html) + formatLinksForEmailHtml(comment.links);
  }
  const text = comment.content_fallback?.trim() || comment.body?.trim() || '';
  return text ? `<p style="margin:0;line-height:1.5;color:#e5e5e5;white-space:pre-wrap;">${text}</p>` : '';
}

function getCommentEmailText(comment) {
  if (!comment) return '';
  if (comment.content_html?.trim()) return convertHtmlToEmailText(comment.content_html);
  return comment.content_fallback?.trim() || comment.body?.trim() || '';
}

function replacePlaceholders(text, data) {
    if (!text) return '';
    return text
        .replace(/{project_name}/g, data.project_name || '')
        .replace(/{request_title}/g, data.request_title || '')
        .replace(/{client_name}/g, data.client_name || '')
        .replace(/{client_slug}/g, data.client_slug || '');
}

// ── Extract first name from full name ────────────────────────────────
function getFirstName(fullName) {
  if (!fullName || typeof fullName !== 'string') return null;
  return fullName.trim().split(/\s+/)[0] || null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { requestId, isRepost } = await req.json();

        if (!requestId) {
            return Response.json({ error: 'Missing requestId' }, { status: 400 });
        }

        // Fetch Request
        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];
        if (!request) return Response.json({ error: 'Request not found' }, { status: 404 });

        // HARD RULE: NO emails for archived requests
        if (request.status === 'archived') {
            console.log(`Request ${requestId} is archived - no client email sent`);
            return Response.json({ message: 'Request is archived - no email sent' });
        }

        // VALIDATION: Block send if title is missing
        if (!request.title || !request.title.trim()) {
            console.error(`Request ${requestId} has no title - blocking email send`);
            return Response.json({ error: 'Request title is required to send email' }, { status: 400 });
        }

        // Fetch comments
        const comments = await base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: request.id });
        const latestTeamComment = getLatestTeamComment(comments);

        // Fetch Project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: request.project_id });
        const project = projects[0];
        if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

        // Fetch email template (subject + button text overridable)
        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'needs_review' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.needs_review;

        // Get active client accesses
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: request.project_id, access_status: 'active'
        });
        if (accesses.length === 0) {
            return Response.json({ message: 'No active clients found' });
        }

        // Fetch contacts
        const clientContactIds = [...new Set(accesses.map(a => a.client_contact_id).filter(Boolean))];
        const contacts = clientContactIds.length > 0
            ? await base44.asServiceRole.entities.ClientContact.filter({ id: { $in: clientContactIds } })
            : [];
        if (contacts.length === 0) {
            return Response.json({ message: 'No client contacts found' });
        }

        const clientPortalBaseUrl = 'https://akclient.base44.app';

        // Template values
        const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;

        // Description with professional fallback
        const description = request.body?.trim() || 'This item has been prepared for your review.';

        // Opening line
        const openingLine = "We've completed an update on your project and need your input before moving forward.";

        // Action block (always included)
        const actionBlockHtml = `
<div style="margin:24px 0 16px 0;">
  <p style="margin:0 0 8px 0;font-weight:bold;color:#333;font-family:Arial,sans-serif;">What We Need From You:</p>
  <ul style="margin:0;padding-left:20px;color:#555;font-family:Arial,sans-serif;line-height:1.8;">
    <li>Review the item</li>
    <li>Confirm if it meets your expectations</li>
    <li>Share any changes you'd like us to make</li>
  </ul>
</div>`;

        // Next step block (always included)
        const nextStepHtml = `
<div style="margin:16px 0 24px 0;padding:14px 16px;background:#f7f7f7;border-radius:4px;">
  <p style="margin:0;color:#555;font-family:Arial,sans-serif;font-size:14px;">
    <strong style="color:#333;">Next Step:</strong> Once we receive your feedback, we'll either refine further or proceed to the next phase of the build.
  </p>
</div>`;

        // Comment block — use existing comment or professional fallback
        let commentBlockHtml;
        if (latestTeamComment) {
            commentBlockHtml = getCommentEmailHtml(latestTeamComment);
        } else {
            commentBlockHtml = `<p style="margin:0;line-height:1.5;color:#e5e5e5;">No additional notes at this time.</p>`;
        }

        const commentText = latestTeamComment
            ? getCommentEmailText(latestTeamComment)
            : 'No additional notes at this time.';

        // Send personalized email to each client
        const results = [];
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];

            if (contact.notify_email === false) {
                console.log(`Skipping ${contact.email} - email notifications disabled`);
                results.push({ contact: contact.email, success: false, skipped: true, reason: 'email_opt_out' });
                continue;
            }

            const access = accesses.find(a => a.client_contact_id === contact.id);
            if (!access) { results.push(null); continue; }

            const clientSlug = contact.url_slug || access.url_slug || '';

            // Build deep link
            let requestDetailUrl;
            if (contact.url_slug) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&slug=${contact.url_slug}`;
            } else if (access.url_slug) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&slug=${access.url_slug}`;
            } else if (access.share_token) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&token=${access.share_token}`;
            } else {
                console.warn(`No slug or token for contact ${contact.id}, skipping email`);
                results.push(null);
                continue;
            }

            // VALIDATION: Block send if CTA URL is missing
            if (!requestDetailUrl) {
                console.error(`No CTA URL for contact ${contact.id} - blocking email send`);
                results.push({ contact: contact.email, success: false, error: 'no_cta_url' });
                continue;
            }

            // Greeting — use first name with fallback
            const firstName = getFirstName(contact.name);
            const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

            const placeholderData = {
                project_name: project.name,
                request_title: request.title,
                client_name: contact.name,
                client_slug: clientSlug,
            };

            const subject = replacePlaceholders(subjectTemplate, placeholderData);

            // Content block — clean, light styling
            const contentBlockHtml = `
<p style="margin:0 0 4px 0;font-weight:bold;color:#333;font-size:16px;font-family:Arial,sans-serif;">${request.title}</p>
<p style="margin:0;color:#555;white-space:pre-wrap;line-height:1.6;font-family:Arial,sans-serif;">${description}</p>`;

            // Assemble linksBlockHtml with action + next step blocks
            const composedLinksBlock = actionBlockHtml + nextStepHtml;

            // Plain text version — clean structure, no HTML artifacts
            const textBody = [
                `PROJECT: ${project.name}`,
                `Review Requested: ${request.title}`,
                '',
                greeting,
                '',
                openingLine,
                '',
                '---',
                '',
                request.title,
                description,
                '',
                `Latest Update From Achtung Kraft:`,
                commentText,
                '',
                'What We Need From You:',
                '- Review the item',
                '- Confirm if it meets your expectations',
                '- Share any changes you\'d like us to make',
                '',
                'Next Step:',
                'Once we receive your feedback, we\'ll either refine further or proceed to the next phase of the build.',
                '',
                `${buttonText}:`,
                requestDetailUrl,
                '',
                clientSlug ? `Your portal code: ${clientSlug}` : '',
                '',
                '— Achtung Kraft Projects',
                'Precision builds. Clear communication.',
            ].filter(Boolean).join('\n');

            // Send via centralized sender
            try {
                const sendResponse = await base44.functions.invoke('sendClientEmail', {
                    to: contact.email,
                    contactName: contact.name,
                    subject,
                    emailType: 'needs_review',
                    projectName: project.name,
                    headline: `Review Requested: ${request.title}`,
                    greeting,
                    introText: openingLine,
                    contentBlockHtml,
                    commentBlockHtml,
                    linksBlockHtml: composedLinksBlock,
                    ctaUrl: requestDetailUrl,
                    ctaText: buttonText,
                    clientSlug: clientSlug || null,
                    textBody,
                    requestId: request.id,
                    projectId: project.id,
                });

                if (sendResponse.data?.success) {
                    console.log(`Email sent to ${contact.email} for Request ${requestId}. ID: ${sendResponse.data.emailId}`);
                    results.push({ contact: contact.email, success: true, emailId: sendResponse.data.emailId });
                } else {
                    console.error(`Failed to send email to ${contact.email}:`, sendResponse.data?.error);
                    results.push({ contact: contact.email, success: false, error: sendResponse.data?.error });
                }
            } catch (emailError) {
                console.error(`Error sending email to ${contact.email}:`, emailError);
                results.push({ contact: contact.email, success: false, error: emailError.message });
            }

            // Rate limit spacing
            if (i < contacts.length - 1) {
                await delay(600);
            }
        }

        const successfulEmails = results.filter(r => r && r.success);

        // Update last_email_sent_at
        if (successfulEmails.length > 0) {
            await base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, { 
                last_email_sent_at: new Date().toISOString() 
            });
        }

        return Response.json({ 
            success: true, 
            emailsSent: successfulEmails.length,
            results: results.filter(Boolean)
        });

    } catch (error) {
        console.error("Error in sendNeedsReviewEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});