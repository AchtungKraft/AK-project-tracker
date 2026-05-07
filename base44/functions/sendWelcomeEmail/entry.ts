import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_TEMPLATES = {
    welcome: {
        subject: "Achtung Kraft // Welcome to {project_name} Project Portal",
        button_text: "ACCESS YOUR PORTAL",
    }
};

function replacePlaceholders(text, data) {
    if (!text) return '';
    return text
        .replace(/{project_name}/g, data.project_name || '')
        .replace(/{client_name}/g, data.client_name || '')
        .replace(/{client_slug}/g, data.client_slug || '');
}

function getFirstName(fullName) {
    if (!fullName || typeof fullName !== 'string') return null;
    return fullName.trim().split(/\s+/)[0] || null;
}

function buildWelcomeHtml({
    projectName, greeting, introText,
    ctaUrl, ctaText, portalCode,
}) {
    const clientIdLine = portalCode
      ? `<div style="margin-top:8px;font-size:22px;font-weight:700;line-height:1.4;"><span style="color:#111;">Your Client ID &rarr;</span> <span style="color:#cc0000;">${portalCode}</span></div>`
      : '';

    return `<div style="max-width:580px;margin:0 auto;padding:36px 24px;background:#ffffff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">

  <!-- Greeting -->
  <div style="font-size:15px;color:#333;line-height:1.5;">${greeting}</div>

  <!-- Project label -->
  <div style="margin-top:20px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#999;">Project</div>
  <div style="font-size:20px;font-weight:700;color:#111;margin-top:4px;">${projectName}</div>

  <!-- Title -->
  <div style="font-size:36px;line-height:1.1;font-weight:700;color:#111;margin-top:28px;">Welcome to Your<br/>Project Portal</div>

  <!-- Intro -->
  <div style="margin-top:16px;font-size:15px;color:#555;line-height:1.6;">${introText}</div>

  <!-- CTA -->
  <div style="margin-top:28px;">
    <a href="${ctaUrl}" style="display:inline-block;background:#cc0000;color:#fff;padding:12px 20px;border-radius:6px;font-weight:600;font-size:15px;text-decoration:none;">${ctaText}</a>
  </div>

  <!-- Client Portal Access -->
  <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e5e5e5;">
    <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#111;">Client Portal Access</div>
    <div style="margin-top:8px;font-size:14px;color:#555;line-height:1.5;">Use this code to access your project portal.</div>
    <div style="margin-top:16px;">
      <a href="${ctaUrl}" style="font-size:22px;font-weight:700;color:#cc0000;line-height:1.4;text-decoration:none;">${ctaUrl}</a>
      ${clientIdLine}
    </div>
  </div>

  <!-- What You Can Do -->
  <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e5e5;">
    <div style="font-size:15px;font-weight:600;color:#111;margin-bottom:8px;">What You Can Do</div>
    <ul style="margin:0;padding-left:20px;line-height:1.8;color:#333;font-size:14px;">
      <li>View project updates and progress</li>
      <li>Review and approve design submissions</li>
      <li>Provide feedback and request changes</li>
      <li>Track project milestones</li>
    </ul>
  </div>

  <!-- Sign-off -->
  <div style="margin-top:32px;font-size:13px;color:#666;">&mdash; Achtung Kraft Projects<br/>Precision builds. Clear communication.</div>

</div>`;
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
        const buttonText = savedTemplate?.button_text || defaultTpl.button_text;

        const clientPortalBaseUrl = 'https://akclient.base44.app';
        const clientSlug = contact.url_slug || access.url_slug || '';

        const placeholderData = { project_name: project.name, client_name: contact.name, client_slug: clientSlug };
        const subject = replacePlaceholders(subjectTemplate, placeholderData);

        const firstName = getFirstName(contact.name);
        const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
        const introText = 'You now have access to your Ächtung Kraft project portal where you can review updates, approvals, and project progress.';

        const rawHtml = buildWelcomeHtml({
            projectName: project.name,
            greeting,
            introText,
            ctaUrl: clientPortalBaseUrl,
            ctaText: buttonText,
            portalCode: clientSlug || null,
        });

        const textBody = [
            greeting,
            '',
            `PROJECT: ${project.name}`,
            '',
            'Welcome to Your Project Portal',
            '',
            introText,
            '',
            '---',
            '',
            'CLIENT PORTAL ACCESS',
            'Use this code to access your project portal.',
            '',
            `Direct link → ${clientPortalBaseUrl}`,
            clientSlug ? `Your Client ID → ${clientSlug}` : '',
            '',
            '---',
            '',
            'What You Can Do:',
            '- View project updates and progress',
            '- Review and approve design submissions',
            '- Provide feedback and request changes',
            '- Track project milestones',
            '',
            '— Achtung Kraft Projects',
            'Precision builds. Clear communication.',
        ].filter(Boolean).join('\n');

        const sendResponse = await base44.functions.invoke('sendClientEmail', {
            to: contact.email,
            subject,
            emailType: 'welcome',
            rawHtml,
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