import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        // Fetch Request details
        const requests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ id: requestId });
        const request = requests[0];

        if (!request) {
            return Response.json({ error: 'Request not found' }, { status: 404 });
        }

        // Fetch Project details
        const projects = await base44.asServiceRole.entities.Project.filter({ id: request.project_id });
        const project = projects[0];

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Get client accesses for this project
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: request.project_id,
            access_status: 'active'
        });



        // Prepare email content
        const clientPortalBaseUrl = 'https://akclient.base44.app';
        
        // For status update emails, we need to send personalized emails per client contact with their slug
        // First, separate client recipients from team members
        const clientEmails = new Set();
        const teamEmails = new Set();
        
        // Get client contact emails with their slugs
        const clientContactsWithSlugs = [];
        if (accesses.length > 0) {
            const contactPromises = accesses.map(async (access) => {
                const contactResults = await base44.asServiceRole.entities.ClientContact.filter({ id: access.client_contact_id });
                const contact = contactResults[0];
                if (contact && contact.email) {
                    clientContactsWithSlugs.push({
                        email: contact.email,
                        name: contact.name,
                        slug: contact.url_slug || access.url_slug,
                        token: access.share_token
                    });
                }
            });
            await Promise.all(contactPromises);
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
        
        // Get team member emails
        if (project.assigned_team && Array.isArray(project.assigned_team) && project.assigned_team.length > 0) {
            const teamPromises = project.assigned_team.map(id => 
                base44.asServiceRole.entities.TeamMember.filter({ id })
            );
            const teamResults = await Promise.all(teamPromises);
            teamResults.flat().forEach(member => {
                if (member && member.email) teamEmails.add(member.email);
            });
        }

        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
             console.error("RESEND_API_KEY not set");
             return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }

        const subject = `Achtung Kraft // Request Update: ${request.title}`;
        const emailResults = [];

        // Send personalized emails to client contacts with direct links
        for (const clientContact of clientContactsWithSlugs) {
            let requestDetailUrl = clientPortalBaseUrl;
            if (clientContact.slug) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&slug=${clientContact.slug}`;
            } else if (clientContact.token) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&token=${clientContact.token}`;
            }

            const htmlBody = `
<p>Hi ${clientContact.name},</p>

<p>The request <strong>${request.title}</strong> has been updated.</p>

<p>
Status changed from <strong>${oldStatus || 'unknown'}</strong>
to <strong>${newStatus}</strong>.
</p>

<div style="background-color: #f9f9f9; border-left: 4px solid #c00; padding: 16px; margin: 20px 0;">
    <h3 style="margin: 0 0 8px 0; color: #c00;">${request.title}</h3>
    <p style="margin: 0; color: #333; white-space: pre-wrap;">${request.body || 'No description provided.'}</p>
</div>

<p>
<a href="${requestDetailUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 10px;">
VIEW REQUEST
</a>
</p>

<p style="color: #666; font-size: 14px;">
Direct link: <a href="${requestDetailUrl}" style="color: #3b82f6;">${requestDetailUrl}</a>
</p>

<p>
— Achtung Kraft Projects
</p>
`;

            const textBody = `
Hi ${clientContact.name},

The request "${request.title}" has been updated.

Status changed from ${oldStatus || 'unknown'} to ${newStatus}.

${request.title}
${request.body || 'No description provided.'}

View the request:
${requestDetailUrl}
`;

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
        }

        // Send generic email to team members (internal link)
        if (teamEmails.size > 0) {
            const internalUrl = `https://projects.achtungkraft.com/ClientFeedbackDetail?id=${request.id}&projectId=${request.project_id}`;
            
            const teamHtmlBody = `
<p>Hello,</p>

<p>The request <strong>${request.title}</strong> has been updated.</p>

<p>
Status changed from <strong>${oldStatus || 'unknown'}</strong>
to <strong>${newStatus}</strong>.
</p>

<div style="background-color: #f9f9f9; border-left: 4px solid #c00; padding: 16px; margin: 20px 0;">
    <h3 style="margin: 0 0 8px 0; color: #c00;">${request.title}</h3>
    <p style="margin: 0; color: #333; white-space: pre-wrap;">${request.body || 'No description provided.'}</p>
</div>

<p>
<a href="${internalUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 10px;">
VIEW REQUEST
</a>
</p>

<p>
— Achtung Kraft Projects
</p>
`;

            const teamTextBody = `
The request "${request.title}" has been updated.

Status changed from ${oldStatus || 'unknown'} to ${newStatus}.

${request.title}
${request.body || 'No description provided.'}

View the request:
${internalUrl}
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
                    subject: subject,
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