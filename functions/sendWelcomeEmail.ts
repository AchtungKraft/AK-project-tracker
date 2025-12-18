import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

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

        // Build portal URL
        const appBaseUrl = Deno.env.get("APP_BASE_URL") || 'https://projects.achtungkraft.com';
        let portalUrl;
        
        if (contact.url_slug) {
            portalUrl = `${appBaseUrl}/ClientProjects?slug=${contact.url_slug}`;
        } else if (access.share_token) {
            portalUrl = `${appBaseUrl}/ClientProjects?token=${access.share_token}`;
        } else {
            return Response.json({ error: 'No valid access method found' }, { status: 400 });
        }

        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        
        if (!resendApiKey) {
            console.error("RESEND_API_KEY not set");
            return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }

        const subject = `Welcome to ${project.name} Project Portal`;
        
        const htmlBody = `
<p>Hi ${contact.name},</p>

<p>Welcome! You've been given access to the <strong>${project.name}</strong> project portal.</p>

<div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0;">
    <h3 style="margin: 0 0 8px 0; color: #1e40af;">What You Can Do</h3>
    <ul style="margin: 8px 0; padding-left: 20px; color: #374151;">
        <li>View project updates and progress</li>
        <li>Review and approve design submissions</li>
        <li>Provide feedback and request changes</li>
        <li>Track project milestones</li>
    </ul>
</div>

<p>
<a href="${portalUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
ACCESS YOUR PORTAL
</a>
</p>

<p style="color: #666; font-size: 14px;">
Your unique portal link:<br/>
<a href="${portalUrl}" style="color: #3b82f6;">${portalUrl}</a>
</p>

<p style="color: #666; font-size: 14px;">
<em>Bookmark this link for easy access to your project portal anytime.</em>
</p>

<p>
If you have any questions, feel free to reach out.<br/>
— Achtung Kraft Projects
</p>
`;

        const textBody = `
Hi ${contact.name},

Welcome! You've been given access to the ${project.name} project portal.

What You Can Do:
- View project updates and progress
- Review and approve design submissions
- Provide feedback and request changes
- Track project milestones

Access your portal here:
${portalUrl}

Bookmark this link for easy access to your project portal anytime.

If you have any questions, feel free to reach out.
— Achtung Kraft Projects
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