import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_TEMPLATES = {
    bulk_review: {
        subject: "Achtung Kraft // {item_count} ITEMS NEED YOUR REVIEW: {project_name}",
        body_intro: "You have {item_count} item(s) that need your review:",
        button_text: "VIEW ALL ITEMS",
        closing_text: "— Achtung Kraft Projects",
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
        const bodyIntroTemplate = savedTemplate?.body_intro || defaultTpl.body_intro;
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;

        // Build items HTML for the centralized template
        const itemsListHtml = requests.map(r => `
            <li style="margin-bottom:12px;padding:12px;background-color:#f9f9f9;border-left:4px solid #c00;">
                <strong style="color:#333;">${r.title}</strong>
                <br><span style="color:#666;font-size:14px;">${r.request_type?.replace('_', ' ') || 'Review'}</span>
            </li>
        `).join('');

        const itemsListText = requests.map(r => `- ${r.title} (${r.request_type?.replace('_', ' ') || 'Review'})`).join('\n');

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

            const placeholderData = { project_name: project.name, item_count: requests.length, client_name: contact.name, client_slug: clientSlug };
            const subject = replacePlaceholders(subjectTemplate, placeholderData);
            const bodyIntro = replacePlaceholders(bodyIntroTemplate, placeholderData);

            const textBody = [
                `PROJECT: ${project.name}`,
                `${requests.length} ITEMS NEED YOUR REVIEW`,
                '', `Hi ${contact.name},`, '', bodyIntro, '', itemsListText, '',
                `View all items here:\n${portalUrl}`,
                clientSlug ? `\nYour portal code: ${clientSlug}` : '',
                '\nPlease respond directly in the portal — replies to this email are not monitored.',
                '\n— Achtung Kraft Projects',
            ].filter(Boolean).join('\n');

            try {
                const sendResponse = await base44.functions.invoke('sendClientEmail', {
                    to: contact.email,
                    contactName: contact.name,
                    subject,
                    emailType: 'bulk_review',
                    projectName: project.name,
                    headline: `${requests.length} ITEMS NEED YOUR REVIEW`,
                    introText: bodyIntro,
                    itemsListHtml,
                    ctaUrl: portalUrl,
                    ctaText: buttonText,
                    clientSlug: clientSlug || null,
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