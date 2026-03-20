import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Default templates
const DEFAULT_TEMPLATES = {
    journal_entry: {
        subject: "Achtung Kraft // New Update: {headline}",
        body_intro: "There's a new update on your project:",
        button_text: "VIEW FULL UPDATE",
        closing_text: "— Achtung Kraft Projects",
    }
};

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Replace placeholders in text
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
        
        // Parse payload
        const { journalEntryId } = await req.json();

        if (!journalEntryId) {
            return Response.json({ error: 'Missing journalEntryId' }, { status: 400 });
        }

        // Fetch Journal Entry details
        const entries = await base44.asServiceRole.entities.JournalEntry.filter({ id: journalEntryId });
        const entry = entries[0];

        if (!entry) {
            return Response.json({ error: 'Journal entry not found' }, { status: 404 });
        }

        // Only send emails for client-visible entries
        if (entry.visibility !== 'client') {
            console.log(`Journal entry ${journalEntryId} is internal only. Skipping email.`);
            return Response.json({ message: 'Entry is internal only, no emails sent' });
        }

        // Fetch Project details
        const projects = await base44.asServiceRole.entities.Project.filter({ id: entry.project_id });
        const project = projects[0];

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Fetch email template
        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'journal_entry' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.journal_entry;

        // Get all active client accesses for this project
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: entry.project_id,
            access_status: 'active'
        });

        if (accesses.length === 0) {
            console.log(`No active client accesses found for project ${project.id}. Skipping email.`);
            return Response.json({ message: 'No active clients found' });
        }

        // Fetch all client contacts via $in batch query
        const clientContactIds = [...new Set(accesses.map(a => a.client_contact_id).filter(Boolean))];
        const contacts = clientContactIds.length > 0
            ? await base44.asServiceRole.entities.ClientContact.filter({ id: { $in: clientContactIds } })
            : [];

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

        // Get template values
        const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
        const bodyIntroTemplate = savedTemplate?.body_intro || defaultTpl.body_intro;
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;
        const closingText = savedTemplate?.closing_text || defaultTpl.closing_text;

        // Truncate content for email preview
        // Prefer content_html (stripped to text), fall back to legacy content field
        const htmlStripped = entry.content_html ? entry.content_html.replace(/<[^>]*>/g, '').trim() : '';
        const rawContent = htmlStripped || entry.content || '';
        const contentPreview = rawContent.length > 500 
            ? rawContent.substring(0, 500) + '...' 
            : rawContent;

        // Normalize links: structured links or legacy url conversion
        const entryLinks = Array.isArray(entry.links) && entry.links.length > 0
            ? entry.links
            : (entry.url && typeof entry.url === 'string' && entry.url.trim())
                ? [{ name: 'External Link', url: entry.url, type: 'external' }]
                : [];

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

            // Build the direct journal URL with slug or token
            let journalUrl;
            if (contact.url_slug) {
                journalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${entry.project_id}&slug=${contact.url_slug}&tab=journal`;
            } else if (access.url_slug) {
                journalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${entry.project_id}&slug=${access.url_slug}&tab=journal`;
            } else if (access.share_token) {
                journalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${entry.project_id}&token=${access.share_token}&tab=journal`;
            } else {
                console.warn(`No slug or token for contact ${contact.id}, skipping email`);
                results.push(null);
                continue;
            }

            // Prepare placeholder data
            const placeholderData = {
                project_name: project.name,
                headline: entry.headline || project.name,
                content_preview: contentPreview,
                client_name: contact.name,
                client_slug: clientSlug
            };

            // Replace placeholders
            const subject = replacePlaceholders(subjectTemplate, placeholderData);
            const bodyIntro = replacePlaceholders(bodyIntroTemplate, placeholderData);
            const closing = replacePlaceholders(closingText, placeholderData);

            const htmlBody = `
<h1 style="margin: 0 0 8px 0; color: #c00; font-size: 24px;">PROJECT: ${project.name}</h1>
<h2 style="margin: 0 0 20px 0; color: #333; font-size: 18px; font-weight: normal;">New Update: ${entry.headline || 'Project Journal'}</h2>

<p>Hi ${contact.name},</p>

<p>${bodyIntro}</p>

<div style="background-color: #f9f9f9; border-left: 4px solid #c00; padding: 16px; margin: 20px 0;">
    ${entry.headline ? `<h3 style="margin: 0 0 12px 0; color: #c00;">${entry.headline}</h3>` : ''}
    <p style="margin: 0; color: #333; white-space: pre-wrap;">${contentPreview}</p>
</div>

${entryLinks.length > 0 ? `
<div style="margin: 16px 0;">
    <p style="color: #666; font-size: 14px; font-weight: bold; margin-bottom: 8px;">Related Links:</p>
    ${entryLinks.filter(l => l.url).map(l => {
        const href = l.url.startsWith('http') ? l.url : 'https://' + l.url;
        return `<p style="margin: 4px 0;"><a href="${href}" style="color: #3b82f6; text-decoration: underline;">${l.name || l.url}</a>${l.description ? ` — ${l.description}` : ''}</p>`;
    }).join('\n')}
</div>
` : ''}

<p style="margin: 30px 0;">
<a href="${journalUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
${buttonText}
</a>
</p>

<p style="color: #666; font-size: 14px;">
Direct link: <a href="${journalUrl}" style="color: #3b82f6;">${journalUrl}</a>
</p>

${clientSlug ? `<p style="color: #666; font-size: 14px;">Your portal code: <strong>${clientSlug}</strong></p>` : ''}

<p>
${closing}
</p>
`;

            const textBody = `
PROJECT: ${project.name}
New Update: ${entry.headline || 'Project Journal'}

Hi ${contact.name},

${bodyIntro}

${entry.headline ? entry.headline + '\n\n' : ''}${contentPreview}
${entryLinks.length > 0 ? '\nRelated Links:\n' + entryLinks.filter(l => l.url).map(l => `- ${l.name || l.url}: ${l.url.startsWith('http') ? l.url : 'https://' + l.url}`).join('\n') + '\n' : ''}
View the full update here:
${journalUrl}

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
                    console.log(`Journal email sent to ${contact.email} for entry ${journalEntryId}. ID: ${emailData.id}`);
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

        return Response.json({ 
            success: true, 
            emailsSent: successfulEmails.length,
            results: results.filter(Boolean)
        });

    } catch (error) {
        console.error("Error in sendJournalEntryEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});