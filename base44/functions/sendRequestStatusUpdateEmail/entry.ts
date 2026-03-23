import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Default templates
const DEFAULT_TEMPLATES = {
    status_update: {
        subject: "Achtung Kraft // Request Update: {request_title}",
        body_intro: "The request has been updated.",
        button_text: "VIEW REQUEST",
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
function convertHtmlToEmailText(html) {
  if (!html || typeof html !== 'string') return '';
  let text = html;
  text = text.replace(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi, (_, content) => {
    const clean = content.replace(/<[^>]*>/g, '').trim();
    return '\n\n' + clean.toUpperCase() + '\n';
  });
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => {
    const clean = content.replace(/<[^>]*>/g, '').trim();
    return '• ' + clean + '\n';
  });
  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&ndash;/g, '–');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.split('\n').map(line => line.trim()).join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function convertHtmlToEmailHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let safe = html;
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, '');
  safe = safe.replace(/<style[\s\S]*?<\/style>/gi, '');
  safe = safe.replace(/<h2([^>]*)>/gi, '<h2$1 style="margin:12px 0 4px 0;font-size:16px;color:#fff;">');
  safe = safe.replace(/<h3([^>]*)>/gi, '<h3$1 style="margin:10px 0 4px 0;font-size:14px;color:#e5e5e5;">');
  safe = safe.replace(/<ul([^>]*)>/gi, '<ul$1 style="margin:4px 0;padding-left:20px;color:#e5e5e5;">');
  safe = safe.replace(/<li([^>]*)>/gi, '<li$1 style="margin:2px 0;color:#e5e5e5;">');
  safe = safe.replace(/<p([^>]*)>/gi, '<p$1 style="margin:6px 0;color:#e5e5e5;line-height:1.5;">');
  safe = safe.replace(/<em([^>]*)>/gi, '<em$1 style="font-style:italic;color:#d4d4d4;">');
  return safe;
}

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
  const text = comment.content_fallback?.trim() || comment.body?.trim() || '';
  return text ? `<p style="margin:0;line-height:1.5;color:#e5e5e5;white-space:pre-wrap;">${text}</p>` : '';
}

function getCommentTextSummary(comment) {
  return getCommentEmailText(comment) || null;
}

// Replace placeholders in text
function replacePlaceholders(text, data) {
    if (!text) return '';
    return text
        .replace(/{project_name}/g, data.project_name || '')
        .replace(/{request_title}/g, data.request_title || '')
        .replace(/{old_status}/g, data.old_status || '')
        .replace(/{new_status}/g, data.new_status || '')
        .replace(/{client_name}/g, data.client_name || '')
        .replace(/{client_slug}/g, data.client_slug || '');
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Parse payload
        const { requestId, oldStatus, newStatus } = await req.json();

        if (!requestId || !newStatus) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Only send if status actually changed
        if (oldStatus === newStatus) {
            return Response.json({ message: 'Status did not change, no email sent' });
        }

        // HARD RULE: NO emails when archiving - archive is internal-only
        if (newStatus === 'archived') {
            console.log(`Request ${requestId} archived - no client email sent (internal action)`);
            return Response.json({ message: 'Request archived - no email sent (internal action)' });
        }

        // Fetch Request details
        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];

        if (!request) {
            return Response.json({ error: 'Request not found' }, { status: 404 });
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
        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'status_update' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.status_update;

        // Get template values
        const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
        const bodyIntroTemplate = savedTemplate?.body_intro || defaultTpl.body_intro;
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;
        const closingText = savedTemplate?.closing_text || defaultTpl.closing_text;

        // Get client accesses for this project
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: request.project_id,
            access_status: 'active'
        });

        // Prepare email content
        const clientPortalBaseUrl = 'https://akclient.base44.app';
        
        // For status update emails, we need to send personalized emails per client contact with their slug
        const clientContactsWithSlugs = [];
        const teamEmails = new Set();
        
        // Get client contact emails with their slugs (batch query)
        if (accesses.length > 0) {
            const contactIds = [...new Set(accesses.map(a => a.client_contact_id).filter(Boolean))];
            const allContacts = contactIds.length > 0
                ? await base44.asServiceRole.entities.ClientContact.filter({ id: { $in: contactIds } })
                : [];
            const contactMap = new Map(allContacts.map(c => [c.id, c]));

            for (const access of accesses) {
                const contact = contactMap.get(access.client_contact_id);
                if (contact && contact.email) {
                    // NOTIFICATION PREFERENCE CHECK: Skip contacts who opted out of email
                    if (contact.notify_email === false) {
                        console.log(`Skipping ${contact.email} - email notifications disabled`);
                        continue;
                    }
                    clientContactsWithSlugs.push({
                        email: contact.email,
                        name: contact.name,
                        slug: contact.url_slug || access.url_slug,
                        token: access.share_token
                    });
                }
            }
        }
        
        // Add project client email if exists and not already in contacts
        if (project.client_email) {
            const existingContact = clientContactsWithSlugs.find(c => c.email === project.client_email);
            if (!existingContact) {
                clientContactsWithSlugs.push({
                    email: project.client_email,
                    name: project.client_name || 'Client',
                    slug: null,
                    token: null
                });
            }
        }
        
        // Get team member emails (batch query)
        if (project.assigned_team && Array.isArray(project.assigned_team) && project.assigned_team.length > 0) {
            const teamIds = [...new Set(project.assigned_team.filter(Boolean))];
            const teamMembers = teamIds.length > 0
                ? await base44.asServiceRole.entities.TeamMember.filter({ id: { $in: teamIds } })
                : [];
            teamMembers.forEach(member => {
                if (member && member.email) teamEmails.add(member.email);
            });
        }

        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
             console.error("RESEND_API_KEY not set");
             return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }

        const emailResults = [];

        // Send personalized emails to client contacts with direct links sequentially to respect rate limits
        for (let i = 0; i < clientContactsWithSlugs.length; i++) {
            const clientContact = clientContactsWithSlugs[i];
            let requestDetailUrl = clientPortalBaseUrl;
            if (clientContact.slug) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&slug=${clientContact.slug}`;
            } else if (clientContact.token) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&token=${clientContact.token}`;
            }

            // Prepare placeholder data
            const placeholderData = {
                project_name: project.name,
                request_title: request.title,
                old_status: oldStatus || 'unknown',
                new_status: newStatus,
                client_name: clientContact.name,
                client_slug: clientContact.slug || ''
            };

            // Replace placeholders
            const subject = replacePlaceholders(subjectTemplate, placeholderData);
            const bodyIntro = replacePlaceholders(bodyIntroTemplate, placeholderData);
            const closing = replacePlaceholders(closingText, placeholderData);

            const htmlBody = `
<h1 style="margin: 0 0 8px 0; color: #c00; font-size: 24px;">PROJECT: ${project.name}</h1>
<h2 style="margin: 0 0 20px 0; color: #333; font-size: 18px; font-weight: normal;">Request Update: ${request.title}</h2>

<p>Hi ${clientContact.name},</p>

<p>${bodyIntro}</p>

<p>
Status changed from <strong>${oldStatus || 'unknown'}</strong>
to <strong>${newStatus}</strong>.
</p>

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

<p>
<a href="${requestDetailUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 10px;">
${buttonText}
</a>
</p>

<p style="color: #666; font-size: 14px;">
Direct link: <a href="${requestDetailUrl}" style="color: #3b82f6;">${requestDetailUrl}</a>
</p>

${clientContact.slug ? `<p style="color: #666; font-size: 14px;">Your portal code: <strong>${clientContact.slug}</strong></p>` : ''}

<p>
${closing}
</p>
`;

            const textBody = `
PROJECT: ${project.name}
Request Update: ${request.title}

Hi ${clientContact.name},

${bodyIntro}

Status changed from ${oldStatus || 'unknown'} to ${newStatus}.

${request.title}
${request.body || 'No description provided.'}

${latestTeamComment ? `Latest Update From Ächtung Kraft:
---------------------------------
${getCommentTextSummary(latestTeamComment) || ''}
` : ''}
View the request:
${requestDetailUrl}

${clientContact.slug ? `Your portal code: ${clientContact.slug}` : ''}

${closing}
`;

            try {
                const emailResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: "Achtung Kraft Projects <updates@projects.achtungkraft.com>",
                        to: [clientContact.email],
                        subject: subject,
                        html: htmlBody,
                        text: textBody
                    })
                });

                if (emailResponse.ok) {
                    const data = await emailResponse.json();
                    emailResults.push({ email: clientContact.email, success: true, id: data.id });
                } else {
                    const errorData = await emailResponse.json();
                    emailResults.push({ email: clientContact.email, success: false, error: errorData });
                }
            } catch (emailError) {
                console.error(`Error sending email to ${clientContact.email}:`, emailError);
                emailResults.push({ email: clientContact.email, success: false, error: emailError.message });
            }

            // Wait 600ms between emails to stay well under the 2/second rate limit
            if (i < clientContactsWithSlugs.length - 1 || teamEmails.size > 0) {
                await delay(600);
            }
        }

        // Send generic email to team members (internal link)
        if (teamEmails.size > 0) {
            const internalUrl = `https://projects.achtungkraft.com/ClientFeedbackDetail?id=${request.id}&projectId=${request.project_id}`;
            
            // Prepare placeholder data for team
            const teamPlaceholderData = {
                project_name: project.name,
                request_title: request.title,
                old_status: oldStatus || 'unknown',
                new_status: newStatus,
                client_name: 'Team',
                client_slug: ''
            };

            const teamSubject = replacePlaceholders(subjectTemplate, teamPlaceholderData);
            const teamBodyIntro = replacePlaceholders(bodyIntroTemplate, teamPlaceholderData);
            const teamClosing = replacePlaceholders(closingText, teamPlaceholderData);
            
            const teamHtmlBody = `
<h1 style="margin: 0 0 8px 0; color: #c00; font-size: 24px;">PROJECT: ${project.name}</h1>
<h2 style="margin: 0 0 20px 0; color: #333; font-size: 18px; font-weight: normal;">Request Update: ${request.title}</h2>

<p>Hello,</p>

<p>${teamBodyIntro}</p>

<p>
Status changed from <strong>${oldStatus || 'unknown'}</strong>
to <strong>${newStatus}</strong>.
</p>

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

<p>
<a href="${internalUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 10px;">
${buttonText}
</a>
</p>

<p>
${teamClosing}
</p>
`;

            const teamTextBody = `
PROJECT: ${project.name}
Request Update: ${request.title}

${teamBodyIntro}

Status changed from ${oldStatus || 'unknown'} to ${newStatus}.

${request.title}
${request.body || 'No description provided.'}

${latestTeamComment ? `Latest Update From Ächtung Kraft:
---------------------------------
${getCommentTextSummary(latestTeamComment) || ''}
` : ''}
View the request:
${internalUrl}

${teamClosing}
`;

            const teamEmailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: "Achtung Kraft Projects <updates@projects.achtungkraft.com>",
                    to: Array.from(teamEmails),
                    subject: teamSubject,
                    html: teamHtmlBody,
                    text: teamTextBody
                })
            });

            if (teamEmailResponse.ok) {
                const data = await teamEmailResponse.json();
                emailResults.push({ emails: Array.from(teamEmails), success: true, id: data.id });
            }
        }

        console.log(`Status update emails sent for Request ${requestId}: ${oldStatus} -> ${newStatus}`);

        return Response.json({ success: true, results: emailResults });

    } catch (error) {
        console.error("Error in sendRequestStatusUpdateEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});