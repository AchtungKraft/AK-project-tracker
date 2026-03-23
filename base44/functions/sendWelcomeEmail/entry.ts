import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Default templates
const DEFAULT_TEMPLATES = {
    welcome: {
        subject: "Achtung Kraft // Welcome to {project_name} Project Portal",
        body_intro: "Welcome! You've been given access to the project portal.",
        button_text: "ACCESS YOUR PORTAL",
        closing_text: "— Achtung Kraft Projects",
    }
};

// Replace placeholders in text
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
        
        // Parse payload
        const { clientContactId, projectId, accessId } = await req.json();

        if (!clientContactId || !projectId || !accessId) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Fetch client contact
        const contacts = await base44.asServiceRole.entities.ClientContact.filter({ id: clientContactId });
        const contact = contacts[0];

        if (!contact) {
            return Response.json({ error: 'Client contact not found' }, { status: 404 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        const project = projects[0];

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Fetch access record
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ id: accessId });
        const access = accesses[0];

        if (!access) {
            return Response.json({ error: 'Access record not found' }, { status: 404 });
        }

        // NOTIFICATION PREFERENCE CHECK: Skip if contact opted out of email
        if (contact.notify_email === false) {
            console.log(`Skipping welcome email to ${contact.email} - email notifications disabled`);
            return Response.json({ success: true, skipped: true, reason: 'email_opt_out' });
        }

        // Fetch email template
        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'welcome' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.welcome;

        // Get template values
        const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
        const bodyIntroTemplate = savedTemplate?.body_intro || defaultTpl.body_intro;
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;
        const closingText = savedTemplate?.closing_text || defaultTpl.closing_text;

        // Build portal URL
        const clientPortalBaseUrl = 'https://akclient.base44.app';
        const clientSlug = contact.url_slug || access.url_slug || '';

        // Prepare placeholder data
        const placeholderData = {
            project_name: project.name,
            client_name: contact.name,
            client_slug: clientSlug
        };

        // Replace placeholders
        const subject = replacePlaceholders(subjectTemplate, placeholderData);
        const bodyIntro = replacePlaceholders(bodyIntroTemplate, placeholderData);
        const closing = replacePlaceholders(closingText, placeholderData);

        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        
        if (!resendApiKey) {
            console.error("RESEND_API_KEY not set");
            return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }
        
        const htmlBody = `
<h1 style="margin: 0 0 8px 0; color: #c00; font-size: 24px;">PROJECT: ${project.name}</h1>
<h2 style="margin: 0 0 20px 0; color: #333; font-size: 18px; font-weight: normal;">Welcome to Your Project Portal</h2>

<p>Hi ${contact.name},</p>

<p>${bodyIntro}</p>

<div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0;">
    <h3 style="margin: 0 0 8px 0; color: #1e40af;">What You Can Do</h3>
    <ul style="margin: 8px 0; padding-left: 20px; color: #374151;">
        <li>View project updates and progress</li>
        <li>Review and approve design submissions</li>
        <li>Provide feedback and request changes</li>
        <li>Track project milestones</li>
    </ul>
</div>

${clientSlug ? `
<div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0;">
    <h3 style="margin: 0 0 8px 0; color: #92400e;">Your Portal Code</h3>
    <p style="margin: 0; font-size: 18px; font-weight: bold; color: #78350f;">${clientSlug}</p>
    <p style="margin: 8px 0 0 0; color: #92400e; font-size: 14px;">Use this code to access your project portal.</p>
</div>
` : ''}

<p>
<a href="${clientPortalBaseUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
${buttonText}
</a>
</p>

<p style="color: #666; font-size: 14px;">
Your portal link:<br/>
<a href="${clientPortalBaseUrl}" style="color: #3b82f6;">${clientPortalBaseUrl}</a>
</p>

<p style="color: #666; font-size: 14px;">
<em>Bookmark this link for easy access to your project portal anytime.</em>
</p>

<p>
If you have any questions, feel free to reach out.<br/>
${closing}
</p>
`;

        const textBody = `
PROJECT: ${project.name}
Welcome to Your Project Portal

Hi ${contact.name},

${bodyIntro}

What You Can Do:
- View project updates and progress
- Review and approve design submissions
- Provide feedback and request changes
- Track project milestones

${clientSlug ? `Your Portal Code: ${clientSlug}\nUse this code to access your project portal.\n` : ''}

Access your portal here:
${clientPortalBaseUrl}

Bookmark this link for easy access to your project portal anytime.

If you have any questions, feel free to reach out.
${closing}
`;

        // Send welcome email
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
            console.error(`Failed to send welcome email to ${contact.email}:`, errorData);
            return Response.json({ error: 'Failed to send email', details: errorData }, { status: 500 });
        }

        const emailData = await emailResponse.json();
        console.log(`Welcome email sent to ${contact.email} for project ${project.name}. ID: ${emailData.id}`);

        return Response.json({ 
            success: true, 
            emailId: emailData.id,
            recipient: contact.email
        });

    } catch (error) {
        console.error("Error in sendWelcomeEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});