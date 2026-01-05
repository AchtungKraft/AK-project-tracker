import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId, requestIds } = await req.json();

        if (!projectId || !requestIds || requestIds.length === 0) {
            return Response.json({ error: 'Missing projectId or requestIds' }, { status: 400 });
        }

        // Fetch Project details
        const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        const project = projects[0];

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Fetch all requests
        const allRequests = await base44.asServiceRole.entities.ClientFeedbackRequest.filter({ project_id: projectId });
        const requests = allRequests.filter(r => requestIds.includes(r.id));

        if (requests.length === 0) {
            return Response.json({ error: 'No requests found' }, { status: 404 });
        }

        // Get all active client accesses for this project
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: projectId,
            access_status: 'active'
        });

        if (accesses.length === 0) {
            return Response.json({ message: 'No active clients found' });
        }

        // Fetch all client contacts
        const clientContactIds = accesses.map(a => a.client_contact_id);
        const contactPromises = clientContactIds.map(id => 
            base44.asServiceRole.entities.ClientContact.filter({ id })
        );
        const contactResults = await Promise.all(contactPromises);
        const contacts = contactResults.flat().filter(Boolean);

        if (contacts.length === 0) {
            return Response.json({ message: 'No client contacts found' });
        }

        const clientPortalBaseUrl = 'https://akclient.base44.app';
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        
        if (!resendApiKey) {
            return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }

        // Build items list HTML
        const itemsListHtml = requests.map(r => `
            <li style="margin-bottom: 12px; padding: 12px; background-color: #f9f9f9; border-left: 4px solid #c00;">
                <strong style="color: #333;">${r.title}</strong>
                <br><span style="color: #666; font-size: 14px;">${r.request_type?.replace('_', ' ') || 'Review'}</span>
            </li>
        `).join('');

        const itemsListText = requests.map(r => `- ${r.title} (${r.request_type?.replace('_', ' ') || 'Review'})`).join('\n');

        // Send personalized email to each client
        const emailPromises = contacts.map(async (contact) => {
            const access = accesses.find(a => a.client_contact_id === contact.id);
            if (!access) return null;

            // Build the portal URL
            let portalUrl;
            if (contact.url_slug) {
                portalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${projectId}&slug=${contact.url_slug}`;
            } else if (access.url_slug) {
                portalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${projectId}&slug=${access.url_slug}`;
            } else if (access.share_token) {
                portalUrl = `${clientPortalBaseUrl}/ClientProjectPortal?projectId=${projectId}&token=${access.share_token}`;
            } else {
                console.warn(`No slug or token for contact ${contact.id}, skipping email`);
                return null;
            }

            const subject = `Achtung Kraft // ${requests.length} ITEMS NEED YOUR REVIEW: ${project.name}`;

            const htmlBody = `
<h1 style="margin: 0 0 8px 0; color: #c00; font-size: 24px;">PROJECT: ${project.name}</h1>
<h2 style="margin: 0 0 20px 0; color: #333; font-size: 18px; font-weight: normal;">${requests.length} ITEMS NEED YOUR REVIEW</h2>

<p>Hi ${contact.name},</p>

<p>You have <strong>${requests.length} item${requests.length > 1 ? 's' : ''}</strong> that need your review:</p>

<ul style="list-style: none; padding: 0; margin: 20px 0;">
${itemsListHtml}
</ul>

<p style="margin: 30px 0;">
<a href="${portalUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
VIEW ALL ITEMS
</a>
</p>

<p style="color: #666; font-size: 14px;">
Direct link: <a href="${portalUrl}" style="color: #3b82f6;">${portalUrl}</a>
</p>

<p>
— Achtung Kraft Projects
</p>
`;

            const textBody = `
PROJECT: ${project.name}
${requests.length} ITEMS NEED YOUR REVIEW

Hi ${contact.name},

You have ${requests.length} item${requests.length > 1 ? 's' : ''} that need your review:

${itemsListText}

View all items here:
${portalUrl}

— Achtung Kraft Projects
`;

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
                return { contact: contact.email, success: false, error: errorData };
            }

            const emailData = await emailResponse.json();
            console.log(`Bulk review email sent to ${contact.email} for project ${projectId}. ID: ${emailData.id}`);
            return { contact: contact.email, success: true, emailId: emailData.id };
        });

        const results = await Promise.all(emailPromises);
        const successfulEmails = results.filter(r => r && r.success);

        // Update last_email_sent_at for all requests
        const now = new Date().toISOString();
        const updatePromises = requestIds.map(id => 
            base44.asServiceRole.entities.ClientFeedbackRequest.update(id, { last_email_sent_at: now })
        );
        await Promise.all(updatePromises);

        return Response.json({ 
            success: true, 
            emailsSent: successfulEmails.length,
            requestsUpdated: requestIds.length,
            results: results.filter(Boolean)
        });

    } catch (error) {
        console.error("Error in sendBulkReviewEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});