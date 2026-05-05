import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_TEMPLATES = {
    needs_review: {
        subject: "Review Requested: {request_title} — {project_name}",
        button_text: "Review & Submit Feedback",
    }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

function stripHtmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  let text = html;
  text = text.replace(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi, (_, c) => '\n' + c.replace(/<[^>]*>/g, '').trim() + '\n');
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => '• ' + c.replace(/<[^>]*>/g, '').trim() + '\n');
  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '').replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
  text = text.replace(/[ \t]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function sanitizeHtmlForEmail(html) {
  if (!html || typeof html !== 'string') return '';
  let safe = html;
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  safe = safe.replace(/<h2([^>]*)>/gi, '<h2$1 style="margin:10px 0 4px 0;font-size:15px;color:#222;">');
  safe = safe.replace(/<h3([^>]*)>/gi, '<h3$1 style="margin:8px 0 4px 0;font-size:14px;color:#333;">');
  safe = safe.replace(/<ul([^>]*)>/gi, '<ul$1 style="margin:4px 0;padding-left:20px;color:#444;">');
  safe = safe.replace(/<li([^>]*)>/gi, '<li$1 style="margin:2px 0;color:#444;">');
  safe = safe.replace(/<p([^>]*)>/gi, '<p$1 style="margin:4px 0;color:#444;line-height:1.6;">');
  return safe;
}

function getCommentHtml(comment) {
  if (!comment) return null;
  if (comment.content_html?.trim()) {
    let html = sanitizeHtmlForEmail(comment.content_html);
    if (Array.isArray(comment.links) && comment.links.length > 0) {
      const items = comment.links.map(l =>
        `<li style="margin:2px 0;"><a href="${l.url}" style="color:#cc0000;text-decoration:underline;">${l.name || l.url}</a>${l.description ? ' — <span style="color:#888;">' + l.description + '</span>' : ''}</li>`
      );
      html += `<ul style="margin:8px 0;padding-left:20px;">${items.join('')}</ul>`;
    }
    return html;
  }
  const text = comment.content_fallback?.trim() || comment.body?.trim() || '';
  return text ? `<p style="margin:0;line-height:1.6;color:#444;white-space:pre-wrap;">${text}</p>` : null;
}

function getCommentText(comment) {
  if (!comment) return '';
  if (comment.content_html?.trim()) return stripHtmlToText(comment.content_html);
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

function getFirstName(fullName) {
  if (!fullName || typeof fullName !== 'string') return null;
  return fullName.trim().split(/\s+/)[0] || null;
}

// ── Resolve images for email (max 2) ─────────────────────────────────
function collectImageUrls(attachments, latestComment) {
  const urls = [];
  // 1. Request-level image attachments (sorted by sort_order)
  if (attachments?.length) {
    const imageAttachments = attachments
      .filter(a => a.attachment_type === 'image' && a.file_url)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    for (const a of imageAttachments) {
      if (!urls.includes(a.file_url)) urls.push(a.file_url);
    }
  }
  // 2. Images from latest team comment
  if (latestComment?.photos?.length) {
    for (const url of latestComment.photos) {
      if (url && !urls.includes(url)) urls.push(url);
    }
  }
  return urls.slice(0, 2);
}

function buildImagesHtml(imageUrls, totalAvailable) {
  if (!imageUrls?.length) return '';
  const imgs = imageUrls.map(url =>
    `<img src="${url}" style="width:100%;max-width:560px;height:auto;display:block;margin-top:12px;border-radius:6px;" />`
  ).join('\n');
  const overflow = totalAvailable > 2
    ? `\n<div style="font-size:13px;color:#666;margin-top:8px;">View the full set in the review link below.</div>`
    : '';
  return `<div style="margin-top:16px;">\n${imgs}${overflow}\n</div>`;
}

// ── Context-aware action items ───────────────────────────────────────
function getActionItems(requestType) {
  if (requestType === 'design_review') {
    return [
      'Review the design options',
      'Select your preferred direction',
      'Share any refinement notes',
    ];
  }
  if (requestType === 'deliverable_review') {
    return [
      'Review the deliverable',
      'Confirm quality and direction',
      'Share any adjustments',
    ];
  }
  // Default
  return [
    'Review the item',
    'Confirm if it meets your expectations',
    'Share any changes you\'d like us to make',
  ];
}

// ── Description redundancy check ─────────────────────────────────────
function isDescriptionRedundant(description, commentText) {
  if (!description || !commentText) return false;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const d = norm(description);
  const c = norm(commentText);
  if (!d || !c) return false;
  return d === c || c.includes(d) || d.includes(c);
}

// ── Build complete editorial HTML layout ─────────────────────────────
function buildReviewEmailHtml({
  projectName, requestTitle, description,
  greeting, introLine, imagesHtml,
  commentHtml, actionItems, nextStep,
  ctaUrl, ctaText, clientSlug,
}) {
  // Omit description if it duplicates the comment content
  const descriptionBlock = description
    ? `<div style="margin-top:10px;font-size:15px;color:#444;line-height:1.5;white-space:pre-wrap;">${description}</div>`
    : '';

  return `<div style="max-width:580px;margin:0 auto;padding:36px 24px;background:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">

  <!-- Greeting -->
  <div style="font-size:15px;color:#333;line-height:1.5;">${greeting} ${introLine}</div>

  <!-- Project -->
  <div style="margin-top:20px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#999;">Project</div>
  <div style="font-size:16px;font-weight:600;color:#111;margin-top:4px;">${projectName}</div>

  <!-- Request Title -->
  <div style="font-size:24px;font-weight:700;color:#111;margin-top:16px;line-height:1.3;">${requestTitle}</div>

  <!-- Comment Hero -->
  <div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee;">
    <div style="font-size:18px;font-weight:600;color:#111;line-height:1.5;">${commentHtml}</div>
    ${imagesHtml}
  </div>

  ${descriptionBlock}

  <!-- Action Items -->
  <ul style="margin-top:28px;margin-bottom:0;padding-left:20px;color:#333;font-size:15px;line-height:1.5;">
${actionItems.map(item => `    <li style="margin:0 0 7px 0;">${item}</li>`).join('\n')}
  </ul>

  <!-- Next Step -->
  <div style="margin-top:24px;font-size:14px;color:#555;line-height:1.5;">${nextStep}</div>

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
        const { requestId, isRepost } = await req.json();

        if (!requestId) {
            return Response.json({ error: 'Missing requestId' }, { status: 400 });
        }

        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];
        if (!request) return Response.json({ error: 'Request not found' }, { status: 404 });

        if (request.status === 'archived') {
            return Response.json({ message: 'Request is archived - no email sent' });
        }

        if (!request.title?.trim()) {
            return Response.json({ error: 'Request title is required to send email' }, { status: 400 });
        }

        const comments = await base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: request.id });
        const latestTeamComment = getLatestTeamComment(comments);

        const projects = await base44.asServiceRole.entities.Project.filter({ id: request.project_id });
        const project = projects[0];
        if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'needs_review' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.needs_review;

        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: request.project_id, access_status: 'active'
        });
        if (accesses.length === 0) {
            return Response.json({ message: 'No active clients found' });
        }

        const clientContactIds = [...new Set(accesses.map(a => a.client_contact_id).filter(Boolean))];
        const contacts = clientContactIds.length > 0
            ? await base44.asServiceRole.entities.ClientContact.filter({ id: { $in: clientContactIds } })
            : [];
        if (contacts.length === 0) {
            return Response.json({ message: 'No client contacts found' });
        }

        // Fetch images from attachments
        const attachments = await base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ request_id: request.id });
        const allImageUrls = [
            ...attachments.filter(a => a.attachment_type === 'image' && a.file_url).map(a => a.file_url),
            ...(latestTeamComment?.photos || []).filter(Boolean),
        ];
        const imageUrls = collectImageUrls(attachments, latestTeamComment);
        const imagesHtml = buildImagesHtml(imageUrls, allImageUrls.length);

        const clientPortalBaseUrl = 'https://akclient.base44.app';
        const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;

        const introLine = "We've prepared updates for your review and need your input to proceed.";
        const actionItems = getActionItems(request.request_type);
        const nextStep = "Once we receive your feedback, we'll finalize the direction and move into the next phase.";

        // Comment content — hero element, with fallback chain
        const noCommentFallback = "Please review the materials and share your feedback.";
        const commentHtml = getCommentHtml(latestTeamComment)
            || (request.body?.trim()
                ? `<p style="margin:0;line-height:1.6;white-space:pre-wrap;">${request.body.trim()}</p>`
                : `<p style="margin:0;">${noCommentFallback}</p>`);
        const commentText = latestTeamComment
            ? getCommentText(latestTeamComment)
            : (request.body?.trim() || noCommentFallback);

        // Description: omit if redundant with comment
        const rawDescription = request.body?.trim() || '';
        const description = isDescriptionRedundant(rawDescription, commentText) ? null : rawDescription;

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

            let requestDetailUrl;
            if (contact.url_slug) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&slug=${contact.url_slug}`;
            } else if (access.url_slug) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&slug=${access.url_slug}`;
            } else if (access.share_token) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&token=${access.share_token}`;
            } else {
                results.push(null);
                continue;
            }

            if (!requestDetailUrl) {
                results.push({ contact: contact.email, success: false, error: 'no_cta_url' });
                continue;
            }

            const firstName = getFirstName(contact.name);
            const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

            const placeholderData = {
                project_name: project.name,
                request_title: request.title,
                client_name: contact.name,
                client_slug: clientSlug,
            };

            const subject = replacePlaceholders(subjectTemplate, placeholderData);

            // Build complete HTML — this function owns the full layout
            const rawHtml = buildReviewEmailHtml({
                projectName: project.name,
                requestTitle: request.title,
                description,
                greeting,
                introLine,
                imagesHtml,
                commentHtml,
                actionItems,
                nextStep,
                ctaUrl: requestDetailUrl,
                ctaText: buttonText,
                clientSlug: clientSlug || null,
            });

            // Plain text version
            const textBody = [
                `${greeting} ${introLine}`,
                '',
                `Project: ${project.name}`,
                request.title,
                '',
                '---',
                '',
                commentText,
                '',
                description ? description : '',
                '',
                ...actionItems.map(item => `- ${item}`),
                '',
                nextStep,
                '',
                `${buttonText}:`,
                requestDetailUrl,
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
                    emailType: 'needs_review',
                    rawHtml,
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

            if (i < contacts.length - 1) {
                await delay(600);
            }
        }

        const successfulEmails = results.filter(r => r && r.success);

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