import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_TEMPLATES = {
    status_update: {
        subject: "Achtung Kraft // Request Update: {request_title}",
        body_intro: "The request has been updated.",
        button_text: "VIEW REQUEST",
        closing_text: "— Achtung Kraft Projects",
    }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to get latest internal team comment (client-visible only)
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

function convertHtmlToEmailText(html) {
  if (!html || typeof html !== 'string') return '';
  let text = html;
  text = text.replace(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi, (_, c) => '\n\n' + c.replace(/<[^>]*>/g, '').trim().toUpperCase() + '\n');
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => '• ' + c.replace(/<[^>]*>/g, '').trim() + '\n');
  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '').replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
  text = text.replace(/[ \t]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function convertHtmlToEmailHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let safe = html;
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  safe = safe.replace(/<h2([^>]*)>/gi, '<h2$1 style="margin:12px 0 4px 0;font-size:16px;color:#fff;">');
  safe = safe.replace(/<h3([^>]*)>/gi, '<h3$1 style="margin:10px 0 4px 0;font-size:14px;color:#e5e5e5;">');
  safe = safe.replace(/<ul([^>]*)>/gi, '<ul$1 style="margin:4px 0;padding-left:20px;color:#e5e5e5;">');
  safe = safe.replace(/<li([^>]*)>/gi, '<li$1 style="margin:2px 0;color:#e5e5e5;">');
  safe = safe.replace(/<p([^>]*)>/gi, '<p$1 style="margin:6px 0;color:#e5e5e5;line-height:1.5;">');
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
        .replace(/{old_status}/g, data.old_status || '')
        .replace(/{new_status}/g, data.new_status || '')
        .replace(/{client_name}/g, data.client_name || '')
        .replace(/{client_slug}/g, data.client_slug || '');
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { requestId, oldStatus, newStatus } = await req.json();

        if (!requestId || !newStatus) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }
        if (oldStatus === newStatus) {
            return Response.json({ message: 'Status did not change, no email sent' });
        }
        if (newStatus === 'archived') {
            return Response.json({ message: 'Request archived - no email sent (internal action)' });
        }

        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];
        if (!request) return Response.json({ error: 'Request not found' }, { status: 404 });

        const comments = await base44.asServiceRole.entities.ClientFeedbackComment.filter({ request_id: request.id });
        const latestTeamComment = getLatestTeamComment(comments);

        const projects = await base44.asServiceRole.entities.Project.filter({ id: request.project_id });
        const project = projects[0];
        if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'status_update' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.status_update;

        const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
        const bodyIntroTemplate = savedTemplate?.body_intro || defaultTpl.body_intro;
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;

        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: request.project_id, access_status: 'active'
        });

        const clientPortalBaseUrl = 'https://akclient.base44.app';
        const emailResults = [];

        // --- CLIENT EMAILS ---
        const clientContactsWithSlugs = [];

        if (accesses.length > 0) {
            const contactIds = [...new Set(accesses.map(a => a.client_contact_id).filter(Boolean))];
            const allContacts = contactIds.length > 0
                ? await base44.asServiceRole.entities.ClientContact.filter({ id: { $in: contactIds } })
                : [];
            const contactMap = new Map(allContacts.map(c => [c.id, c]));

            for (const access of accesses) {
                const contact = contactMap.get(access.client_contact_id);
                if (contact && contact.email && contact.notify_email !== false) {
                    clientContactsWithSlugs.push({
                        email: contact.email,
                        name: contact.name,
                        slug: contact.url_slug || access.url_slug,
                        token: access.share_token,
                    });
                }
            }
        }

        // Add project client email if not already in contacts — but ONLY if they haven't opted out
        if (project.client_email) {
            const existing = clientContactsWithSlugs.find(c => c.email === project.client_email);
            if (!existing) {
                // Check if this email belongs to a ClientContact who opted out
                const matchingContacts = await base44.asServiceRole.entities.ClientContact.filter({ email: project.client_email });
                const matchingContact = matchingContacts[0];
                if (!matchingContact || matchingContact.notify_email !== false) {
                    clientContactsWithSlugs.push({
                        email: project.client_email,
                        name: project.client_name || 'Client',
                        slug: matchingContact?.url_slug || null, token: null,
                    });
                } else {
                    console.log(`Skipping project.client_email ${project.client_email} — opted out of email notifications`);
                }
            }
        }

        const commentBlockHtml = latestTeamComment ? getCommentEmailHtml(latestTeamComment) : null;
        const commentText = latestTeamComment ? getCommentEmailText(latestTeamComment) : '';

        for (let i = 0; i < clientContactsWithSlugs.length; i++) {
            const cc = clientContactsWithSlugs[i];
            let requestDetailUrl = clientPortalBaseUrl;
            if (cc.slug) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&slug=${cc.slug}`;
            } else if (cc.token) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&token=${cc.token}`;
            }

            const placeholderData = {
                project_name: project.name, request_title: request.title,
                old_status: oldStatus || 'unknown', new_status: newStatus,
                client_name: cc.name, client_slug: cc.slug || '',
            };

            const subject = replacePlaceholders(subjectTemplate, placeholderData);
            const bodyIntro = replacePlaceholders(bodyIntroTemplate, placeholderData);

            const statusChangeHtml = `<p style="color:#333;font-family:Arial,sans-serif;">Status changed from <strong>${oldStatus || 'unknown'}</strong> to <strong>${newStatus}</strong>.</p>`;
            const contentBlockHtml = `<h3 style="margin:0 0 8px 0;color:#c00;">${request.title}</h3><p style="margin:0;color:#333;white-space:pre-wrap;">${request.body || 'No description provided.'}</p>`;

            const textBody = [
                `PROJECT: ${project.name}`, `Request Update: ${request.title}`,
                '', `Hi ${cc.name},`, '', bodyIntro, '',
                `Status changed from ${oldStatus || 'unknown'} to ${newStatus}.`, '',
                request.title, request.body || 'No description provided.',
                commentText ? `\nLatest Update From Ächtung Kraft:\n---------------------------------\n${commentText}\n` : '',
                `\nView the request:\n${requestDetailUrl}`,
                cc.slug ? `\nYour portal code: ${cc.slug}` : '',
                '\nPlease respond directly in the portal — replies to this email are not monitored.',
                '\n— Achtung Kraft Projects',
            ].filter(Boolean).join('\n');

            try {
                const sendResponse = await base44.functions.invoke('sendClientEmail', {
                    to: cc.email, contactName: cc.name, subject,
                    emailType: 'status_update',
                    projectName: project.name,
                    headline: `Request Update: ${request.title}`,
                    introText: bodyIntro,
                    statusChangeHtml, contentBlockHtml, commentBlockHtml,
                    ctaUrl: requestDetailUrl, ctaText: buttonText,
                    clientSlug: cc.slug || null, textBody,
                    requestId: request.id, projectId: project.id,
                });

                if (sendResponse.data?.success) {
                    emailResults.push({ email: cc.email, success: true, id: sendResponse.data.emailId });
                } else {
                    emailResults.push({ email: cc.email, success: false, error: sendResponse.data?.error });
                }
            } catch (emailError) {
                emailResults.push({ email: cc.email, success: false, error: emailError.message });
            }

            if (i < clientContactsWithSlugs.length - 1) await delay(600);
        }

        // --- TEAM EMAILS ---
        const teamEmails = new Set();
        if (project.assigned_team && Array.isArray(project.assigned_team) && project.assigned_team.length > 0) {
            const teamIds = [...new Set(project.assigned_team.filter(Boolean))];
            const teamMembers = teamIds.length > 0
                ? await base44.asServiceRole.entities.TeamMember.filter({ id: { $in: teamIds } })
                : [];
            teamMembers.forEach(m => { if (m?.email) teamEmails.add(m.email); });
        }

        if (teamEmails.size > 0) {
            const internalUrl = `https://projects.achtungkraft.com/ClientFeedbackDetail?id=${request.id}&projectId=${request.project_id}`;
            const teamPlaceholderData = {
                project_name: project.name, request_title: request.title,
                old_status: oldStatus || 'unknown', new_status: newStatus,
                client_name: 'Team', client_slug: '',
            };
            const teamSubject = replacePlaceholders(subjectTemplate, teamPlaceholderData);
            const teamBodyIntro = replacePlaceholders(bodyIntroTemplate, teamPlaceholderData);

            const statusChangeHtml = `<p style="color:#333;">Status changed from <strong>${oldStatus || 'unknown'}</strong> to <strong>${newStatus}</strong>.</p>`;
            const contentBlockHtml = `<h3 style="margin:0 0 8px 0;color:#c00;">${request.title}</h3><p style="margin:0;color:#333;white-space:pre-wrap;">${request.body || 'No description provided.'}</p>`;

            const teamTextBody = [
                `PROJECT: ${project.name}`, `Request Update: ${request.title}`,
                '', teamBodyIntro, '',
                `Status changed from ${oldStatus || 'unknown'} to ${newStatus}.`, '',
                request.title, request.body || 'No description provided.',
                commentText ? `\nLatest Update:\n${commentText}\n` : '',
                `\nView the request:\n${internalUrl}`,
                '\n— Achtung Kraft Projects',
            ].filter(Boolean).join('\n');

            if (clientContactsWithSlugs.length > 0) await delay(600);

            try {
                const sendResponse = await base44.functions.invoke('sendClientEmail', {
                    to: Array.from(teamEmails), contactName: null, subject: teamSubject,
                    emailType: 'status_update_team',
                    projectName: project.name,
                    headline: `Request Update: ${request.title}`,
                    greeting: 'Hello,',
                    introText: teamBodyIntro,
                    statusChangeHtml, contentBlockHtml, commentBlockHtml,
                    ctaUrl: internalUrl, ctaText: 'VIEW REQUEST',
                    textBody: teamTextBody,
                    requestId: request.id, projectId: project.id,
                });

                if (sendResponse.data?.success) {
                    emailResults.push({ emails: Array.from(teamEmails), success: true, id: sendResponse.data.emailId });
                }
            } catch (teamErr) {
                console.error('Team email error:', teamErr);
            }
        }

        console.log(`Status update emails sent for Request ${requestId}: ${oldStatus} -> ${newStatus}`);
        return Response.json({ success: true, results: emailResults });

    } catch (error) {
        console.error("Error in sendRequestStatusUpdateEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});