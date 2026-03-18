import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Default templates
const DEFAULT_TEMPLATES = {
    needs_review: {
        subject: "Achtung Kraft // REVIEW NEEDED: {request_title}",
        body_intro: "You have an item that requires your review:",
        body_intro_repost: "We've made updates and would like you to review the latest version:",
        button_text: "VIEW & APPROVE REQUEST",
        closing_text: "— Achtung Kraft Projects",
    }
};

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to get latest internal team comment (client-visible only)
// PHASE 3 HARDENING: Positive match on client_visible, exclude system-generated
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

// ── HTML → readable email text converter ──────────────────────────────
// Converts structured content_html into properly formatted plain text
// for the text/plain email part. Preserves headings, lists, paragraphs.
function convertHtmlToEmailText(html) {
  if (!html || typeof html !== 'string') return '';
  let text = html;

  // 1. Headings → UPPERCASE with spacing
  text = text.replace(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi, (_, content) => {
    const clean = content.replace(/<[^>]*>/g, '').trim();
    return '\n\n' + clean.toUpperCase() + '\n';
  });

  // 2. Unordered list items → bullet points
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => {
    const clean = content.replace(/<[^>]*>/g, '').trim();
    return '• ' + clean + '\n';
  });

  // 3. Remove ul/ol wrappers (items already converted)
  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');

  // 4. Paragraphs → double newline
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');

  // 5. Line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // 6. Strip remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // 7. Decode HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&ndash;/g, '–');

  // 8. Normalize whitespace: collapse 3+ newlines to 2, trim lines
  text = text.replace(/[ \t]+/g, ' ');
  text = text.split('\n').map(line => line.trim()).join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

// ── Build email-safe HTML from content_html ──────────────────────────
// For the HTML email part — sanitize and inline basic styles
function convertHtmlToEmailHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let safe = html;
  // Strip script/style tags entirely
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, '');
  safe = safe.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Add basic inline styles for headings in email context
  safe = safe.replace(/<h2([^>]*)>/gi, '<h2$1 style="margin:12px 0 4px 0;font-size:16px;color:#fff;">');
  safe = safe.replace(/<h3([^>]*)>/gi, '<h3$1 style="margin:10px 0 4px 0;font-size:14px;color:#e5e5e5;">');
  safe = safe.replace(/<ul([^>]*)>/gi, '<ul$1 style="margin:4px 0;padding-left:20px;color:#e5e5e5;">');
  safe = safe.replace(/<li([^>]*)>/gi, '<li$1 style="margin:2px 0;color:#e5e5e5;">');
  safe = safe.replace(/<p([^>]*)>/gi, '<p$1 style="margin:6px 0;color:#e5e5e5;line-height:1.5;">');
  safe = safe.replace(/<em([^>]*)>/gi, '<em$1 style="font-style:italic;color:#d4d4d4;">');
  return safe;
}

// ── Format structured links for email ────────────────────────────────
function formatLinksForEmailText(links) {
  if (!Array.isArray(links) || links.length === 0) return '';
  const lines = links.map(l => `- ${l.name || l.url}: ${l.url}`);
  return '\nLinks:\n' + lines.join('\n') + '\n';
}

function formatLinksForEmailHtml(links) {
  if (!Array.isArray(links) || links.length === 0) return '';
  const items = links.map(l =>
    `<li style="margin:2px 0;"><a href="${l.url}" style="color:#60a5fa;text-decoration:underline;">${l.name || l.url}</a>${l.description ? ' — ' + l.description : ''}</li>`
  );
  return `<div style="margin-top:10px;"><p style="margin:0 0 4px 0;font-weight:bold;color:#fff;font-size:12px;">Links:</p><ul style="margin:0;padding-left:20px;">${items.join('')}</ul></div>`;
}

// ── Get formatted comment content for email ──────────────────────────
// Priority: content_html → content_fallback → body
function getCommentEmailText(comment) {
  if (!comment) return '';
  if (comment.content_html?.trim()) {
    let text = convertHtmlToEmailText(comment.content_html);
    text += formatLinksForEmailText(comment.links);
    return text;
  }
  if (comment.content_fallback?.trim()) return comment.content_fallback.trim();
  if (comment.body?.trim()) return comment.body.trim();
  return '';
}

function getCommentEmailHtml(comment) {
  if (!comment) return '';
  if (comment.content_html?.trim()) {
    let html = convertHtmlToEmailHtml(comment.content_html);
    html += formatLinksForEmailHtml(comment.links);
    return html;
  }
  // Fallback: plain text with pre-wrap
  const text = comment.content_fallback?.trim() || comment.body?.trim() || '';
  return text ? `<p style="margin:0;line-height:1.5;color:#e5e5e5;white-space:pre-wrap;">${text}</p>` : '';
}

// Legacy compat alias
function getCommentTextSummary(comment) {
  return getCommentEmailText(comment) || null;
}

// Replace placeholders in text
function replacePlaceholders(text, data) {
    if (!text) return '';
    return text
        .replace(/{project_name}/g, data.project_name || '')
        .replace(/{request_title}/g, data.request_title || '')
        .replace(/{request_body}/g, data.request_body || '')
        .replace(/{client_name}/g, data.client_name || '')
        .replace(/{client_slug}/g, data.client_slug || '');
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Parse payload
        const { requestId, isRepost } = await req.json();

        if (!requestId) {
            return Response.json({ error: 'Missing requestId' }, { status: 400 });
        }

        // Fetch Request details
        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];

        if (!request) {
            return Response.json({ error: 'Request not found' }, { status: 404 });
        }

        // HARD RULE: NO emails for archived requests
        if (request.status === 'archived') {
            console.log(`Request ${requestId} is archived - no client email sent`);
            return Response.json({ message: 'Request is archived - no email sent' });
        }

        // Fetch comments for this request
        const comments = await base44.asServiceRole.entities.ClientFeedbackComment.filter({
            request_id: request.id
        });
        const latestTeamComment = getLatestTeamComment(comments);
        console.log('Email includes team comment:', latestTeamComment?.id);

        // Fetch Project details
        const projects = await base44.asServiceRole.entities.Project.filter({ id: request.project_id });
        const project = projects[0];

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Fetch email template
        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'needs_review' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.needs_review;

        // Get all active client accesses for this project
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: request.project_id,
            access_status: 'active'
        });

        if (accesses.length === 0) {
            console.log(`No active client accesses found for project ${project.id}. Skipping email.`);
            return Response.json({ message: 'No active clients found' });
        }

        // Fetch all client contacts
        const clientContactIds = accesses.map(a => a.client_contact_id);
        const contactPromises = clientContactIds.map(id => 
            base44.asServiceRole.entities.ClientContact.filter({ id })
        );
        const contactResults = await Promise.all(contactPromises);
        const contacts = contactResults.flat().filter(Boolean);

        if (contacts.length === 0) {
            console.log(`No client contacts found for project ${project.id}. Skipping email.`);
            return Response.json({ message: 'No client contacts found' });
        }

        const clientPortalBaseUrl = 'https://akclient.base44.app';
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        
        if (!resendApiKey) {
            console.error("RESEND_API_KEY not set");
            return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }

        // Send personalized email to each client sequentially to respect rate limits (2 per second)
        const results = [];
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            
            // Find the access record for this contact
            const access = accesses.find(a => a.client_contact_id === contact.id);
            if (!access) {
                results.push(null);
                continue;
            }

            // Get client slug
            const clientSlug = contact.url_slug || access.url_slug || '';

            // Build the direct request URL with slug or token
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

            // Prepare placeholder data
            const placeholderData = {
                project_name: project.name,
                request_title: request.title,
                request_body: request.body || 'No description provided.',
                client_name: contact.name,
                client_slug: clientSlug
            };

            // Get template values - use repost intro if this is a resend
            const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
            const bodyIntro = isRepost 
                ? (savedTemplate?.body_intro_repost || defaultTpl.body_intro_repost)
                : (savedTemplate?.body_intro || defaultTpl.body_intro);
            const buttonText = savedTemplate?.button_text || defaultTpl.button_text;
            const closingText = savedTemplate?.closing_text || defaultTpl.closing_text;

            // Replace placeholders
            const subject = replacePlaceholders(subjectTemplate, placeholderData);
            const intro = replacePlaceholders(bodyIntro, placeholderData);
            const closing = replacePlaceholders(closingText, placeholderData);

            const htmlBody = `
<h1 style="margin: 0 0 8px 0; color: #c00; font-size: 24px;">PROJECT: ${project.name}</h1>
<h2 style="margin: 0 0 20px 0; color: #333; font-size: 18px; font-weight: normal;">REVIEW NEEDED: ${request.title}</h2>

<p>Hi ${contact.name},</p>

<p>${intro}</p>

<div style="background-color: #f9f9f9; border-left: 4px solid #c00; padding: 16px; margin: 20px 0;">
    <h3 style="margin: 0 0 8px 0; color: #c00;">${request.title}</h3>
    <p style="margin: 0; color: #333; white-space: pre-wrap;">${request.body || 'No description provided.'}</p>
</div>

${latestTeamComment ? `
<div style="margin-top:16px;padding:14px;background:#1a1a1a;border-left:3px solid #dc2626;">
  <p style="margin:0 0 8px 0;font-weight:bold;color:#fff;">Latest Update From Ächtung Kraft:</p>
  <div style="margin:0;line-height:1.5;color:#e5e5e5;">${getCommentEmailHtml(latestTeamComment)}</div>
</div>
` : ''}

<p style="margin: 30px 0;">
<a href="${requestDetailUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
${buttonText}
</a>
</p>

<p style="color: #666; font-size: 14px;">
Direct link: <a href="${requestDetailUrl}" style="color: #3b82f6;">${requestDetailUrl}</a>
</p>

${clientSlug ? `<p style="color: #666; font-size: 14px;">Your portal code: <strong>${clientSlug}</strong></p>` : ''}

<p>
${closing}
</p>
`;

            const textBody = `
PROJECT: ${project.name}
REVIEW NEEDED: ${request.title}

Hi ${contact.name},

${intro}

${request.title}
${request.body || 'No description provided.'}

${latestTeamComment ? `Latest Update From Ächtung Kraft:
---------------------------------
${getCommentTextSummary(latestTeamComment) || ''}
` : ''}
View and approve the request here:
${requestDetailUrl}

${clientSlug ? `Your portal code: ${clientSlug}` : ''}

${closing}
`;

            // Send individual email
            try {
                const emailResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: "Achtung Kraft Projects <updates@projects.achtungkraft.com>",
                        to: [contact.email],
                        subject: subject,
                        html: htmlBody,
                        text: textBody
                    })
                });

                if (!emailResponse.ok) {
                    const errorData = await emailResponse.json();
                    console.error(`Failed to send email to ${contact.email}:`, errorData);
                    results.push({ contact: contact.email, success: false, error: errorData });
                } else {
                    const emailData = await emailResponse.json();
                    console.log(`Email sent to ${contact.email} for Request ${requestId}. ID: ${emailData.id}`);
                    results.push({ contact: contact.email, success: true, emailId: emailData.id });
                }
            } catch (emailError) {
                console.error(`Error sending email to ${contact.email}:`, emailError);
                results.push({ contact: contact.email, success: false, error: emailError.message });
            }

            // Wait 600ms between emails to stay well under the 2/second rate limit
            if (i < contacts.length - 1) {
                await delay(600);
            }
        }
        const successfulEmails = results.filter(r => r && r.success);

        // Update last_email_sent_at on the request
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