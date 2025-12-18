import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Parse payload
        const { requestId } = await req.json();

        if (!requestId) {
            return Response.json({ error: 'Missing requestId' }, { status: 400 });
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

        // Get all active client accesses for this project
        const accesses = await base44.asServiceRole.entities.ProjectClientAccess.filter({ 
            project_id: request.project_id,
            access_status: 'active'
        });

        if (accesses.length === 0) {
            console.log(`No active client accesses found for project ${project.id}. Skipping email.`);
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
            console.log(`No client contacts found for project ${project.id}. Skipping email.`);
            return Response.json({ message: 'No client contacts found' });
        }

        const appBaseUrl = Deno.env.get("APP_BASE_URL") || 'https://projects.achtungkraft.com';
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        
        if (!resendApiKey) {
            console.error("RESEND_API_KEY not set");
            return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }

        // Send personalized email to each client
        const emailPromises = contacts.map(async (contact) => {
            // Find the access record for this contact
            const access = accesses.find(a => a.client_contact_id === contact.id);
            if (!access) return null;

            // Build personalized portal URL
            let portalUrl;
            if (access.url_slug) {
                portalUrl = `${appBaseUrl}/ClientProjectPortal?slug=${access.url_slug}`;
            } else if (access.share_token) {
                portalUrl = `${appBaseUrl}/ClientProjectPortal?token=${access.share_token}`;
            } else {
                console.warn(`No slug or token for access ${access.id}, skipping email to ${contact.email}`);
                return null;
            }

            // Build request detail URL
            const requestDetailUrl = access.url_slug 
                ? `${appBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&slug=${access.url_slug}`
                : `${appBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&token=${access.share_token}`;

            // Fetch attachments for the request (most recent post)
            const requestAttachments = await base44.asServiceRole.entities.ClientFeedbackAttachment.filter({ 
                request_id: request.id 
            });
            const images = requestAttachments.filter(a => a.attachment_type === 'image' && !a.comment_id).slice(0, 6);

            const subject = `Achtung Kraft // REVIEW NEEDED ${request.title}`;
            
            const imagesHtml = images.length > 0 ? `
<div style="margin: 20px 0;">
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
        ${images.map(img => `
            <div>
                <img src="${img.file_url}" alt="" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; border: 2px solid #ddd;" />
            </div>
        `).join('')}
    </div>
</div>
` : '';

            const htmlBody = `
<p>Hi ${contact.name},</p>

<p>You have a new item that requires your review:</p>

<p><strong>Project: ${project.name}</strong></p>

<div style="background-color: #f9f9f9; border-left: 4px solid #c00; padding: 16px; margin: 20px 0;">
    <h3 style="margin: 0 0 8px 0; color: #c00;">${request.title}</h3>
    <p style="margin: 0; color: #333; white-space: pre-wrap;">${request.body || ''}</p>
</div>

${imagesHtml}

<p style="margin: 30px 0;">
<a href="${requestDetailUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
VIEW REQUEST
</a>
</p>

<p style="color: #666; font-size: 14px;">
Or access your full project portal here:<br/>
<a href="${portalUrl}" style="color: #3b82f6;">${portalUrl}</a>
</p>

<p>
— Achtung Kraft Projects
</p>
`;

            const textBody = `
Hi ${contact.name},

You have a new item that requires your review:

Project: ${project.name}

${request.title}
${request.body || ''}

View the request here:
${requestDetailUrl}

Or access your full project portal:
${portalUrl}

— Achtung Kraft Projects
`;

            // Send individual email
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
            console.log(`Email sent to ${contact.email} for Request ${requestId}. ID: ${emailData.id}`);
            return { contact: contact.email, success: true, emailId: emailData.id };
        });

        const results = await Promise.all(emailPromises);
        const successfulEmails = results.filter(r => r && r.success);

        return Response.json({ 
            success: true, 
            emailsSent: successfulEmails.length,
            results: results.filter(Boolean)
        });

    } catch (error) {
        console.error("Error in sendNeedsReviewEmail:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});