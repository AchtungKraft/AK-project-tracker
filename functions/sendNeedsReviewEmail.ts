import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Default templates
const DEFAULT_TEMPLATES = {
    needs_review: {
        subject: "Achtung Kraft // REVIEW NEEDED: {request_title}",
        body_intro: "You have a new item that requires your review:",
        button_text: "VIEW & APPROVE REQUEST",
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
        .replace(/{request_title}/g, data.request_title || '')
        .replace(/{request_body}/g, data.request_body || '')
        .replace(/{client_name}/g, data.client_name || '')
        .replace(/{client_slug}/g, data.client_slug || '');
}

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

        // Fetch email template
        const templates = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: 'needs_review' });
        const savedTemplate = templates[0];
        const defaultTpl = DEFAULT_TEMPLATES.needs_review;

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

        const clientPortalBaseUrl = 'https://akclient.base44.app';
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        
        if (!resendApiKey) {
            console.error("RESEND_API_KEY not set");
            return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
        }

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

            // Build the direct request URL with slug or token
            let requestDetailUrl;
            if (contact.url_slug) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&slug=${contact.url_slug}`;
            } else if (access.url_slug) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&slug=${access.url_slug}`;
            } else if (access.share_token) {
                requestDetailUrl = `${clientPortalBaseUrl}/ClientFeedbackRequestDetail?id=${request.id}&token=${access.share_token}`;
            } else {
                console.warn(`No slug or token for contact ${contact.id}, skipping email`);
                results.push(null);
                continue;
            }

            // Prepare placeholder data
            const placeholderData = {
                project_name: project.name,
                request_title: request.title,
                request_body: request.body || 'No description provided.',
                client_name: contact.name,
                client_slug: clientSlug
            };

            // Get template values
            const subjectTemplate = savedTemplate?.subject_template || defaultTpl.subject;
            const bodyIntro = savedTemplate?.body_intro || defaultTpl.body_intro;
            const buttonText = savedTemplate?.button_text || defaultTpl.button_text;
            const closingText = savedTemplate?.closing_text || defaultTpl.closing_text;

            // Replace placeholders
            const subject = replacePlaceholders(subjectTemplate, placeholderData);
            const intro = replacePlaceholders(bodyIntro, placeholderData);
            const closing = replacePlaceholders(closingText, placeholderData);

            const htmlBody = `
<h1 style="margin: 0 0 8px 0; color: #c00; font-size: 24px;">PROJECT: ${project.name}</h1>
<h2 style="margin: 0 0 20px 0; color: #333; font-size: 18px; font-weight: normal;">REVIEW NEEDED: ${request.title}</h2>

<p>Hi ${contact.name},</p>

<p>${intro}</p>

<div style="background-color: #f9f9f9; border-left: 4px solid #c00; padding: 16px; margin: 20px 0;">
    <h3 style="margin: 0 0 8px 0; color: #c00;">${request.title}</h3>
    <p style="margin: 0; color: #333; white-space: pre-wrap;">${request.body || 'No description provided.'}</p>
</div>

<p style="margin: 30px 0;">
<a href="${requestDetailUrl}" style="display: inline-block; background-color: #c00; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
${buttonText}
</a>
</p>

<p style="color: #666; font-size: 14px;">
Direct link: <a href="${requestDetailUrl}" style="color: #3b82f6;">${requestDetailUrl}</a>
</p>

${clientSlug ? `<p style="color: #666; font-size: 14px;">Your portal code: <strong>${clientSlug}</strong></p>` : ''}

<p>
${closing}
</p>
`;

            const textBody = `
PROJECT: ${project.name}
REVIEW NEEDED: ${request.title}

Hi ${contact.name},

${intro}

${request.title}
${request.body || 'No description provided.'}

View and approve the request here:
${requestDetailUrl}

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
                    console.log(`Email sent to ${contact.email} for Request ${requestId}. ID: ${emailData.id}`);
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

        // Update last_email_sent_at on the request
        if (successfulEmails.length > 0) {
            await base44.asServiceRole.entities.ClientFeedbackRequest.update(requestId, { 
                last_email_sent_at: new Date().toISOString() 
            });
        }

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