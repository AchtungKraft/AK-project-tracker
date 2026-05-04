import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_TEMPLATES = {
    journal_entry: {
        subject: "Achtung Kraft // New Update: {headline}",
        body_intro: "There's a new update on your project:",
        button_text: "VIEW FULL UPDATE",
        closing_text: "— Achtung Kraft Projects",
    }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function replacePlaceholders(text, data) {
    if (!text) return '';
    return text
        .replace(/{project_name}/g, data.project_name || '')
        .replace(/{headline}/g, data.headline || '')
        .replace(/{content_preview}/g, data.content_preview || '')
        .replace(/{client_name}/g, data.client_name || '')
        .replace(/{client_slug}/g, data.client_slug || '');
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { journalEntryId } = await req.json();

        if (!journalEntryId) return Response.json({ error: 'Missing journalEntryId' }, { status: 400 });

        const entries = await base44.asServiceRole.entities.JournalEntry.filter({ id: journalEntryId });
        const entry = entries[0];
        if (!entry) return Response.json({ error: 'Journal entry not found' }, { status: 404 });

        if (entry.visibility !== 'client') {
            return Response.json({ message: 'Entry is internal only, no emails sent' });
        }

        const projects = await base44.asServiceRole.entities.Project.filter({ id: entry.project_id });
        const project = projects[0];
        if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'journal_entry' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.journal_entry;

        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: entry.project_id, access_status: 'active'
        });
        if (accesses.length === 0) return Response.json({ message: 'No active clients found' });

        const clientContactIds = [...new Set(accesses.map(a => a.client_contact_id).filter(Boolean))];
        const contacts = clientContactIds.length > 0
            ? await base44.asServiceRole.entities.ClientContact.filter({ id: { $in: clientContactIds } })
            : [];
        if (contacts.length === 0) return Response.json({ message: 'No client contacts found' });

        const clientPortalBaseUrl = 'https://akclient.base44.app';

        const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
        const bodyIntroTemplate = savedTemplate?.body_intro || defaultTpl.body_intro;
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;

        // Content preview
        const htmlStripped = entry.content_html ? entry.content_html.replace(/<[^>]*>/g, '').trim() : '';
        const rawContent = htmlStripped || entry.content || '';
        const contentPreview = rawContent.length > 500 ? rawContent.substring(0, 500) + '...' : rawContent;

        // Links
        const entryLinks = Array.isArray(entry.links) && entry.links.length > 0
            ? entry.links
            : (entry.url && typeof entry.url === 'string' && entry.url.trim())
                ? [{ name: 'External Link', url: entry.url, type: 'external' }]
                : [];

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

            let journalUrl;
            if (contact.url_slug) {
                journalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${entry.project_id}&slug=${contact.url_slug}&tab=journal`;
            } else if (access.url_slug) {
                journalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${entry.project_id}&slug=${access.url_slug}&tab=journal`;
            } else if (access.share_token) {
                journalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${entry.project_id}&token=${access.share_token}&tab=journal`;
            } else {
                results.push(null);
                continue;
            }

            const placeholderData = {
                project_name: project.name,
                headline: entry.headline || project.name,
                content_preview: contentPreview,
                client_name: contact.name,
                client_slug: clientSlug,
            };

            const subject = replacePlaceholders(subjectTemplate, placeholderData);
            const bodyIntro = replacePlaceholders(bodyIntroTemplate, placeholderData);

            // Content block
            const contentBlockHtml = [
                entry.headline ? `<h3 style="margin:0 0 12px 0;color:#c00;">${entry.headline}</h3>` : '',
                `<p style="margin:0;color:#333;white-space:pre-wrap;">${contentPreview}</p>`,
            ].join('');

            // Links block
            let linksBlockHtml = null;
            if (entryLinks.length > 0) {
                const linkItems = entryLinks.filter(l => l.url).map(l => {
                    const href = l.url.startsWith('http') ? l.url : 'https://' + l.url;
                    return `<p style="margin:4px 0;"><a href="${href}" style="color:#3b82f6;text-decoration:underline;">${l.name || l.url}</a>${l.description ? ` — ${l.description}` : ''}</p>`;
                }).join('\n');
                linksBlockHtml = `<div style="margin:16px 0;"><p style="color:#666;font-size:14px;font-weight:bold;margin-bottom:8px;">Related Links:</p>${linkItems}</div>`;
            }

            const textBody = [
                `PROJECT: ${project.name}`,
                `New Update: ${entry.headline || 'Project Journal'}`,
                '', `Hi ${contact.name},`, '', bodyIntro, '',
                entry.headline ? entry.headline + '\n' : '',
                contentPreview,
                entryLinks.length > 0 ? '\nRelated Links:\n' + entryLinks.filter(l => l.url).map(l => `- ${l.name || l.url}: ${l.url.startsWith('http') ? l.url : 'https://' + l.url}`).join('\n') : '',
                '', `View the full update here:\n${journalUrl}`,
                clientSlug ? `\nYour portal code: ${clientSlug}` : '',
                '\nPlease respond directly in the portal — replies to this email are not monitored.',
                '\n— Achtung Kraft Projects',
            ].filter(Boolean).join('\n');

            try {
                const sendResponse = await base44.functions.invoke('sendClientEmail', {
                    to: contact.email,
                    contactName: contact.name,
                    subject,
                    emailType: 'journal_entry',
                    projectName: project.name,
                    headline: `New Update: ${entry.headline || 'Project Journal'}`,
                    introText: bodyIntro,
                    contentBlockHtml,
                    linksBlockHtml,
                    ctaUrl: journalUrl,
                    ctaText: buttonText,
                    clientSlug: clientSlug || null,
                    textBody,
                    projectId: project.id,
                    journalEntryId: entry.id,
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
        return Response.json({ success: true, emailsSent: successfulEmails.length, results: results.filter(Boolean) });

    } catch (error) {
        console.error("Error in sendJournalEntryEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});