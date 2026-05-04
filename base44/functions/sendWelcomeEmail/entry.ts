import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_TEMPLATES = {
    welcome: {
        subject: "Achtung Kraft // Welcome to {project_name} Project Portal",
        body_intro: "Welcome! You've been given access to the project portal.",
        button_text: "ACCESS YOUR PORTAL",
        closing_text: "— Achtung Kraft Projects",
    }
};

function replacePlaceholders(text, data) {
    if (!text) return '';
    return text
        .replace(/{project_name}/g, data.project_name || '')
        .replace(/{client_name}/g, data.client_name || '')
        .replace(/{client_slug}/g, data.client_slug || '');
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { clientContactId, projectId, accessId } = await req.json();

        if (!clientContactId || !projectId || !accessId) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const [contacts, projects, accesses] = await Promise.all([
            base44.asServiceRole.entities.ClientContact.filter({ id: clientContactId }),
            base44.asServiceRole.entities.Project.filter({ id: projectId }),
            base44.asServiceRole.entities.ProjectClientAccess.filter({ id: accessId }),
        ]);

        const contact = contacts[0];
        const project = projects[0];
        const access = accesses[0];

        if (!contact) return Response.json({ error: 'Client contact not found' }, { status: 404 });
        if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
        if (!access) return Response.json({ error: 'Access record not found' }, { status: 404 });

        if (contact.notify_email === false) {
            return Response.json({ success: true, skipped: true, reason: 'email_opt_out' });
        }

        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'welcome' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.welcome;

        const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
        const bodyIntroTemplate = savedTemplate?.body_intro || defaultTpl.body_intro;
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;

        const clientPortalBaseUrl = 'https://akclient.base44.app';
        const clientSlug = contact.url_slug || access.url_slug || '';

        const placeholderData = { project_name: project.name, client_name: contact.name, client_slug: clientSlug };
        const subject = replacePlaceholders(subjectTemplate, placeholderData);
        const bodyIntro = replacePlaceholders(bodyIntroTemplate, placeholderData);

        // Welcome-specific content block
        const contentBlockHtml = `
<h3 style="margin:0 0 8px 0;color:#1e40af;">What You Can Do</h3>
<ul style="margin:8px 0;padding-left:20px;color:#374151;">
    <li>View project updates and progress</li>
    <li>Review and approve design submissions</li>
    <li>Provide feedback and request changes</li>
    <li>Track project milestones</li>
</ul>`;

        // Portal code callout (separate from slug display)
        const portalCodeHtml = clientSlug ? `
<div style="background-color:#fef3c7;border-left:4px solid #f59e0b;padding:16px;margin:20px 0;">
    <h3 style="margin:0 0 8px 0;color:#92400e;">Your Portal Code</h3>
    <p style="margin:0;font-size:18px;font-weight:bold;color:#78350f;">${clientSlug}</p>
    <p style="margin:8px 0 0 0;color:#92400e;font-size:14px;">Use this code to access your project portal.</p>
</div>` : '';

        const textBody = [
            `PROJECT: ${project.name}`,
            'Welcome to Your Project Portal',
            '', `Hi ${contact.name},`, '', bodyIntro, '',
            'What You Can Do:',
            '- View project updates and progress',
            '- Review and approve design submissions',
            '- Provide feedback and request changes',
            '- Track project milestones',
            '',
            clientSlug ? `Your Portal Code: ${clientSlug}\nUse this code to access your project portal.\n` : '',
            `Access your portal here:\n${clientPortalBaseUrl}`,
            '',
            'Bookmark this link for easy access to your project portal anytime.',
            '',
            'If you have any questions, feel free to reach out.',
            '— Achtung Kraft Projects',
        ].filter(Boolean).join('\n');

        // Use centralized sender — welcome emails use a blue-themed content block instead of red
        // We pass the portal code block as additional HTML via linksBlockHtml slot
        const sendResponse = await base44.functions.invoke('sendClientEmail', {
            to: contact.email,
            contactName: contact.name,
            subject,
            emailType: 'welcome',
            projectName: project.name,
            headline: 'Welcome to Your Project Portal',
            introText: bodyIntro,
            contentBlockHtml,
            linksBlockHtml: portalCodeHtml,
            ctaUrl: clientPortalBaseUrl,
            ctaText: buttonText,
            textBody,
            projectId,
        });

        if (!sendResponse.data?.success) {
            return Response.json({ error: 'Failed to send email', details: sendResponse.data?.error }, { status: 500 });
        }

        return Response.json({ 
            success: true, emailId: sendResponse.data.emailId, recipient: contact.email
        });

    } catch (error) {
        console.error("Error in sendWelcomeEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});